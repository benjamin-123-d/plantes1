// db.js
// Gestion de la base de données SQLite avec création des tables et seed

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

// Promisify helpers
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function initDB() {
  try {
    // TABLE USERS
    await dbRun(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'collaborateur',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // TABLE PRODUITS
    await dbRun(`CREATE TABLE IF NOT EXISTS produits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      seuil_alerte INTEGER NOT NULL DEFAULT 5,
      prix_achat REAL NOT NULL DEFAULT 0,
      prix_vente REAL NOT NULL DEFAULT 0,
      image TEXT,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // TABLE MOUVEMENTS STOCK
    await dbRun(`CREATE TABLE IF NOT EXISTS mouvements_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      produit_id INTEGER NOT NULL,
      quantite INTEGER NOT NULL,
      prix_vente_effectif REAL,
      date_mouvement DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      commentaire TEXT,
      FOREIGN KEY (produit_id) REFERENCES produits(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // TABLE MOUVEMENTS CAISSE
    await dbRun(`CREATE TABLE IF NOT EXISTS mouvements_caisse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      montant REAL NOT NULL,
      motif TEXT NOT NULL,
      est_lie_vente INTEGER DEFAULT 0,
      vente_id INTEGER,
      est_cloture INTEGER DEFAULT 0,
      date_mouvement DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      commentaire TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // TABLE LOGS (journal d'activité)
    await dbRun(`CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // SEED USERS (créés auto si table vide)
    const count = await dbGet('SELECT COUNT(*) as c FROM users');
    if (count && count.c === 0) {
      const hashAdmin = await bcrypt.hash('admin123', 10);
      const hashCollab = await bcrypt.hash('collab123', 10);
      await dbRun('INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
        ['admin@example.com', hashAdmin, 'admin']);
      await dbRun('INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
        ['collab@example.com', hashCollab, 'collaborateur']);
      console.log('✅ Utilisateurs de test créés');
    }

    console.log('✅ Base de données initialisée');
  } catch (err) {
    console.error('❌ Erreur initialisation DB:', err.message);
  }
}

// Initialiser au démarrage
initDB();

module.exports = { db, dbRun, dbAll, dbGet };
