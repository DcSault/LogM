# 🚀 LogM - Gestionnaire d'Erreurs

Un outil simple pour enregistrer et gérer les erreurs. Suivez facilement les détails de chaque erreur, ajoutez de nouvelles erreurs, filtrez par catégorie, et modifiez ou supprimez des entrées existantes.

## 📦 Fonctionnalités

- 🛡️ **Authentification via GitHub**.
- 📝 **Ajout, édition et suppression d'erreurs**.
- 🔍 **Filtrage des erreurs par catégorie**.
- ⚡️ **Stockage rapide et fiable** des données avec Redis ou GitHub.
- 📊 **Pagination** pour la gestion d'un grand nombre d'erreurs.

## 📂 Structure du projet

```plaintext
📂 public
  📂 stylesheets
    📄 style.css
📂 views
  📄 index.ejs
📄 .gitignore
📄 dépendance
📄 log.json
📄 package-lock.json
📄 package.json
📄 README.md
📄 server.js
```

## 🖥 Fonctionnalités principales

### HTML 🌐
L'interface permet à l'utilisateur :
- **Voir** une liste d'erreurs.
- **Ajouter** une nouvelle erreur via un formulaire.
- **Filtrer** les erreurs par catégorie.
- **Modifier ou supprimer** des erreurs existantes.
- **Naviguer** entre différentes pages de la liste d'erreurs via une pagination.

### JavaScript 🧠
- **Réinitialisation du filtre** : En cliquant sur le bouton "Supprimer les filtres", la page est rechargée, réinitialisant ainsi tous les filtres appliqués.
- **Modification d'une erreur** : Chaque erreur dispose d'un bouton "Modifier" qui, lorsqu'il est cliqué, affiche un formulaire permettant de mettre à jour les détails de l'erreur.

## 🎨 Styles de l'application

### Styles globaux 🌍
- **Police par défaut** : Segoe UI.
- **Palette de couleurs** : Utilisation de couleurs douces et de dégradés.
- **Interactivité** : Effets de survol sur les boutons.
- **Champs de saisie** : Conçus pour un confort visuel.

### Boîte d'erreur 🚫
- **Style Glassmorphism** : Fond légèrement transparent.
- **Effet au survol** : Léger "lift".

### Pagination 📄
- **Design clair** : Boutons clairement définis.
- **Interactivité** : Effet de survol sur chaque bouton.

📜 Pour plus de détails, consultez le fichier [style.css](./public/stylesheets/style.css).

## 🛠 Installation & Configuration

### Prérequis
- Node.js.

### Installation des dépendances
1. Clonez le projet.
2. Ouvrez un terminal dans le dossier du projet.
3. Installez les dépendances avec :

```bash
npm install
```

💡 Utilisation
Lancez le serveur :

```
node server.js
```
Ouvrez votre navigateur à http://localhost:<port>
Utilisez l'application !

