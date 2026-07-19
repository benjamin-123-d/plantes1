// server.js
// Point d'entrée complet : configuration Express, sessions, routes, CRON

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const methodOverride = require('method-override');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const cron = require('node-cron');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Import DB
const { db, dbRun, dbAll, dbGet } = require('./db');

// Import middlewares
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// CONFIGURATION MULTER (upload images)
// ============================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 } 
});

// ============================================================================
// CONFIGURATION EXPRESS & VUES
// ============================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// SESSIONS
// ============================================================================
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 heures
  }
}));

// ============================================================================
// CSRF PROTECTION
// ============================================================================
app.use(csrf());

// Rendre disponibles dans les vues
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  res.locals.csrfToken = req.csrfToken();
  req.session.flash = null;
  next();
});

// ============================================================================
// HELPERS
// ============================================================================
async function logAction(userId, action, description) {
  await dbRun('INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
    [userId || null, action, description || '']);
}

async function getStock(produitId) {
  const row = await dbGet(`
    SELECT COALESCE(SUM(CASE WHEN type IN ('entree','ajustement') THEN quantite ELSE 0 END),0) -
           COALESCE(SUM(CASE WHEN type IN ('sortie','vente') THEN quantite ELSE 0 END),0) as stock
    FROM mouvements_stock WHERE produit_id = ?`, [produitId]);
  return row ? row.stock : 0;
}

async function getSoldeCaisse() {
  const row = await dbGet(`
    SELECT COALESCE(SUM(CASE WHEN type = 'entree' THEN montant ELSE 0 END),0) -
           COALESCE(SUM(CASE WHEN type = 'sortie' THEN montant ELSE 0 END),0) as solde
    FROM mouvements_caisse`);
  return row ? row.solde : 0;
}

// ============================================================================
// CRON - CLÔTURE AUTOMATIQUE 23h00
// ============================================================================
cron.schedule('0 23 * * *', async () => {
  console.log('🕐 Clôture automatique déclenchée...');
  try {
    const solde = await getSoldeCaisse();
    if (solde === 0) {
      console.log('✅ Solde déjà à 0');
      return;
    }
    const today = new Date().toLocaleDateString('fr-FR');
    const admin = await dbGet("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    const adminId = admin ? admin.id : null;
    const type = solde > 0 ? 'sortie' : 'entree';
    const montant = Math.abs(solde);
    
    await dbRun(`INSERT INTO mouvements_caisse (type, montant, motif, est_cloture, user_id, commentaire)
      VALUES (?, ?, ?, 1, ?, ?)`,
      [type, montant, `Clôture automatique du ${today}`, adminId, 'Clôture auto 23h00']);
    
    await logAction(adminId, 'Clôture automatique', `Solde ajusté : ${solde} FCFA`);
    console.log('✅ Clôture effectuée');
  } catch (e) {
    console.error('❌ Erreur clôture:', e.message);
  }
});

// ============================================================================
// ROUTES AUTH
// ============================================================================
app.get('/login', (req, res) => {
  res.render('login', { hideNav: true });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      req.session.flash = { type: 'error', message: 'Email ou mot de passe incorrect.' };
      return res.redirect('/login');
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      req.session.flash = { type: 'error', message: 'Email ou mot de passe incorrect.' };
      return res.redirect('/login');
    }
    req.session.user = { id: user.id, email: user.email, role: user.role };
    await logAction(user.id, 'Connexion', `Connexion via ${email}`);
    req.session.flash = { type: 'success', message: `Bienvenue ${user.email}!` };
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Erreur login:', err);
    req.session.flash = { type: 'error', message: 'Erreur serveur.' };
    res.redirect('/login');
  }
});

app.get('/logout', (req, res) => {
  if (req.session.user) {
    logAction(req.session.user.id, 'Déconnexion', 'Déconnexion');
  }
  req.session.destroy();
  res.redirect('/login');
});

// ============================================================================
// ROUTES DASHBOARD
// ============================================================================
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const produits = await dbAll('SELECT * FROM produits WHERE actif = 1 ORDER BY nom');
    for (const p of produits) {
      p.stock = await getStock(p.id);
      p.alerte = p.stock <= p.seuil_alerte;
    }
    const solde = await getSoldeCaisse();
    const totalVentes = await dbGet("SELECT COUNT(*) as c FROM mouvements_stock WHERE type = 'vente'");
    const caJour = await dbGet(`
      SELECT COALESCE(SUM(quantite * COALESCE(prix_vente_effectif, 0)), 0) as ca
      FROM mouvements_stock WHERE type = 'vente' AND date(date_mouvement) = date('now')`);
    
    res.render('dashboard', { 
      produits, 
      solde, 
      totalVentes: totalVentes.c, 
      caJour: caJour.ca || 0
    });
  } catch (e) {
    console.error('Erreur dashboard:', e);
    req.session.flash = { type: 'error', message: 'Erreur chargement dashboard.' };
    res.redirect('/login');
  }
});

app.get('/', requireAuth, (req, res) => {
  res.redirect('/dashboard');
});

// ============================================================================
// ROUTES PRODUITS (CRUD - ADMIN)
// ============================================================================
app.get('/produits', requireAuth, requireAdmin, async (req, res) => {
  try {
    const q = req.query.q || '';
    let sql = 'SELECT * FROM produits WHERE actif = 1';
    const params = [];
    if (q) {
      sql += ' AND (nom LIKE ? OR reference LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY nom';
    const produits = await dbAll(sql, params);
    for (const p of produits) {
      p.stock = await getStock(p.id);
      p.alerte = p.stock <= p.seuil_alerte;
    }
    res.render('produits', { produits, q });
  } catch (e) {
    console.error('Erreur produits:', e);
    req.session.flash = { type: 'error', message: 'Erreur chargement produits.' };
    res.redirect('/dashboard');
  }
});

app.get('/produits/nouveau', requireAuth, requireAdmin, (req, res) => {
  res.render('produit-form', { produit: null });
});

app.post('/produits', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { reference, nom, seuil_alerte, prix_achat, prix_vente } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    
    await dbRun(`INSERT INTO produits (reference, nom, seuil_alerte, prix_achat, prix_vente, image)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [reference, nom, parseInt(seuil_alerte) || 5, parseFloat(prix_achat) || 0, parseFloat(prix_vente) || 0, image]);
    
    await logAction(req.session.user.id, 'Création produit', nom);
    req.session.flash = { type: 'success', message: 'Produit créé avec succès.' };
    res.redirect('/produits');
  } catch (err) {
    console.error('Erreur création produit:', err);
    req.session.flash = { type: 'error', message: 'Erreur création produit.' };
    res.redirect('/produits');
  }
});

// ============================================================================
// ROUTES VENTE
// ============================================================================
app.get('/vente', requireAuth, async (req, res) => {
  try {
    const produits = await dbAll('SELECT * FROM produits WHERE actif = 1 ORDER BY nom');
    for (const p of produits) {
      p.stock = await getStock(p.id);
    }
    res.render('vente', { produits });
  } catch (e) {
    console.error('Erreur vente:', e);
    req.session.flash = { type: 'error', message: 'Erreur chargement vente.' };
    res.redirect('/dashboard');
  }
});

app.post('/vente', requireAuth, async (req, res) => {
  try {
    const { produit_id, quantite, prix_vente_effectif, commentaire, date_mouvement } = req.body;
    const qte = parseInt(quantite);
    const stock = await getStock(produit_id);
    
    if (stock < qte) {
      req.session.flash = { type: 'error', message: `Stock insuffisant (disponible: ${stock})` };
      return res.redirect('/vente');
    }
    
    const produit = await dbGet('SELECT * FROM produits WHERE id = ?', [produit_id]);
    const prix = parseFloat(prix_vente_effectif) || produit.prix_vente;
    const total = qte * prix;
    const dateMvt = date_mouvement || new Date().toISOString();

    // TRANSACTION ATOMIQUE
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(`INSERT INTO mouvements_stock (type, produit_id, quantite, prix_vente_effectif, date_mouvement, user_id, commentaire)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['vente', produit_id, qte, prix, dateMvt, req.session.user.id, commentaire || ''],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            const venteId = this.lastID;
            db.run(`INSERT INTO mouvements_caisse (type, montant, motif, est_lie_vente, vente_id, user_id)
              VALUES (?, ?, ?, 1, ?, ?)`,
              ['entree', total, `Vente: ${produit.nom} (x${qte})`, venteId, req.session.user.id],
              function(err2) {
                if (err2) {
                  db.run('ROLLBACK');
                  return reject(err2);
                }
                db.run('COMMIT', (err3) => {
                  if (err3) {
                    db.run('ROLLBACK');
                    return reject(err3);
                  }
                  resolve(venteId);
                });
              });
          });
      });
    });

    await logAction(req.session.user.id, 'Vente', `${produit.nom} x${qte} = ${total} FCFA`);
    req.session.flash = { type: 'success', message: `Vente enregistrée : ${total.toLocaleString('fr-FR')} FCFA` };
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Erreur vente:', err);
    req.session.flash = { type: 'error', message: 'Erreur enregistrement vente.' };
    res.redirect('/vente');
  }
});

// ============================================================================
// ROUTES STOCK
// ============================================================================
app.get('/stock', requireAuth, async (req, res) => {
  try {
    const produits = await dbAll('SELECT * FROM produits WHERE actif = 1 ORDER BY nom');
    for (const p of produits) {
      p.stock = await getStock(p.id);
    }
    res.render('stock', { produits });
  } catch (e) {
    console.error('Erreur stock:', e);
    req.session.flash = { type: 'error', message: 'Erreur chargement stock.' };
    res.redirect('/dashboard');
  }
});

app.post('/stock/entree', requireAuth, async (req, res) => {
  try {
    const { produit_id, quantite, prix_achat_unitaire, date_mouvement, payer_caisse, commentaire } = req.body;
    const qte = parseInt(quantite);
    const produit = await dbGet('SELECT * FROM produits WHERE id = ?', [produit_id]);
    const prixUnit = parseFloat(prix_achat_unitaire) || produit.prix_achat;
    const total = qte * prixUnit;
    const dateMvt = date_mouvement || new Date().toISOString();

    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(`INSERT INTO mouvements_stock (type, produit_id, quantite, date_mouvement, user_id, commentaire)
          VALUES (?, ?, ?, ?, ?, ?)`,
          ['entree', produit_id, qte, dateMvt, req.session.user.id, commentaire || ''],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            if (payer_caisse) {
              db.run(`INSERT INTO mouvements_caisse (type, montant, motif, user_id, commentaire)
                VALUES (?, ?, ?, ?, ?)`,
                ['sortie', total, `Achat stock: ${produit.nom}`, req.session.user.id, commentaire || ''],
                function(err2) {
                  if (err2) {
                    db.run('ROLLBACK');
                    return reject(err2);
                  }
                  db.run('COMMIT', (err3) => {
                    if (err3) {
                      db.run('ROLLBACK');
                      return reject(err3);
                    }
                    resolve();
                  });
                });
            } else {
              db.run('COMMIT', (err3) => {
                if (err3) {
                  db.run('ROLLBACK');
                  return reject(err3);
                }
                resolve();
              });
            }
          });
      });
    });

    await logAction(req.session.user.id, 'Entrée stock', `${produit.nom} +${qte}`);
    req.session.flash = { type: 'success', message: 'Entrée stock enregistrée.' };
    res.redirect('/stock');
  } catch (err) {
    console.error('Erreur entrée stock:', err);
    req.session.flash = { type: 'error', message: 'Erreur entrée stock.' };
    res.redirect('/stock');
  }
});

app.post('/stock/sortie', requireAuth, async (req, res) => {
  try {
    const { produit_id, quantite, motif, date_mouvement, commentaire } = req.body;
    const qte = parseInt(quantite);
    const stock = await getStock(produit_id);
    
    if (stock < qte) {
      req.session.flash = { type: 'error', message: `Stock insuffisant (disponible: ${stock})` };
      return res.redirect('/stock');
    }
    
    const dateMvt = date_mouvement || new Date().toISOString();
    await dbRun(`INSERT INTO mouvements_stock (type, produit_id, quantite, date_mouvement, user_id, commentaire)
      VALUES (?, ?, ?, ?, ?, ?)`,
      ['sortie', produit_id, qte, dateMvt, req.session.user.id, `${motif || 'Autre'} - ${commentaire || ''}`]);
    
    const produit = await dbGet('SELECT nom FROM produits WHERE id = ?', [produit_id]);
    await logAction(req.session.user.id, 'Sortie stock', `${produit.nom} -${qte} (${motif})`);
    
    req.session.flash = { type: 'success', message: 'Sortie stock enregistrée.' };
    res.redirect('/stock');
  } catch (err) {
    console.error('Erreur sortie stock:', err);
    req.session.flash = { type: 'error', message: 'Erreur sortie stock.' };
    res.redirect('/stock');
  }
});

// ============================================================================
// ROUTES CAISSE
// ============================================================================
app.get('/caisse', requireAuth, async (req, res) => {
  try {
    const solde = await getSoldeCaisse();
    const historique = await dbAll(`
      SELECT mc.*, u.email as user_email
      FROM mouvements_caisse mc
      LEFT JOIN users u ON mc.user_id = u.id
      ORDER BY mc.date_mouvement DESC LIMIT 100`);
    const clotures = await dbAll(`
      SELECT mc.*, u.email as user_email
      FROM mouvements_caisse mc
      LEFT JOIN users u ON mc.user_id = u.id
      WHERE mc.est_cloture = 1 ORDER BY mc.date_mouvement DESC`);
    
    res.render('caisse', { solde, historique, clotures });
  } catch (e) {
    console.error('Erreur caisse:', e);
    req.session.flash = { type: 'error', message: 'Erreur chargement caisse.' };
    res.redirect('/dashboard');
  }
});

app.post('/caisse/entree', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { montant, motif, commentaire } = req.body;
    await dbRun(`INSERT INTO mouvements_caisse (type, montant, motif, user_id, commentaire)
      VALUES (?, ?, ?, ?, ?)`,
      ['entree', parseFloat(montant), motif, req.session.user.id, commentaire || '']);
    
    await logAction(req.session.user.id, 'Entrée caisse', `${montant} FCFA - ${motif}`);
    req.session.flash = { type: 'success', message: 'Entrée caisse enregistrée.' };
    res.redirect('/caisse');
  } catch (err) {
    console.error('Erreur entrée caisse:', err);
    req.session.flash = { type: 'error', message: 'Erreur entrée caisse.' };
    res.redirect('/caisse');
  }
});

app.post('/caisse/sortie', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { montant, motif, commentaire } = req.body;
    await dbRun(`INSERT INTO mouvements_caisse (type, montant, motif, user_id, commentaire)
      VALUES (?, ?, ?, ?, ?)`,
      ['sortie', parseFloat(montant), motif, req.session.user.id, commentaire || '']);
    
    await logAction(req.session.user.id, 'Sortie caisse', `${montant} FCFA - ${motif}`);
    req.session.flash = { type: 'success', message: 'Sortie caisse enregistrée.' };
    res.redirect('/caisse');
  } catch (err) {
    console.error('Erreur sortie caisse:', err);
    req.session.flash = { type: 'error', message: 'Erreur sortie caisse.' };
    res.redirect('/caisse');
  }
});

// ============================================================================
// API JSON (pour autocomplétion)
// ============================================================================
app.get('/api/produits', requireAuth, async (req, res) => {
  try {
    const produits = await dbAll('SELECT * FROM produits WHERE actif = 1 ORDER BY nom');
    for (const p of produits) {
      p.stock = await getStock(p.id);
    }
    res.json(produits);
  } catch (e) {
    console.error('Erreur API produits:', e);
    res.json([]);
  }
});

// ============================================================================
// GESTION DES ERREURS
// ============================================================================
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('error', { 
      message: 'Formulaire invalide ou expiré (erreur CSRF). Veuillez réessayer.' 
    });
  }
  console.error('Erreur:', err);
  res.status(500).render('error', { message: 'Une erreur serveur est survenue.' });
});

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page non trouvée.' });
});

// ============================================================================
// DÉMARRAGE
// ============================================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Serveur SmartStock démarré sur http://localhost:${PORT}`);
  console.log(`📍 Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log('\n🔐 Comptes de test :');
  console.log('   Admin        : admin@example.com / admin123');
  console.log('   Collaborateur: collab@example.com / collab123\n');
});

module.exports = app;
