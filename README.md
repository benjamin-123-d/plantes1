# 🌿 SmartStock - Gestion de Stock & Caisse

**Application complète de gestion de stock et caisse pour petits commerces**

## 📋 Caractéristiques

✅ **Gestion des Produits**
- Création/modification de produits
- Suivi des références
- Prix d'achat et vente
- Seuils d'alerte automatiques
- Upload d'images

✅ **Gestion du Stock**
- Entrées et sorties de stock
- Historique des mouvements
- Alertes automatiques
- Rapports en temps réel

✅ **Gestion de Caisse**
- Enregistrement des ventes
- Entrées/sorties manuelles
- Solde en temps réel
- Clôture automatique à 23h
- Historique complet

✅ **Sécurité**
- Authentification BCrypt
- Sessions sécurisées (24h)
- Protection CSRF
- Rôles Admin/Collaborateur
- Journal d'activité

✅ **Transactions Atomiques**
- Ventes = Mouvement stock + Mouvement caisse
- Intégrité garantie
- Pas de doublons

## 🚀 Installation

### Prérequis
- Node.js >= 18.0.0
- npm ou yarn

### Étapes

```bash
# 1. Cloner le repo
git clone https://github.com/benjamin-123-d/plantes1.git
cd plantes1

# 2. Installer les dépendances
npm install

# 3. Démarrer le serveur
npm start
```

Le serveur démarre sur `http://localhost:3000`

## 🔐 Comptes de Test

**Admin**
- Email: `admin@example.com`
- Mot de passe: `admin123`
- Permissions: Toutes

**Collaborateur**
- Email: `collab@example.com`
- Mot de passe: `collab123`
- Permissions: Ventes & Stock

## 📁 Structure du Projet

```
plantes1/
├── server.js              # Serveur principal & routes
├── db.js                  # Configuration SQLite
├── package.json           # Dépendances
├── render.yaml            # Config Render
├── middleware/
│   └── auth.js            # Middlewares d'authentification
├── views/                 # Vues EJS
│   ├── layout.ejs         # Template de base
│   ├── login.ejs          # Connexion
│   ├── dashboard.ejs      # Tableau de bord
│   ├── vente.ejs          # Nouvelle vente
│   ├── stock.ejs          # Gestion stock
│   ├── caisse.ejs         # Gestion caisse
│   ├── produits.ejs       # Liste produits
│   ├── produit-form.ejs   # Formulaire produit
│   └── error.ejs          # Page erreur
├── public/
│   ├── css/
│   │   └── style.css      # Styles Spring Plants
│   └── uploads/           # Images produits
└── database.db            # SQLite (créée auto)
```

## 🎨 Thème

**Palette Spring Plants:**
- Vert principal: `#4A7C59`
- Vert clair: `#7CB342`
- Beige fond: `#FFF8F0`
- Rouge alerte: `#D32F2F`
- Orange warning: `#F9A825`

## 📊 Routes Disponibles

### Authentification
- `GET /login` - Page de connexion
- `POST /login` - Soumettre connexion
- `GET /logout` - Déconnexion

### Dashboard
- `GET /dashboard` - Tableau de bord (stats en temps réel)
- `GET /` - Redirection vers dashboard

### Produits (Admin)
- `GET /produits` - Liste produits
- `GET /produits/nouveau` - Formulaire création
- `POST /produits` - Créer produit

### Ventes
- `GET /vente` - Formulaire vente
- `POST /vente` - Enregistrer vente (TRANSACTION)

### Stock
- `GET /stock` - Gestion stock
- `POST /stock/entree` - Entrée stock
- `POST /stock/sortie` - Sortie stock

### Caisse (Admin)
- `GET /caisse` - Gestion caisse
- `POST /caisse/entree` - Entrée caisse manuelle
- `POST /caisse/sortie` - Sortie caisse manuelle

### API
- `GET /api/produits` - Liste produits JSON (autocomplétion)

## 🔄 Transactions

### Vente (Atomique)
```
Vente = Entrée Caisse + Sortie Stock
```

### Achat Stock avec Paiement
```
Achat = Entrée Stock + Sortie Caisse
```

## 📅 Automatisations

**Clôture Caisse à 23h00:**
- Vérification du solde
- Si solde ≠ 0 → Création ajustement
- Log automatique de l'action

## 🔒 Sécurité

- ✅ CSRF Protection sur tous les formulaires
- ✅ Sessions HTTPOnly cookies
- ✅ Hachage BCrypt des mots de passe
- ✅ Middleware d'authentification
- ✅ Contrôle d'accès par rôle (RBAC)
- ✅ Journal d'activité complet

## 🌐 Déploiement sur Render

### Étapes

1. **Push sur GitHub** (branche main)
2. **Connecter repo à Render**
3. **Render détecte `render.yaml`** automatiquement
4. **Variables d'environnement** (ajouter dans Render):
   ```
   SESSION_SECRET=ta-cle-ultra-secrete-32-chars-min
   NODE_ENV=production
   ```
5. **Deploy automatique** à chaque push

### URL Render
`https://plantes1.onrender.com`

## 📝 Variables d'Environnement

Copier `.env.example` en `.env`:

```bash
NODE_ENV=production
PORT=3000
SESSION_SECRET=ta-cle-secrete
```

## 🐛 Troubleshooting

### "Database locked"
→ Redémarrer le serveur

### "CSRF token invalid"
→ Vérifier que le token est dans le formulaire: `<input type="hidden" name="_csrf" value="<%= csrfToken %>">` 

### "Stock insuffisant"
→ Vérifier le stock actuel avant la vente

### Produits n'apparaissent pas
→ Vérifier que `actif = 1` en base

## 📞 Support

Pour toute question, créer une issue sur GitHub.

## 📄 License

MIT - Open Source

---

**Made with 💚 for Spring Plants** - v2.0.0