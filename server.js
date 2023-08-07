 // Importe les dépendances nécessaires
 require('dotenv').config({ path: './token.env' }); // Charge les variables d'environnement du fichier '.env'
 const express = require('express'); // Framework web pour Node.js
 const axios = require('axios'); // Client HTTP basé sur les promesses
 const bodyParser = require('body-parser'); // Middleware pour analyser le corps des requêtes entrantes
 const ejs = require('ejs'); // Moteur de template pour générer du HTML
 const os = require('os'); // Module de Node.js pour interagir avec le système d'exploitation
 const winston = require('winston'); // Bibliothèque de logging
 const session = require('express-session');
 const passport = require('passport');
 const GitHubStrategy = require('passport-github').Strategy;
 
 // Les variables d'environnement
 const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
 const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
 const CALLBACK_URL = process.env.CALLBACK_URL; 
 
 // List d'utilisateur autoriser 
 const allowedUsers = ['DcSault', 'username2']; 
 
 // Crée une instance de winston pour le logging
 const logger = winston.createLogger({
     level: 'info',
     format: winston.format.json(),
     defaultMeta: { service: 'user-service' },
     transports: [
         new winston.transports.File({ filename: 'log.json' }), // Log vers un fichier
         new winston.transports.Console() // Log vers la console
     ],
 });
 
 // Crée une instance d'express
 const app = express();
 app.use(bodyParser.json()); // Pour analyser les corps de requêtes en JSON
 app.use(bodyParser.urlencoded({ extended: true })); // Pour analyser les corps de requêtes en URL encodé
 app.set('view engine', 'ejs'); // Définit ejs comme moteur de template
 app.use(express.static(__dirname));  // Sert les fichiers statiques
 app.use(express.static('public'));  // Sert les fichiers statiques dans le dossier 'public'
 
 // Configurer la session express
 app.use(session({
     secret: 'secret',
     resave: false,
     saveUninitialized: false,
 }));
 
 // Configurer Passport
 app.use(passport.initialize());
 app.use(passport.session());
 
 // Sérialisation et désérialisation des utilisateurs pour la session
 passport.serializeUser((user, done) => done(null, user));
 passport.deserializeUser((user, done) => done(null, user));
 
 // Stratégie GitHub
 passport.use(new GitHubStrategy({
     clientID: "9fe69b4fa93a4b0597a4",
     clientSecret: "1d2e822a0bd705cd4223b9e32a22e0b43888e4db",
     callbackURL: "https://logm.onrender.com/auth/github/callback",
 }, async (accessToken, refreshToken, profile, done) => {
     // Vérifier si l'utilisateur est autorisé
     if (allowedUsers.includes(profile.username)) {
         logger.info(`User: ${profile.username}, Authenticated successfully via GitHub`);
         done(null, profile);
     } else {
         logger.info(`User: ${profile.username}, Failed to authenticate via GitHub`);
         done(new Error('User not authorized'));
     }
 }));
 
 app.get('/auth/github', passport.authenticate('github'));
 
 // Callback pour l'authentification GitHub
 app.get('/auth/github/callback',
     passport.authenticate('github', { failureRedirect: '/login' }),
     (req, res) => {
         // Authentification réussie, rediriger vers la page d'accueil
         res.redirect('/');
     }
 );
 
 // Récupère le token GitHub de l'environnement
 const token = process.env.GITHUB_TOKEN;
 
 // Crée les en-têtes pour les requêtes axios vers GitHub
 const headers = { Authorization: `token ${token}` };
 const owner = 'DcSault';
 const repo = 'script_powershell';
 const path = 'LogM/erreur.json';
 const fileURL = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
 let errors = [];
 
 // Nombre d'erreurs par page pour la pagination
 const perPage = 3;  
 
 // Initialise l'id de la prochaine erreur
 let nextErrorId = 1;  
 
 // Route GET pour la page d'accueil
 app.get('/', async (req, res) => {
     // Si l'utilisateur n'est pas authentifié, rediriger vers l'authentification GitHub
     if (!req.user) {
         return res.redirect('/auth/github');
     }
 
     const page = req.query.page ? Number(req.query.page) : 1;
 
     // Récupère les erreurs depuis GitHub
     try {
         const { data: { content } } = await axios.get(fileURL, { headers });
         errors = JSON.parse(Buffer.from(content, 'base64').toString());
         
         // Met à jour nextErrorId pour qu'il soit un de plus que le plus grand id actuel
         if (errors.length > 0) {
             nextErrorId = Math.max(...errors.map(error => Number(error.id))) + 1;
         }
     } catch (error) {
         logger.error(error); // Log l'erreur si une se produit
     }
 
     // Pagination des erreurs
     const offset = (page - 1) * perPage;
     const pagedErrors = errors.slice(offset, offset + perPage);
     const totalPages = Math.ceil(errors.length / perPage);
 
     // Rend le template avec les erreurs paginées et les informations de pagination
     res.render('index', { errors: pagedErrors, totalPages, currentPage: page, nextErrorId });
 });
 
 // Route POST pour ajouter une erreur
app.post('/add-error', async (req, res) => {
    // Si l'utilisateur n'est pas authentifié, rediriger vers l'authentification GitHub
    if (!req.user) {
        return res.redirect('/auth/github');
    }

    // Créez un nouvel objet "error" avec le champ "category" ajouté
    const error = {
        id: nextErrorId++,  // Incrémente l'id
        code: req.body.code,
        description: req.body.description,
        solution: req.body.solution,
        tda: req.body.tda,
        category: req.body.category  // Récupérez la catégorie du formulaire
    };

    errors.push(error); // Ajoute l'erreur à la liste

    // Log l'ajout de l'erreur
    logger.info(`User: ${req.user.username}, Adding error: ${JSON.stringify(error)}`);

    // Met à jour les erreurs sur GitHub
    try {
        const { data: { sha } } = await axios.get(fileURL, { headers });
        await axios.put(fileURL, {
            message: 'Ajouter une nouvelle erreur',
            content: Buffer.from(JSON.stringify(errors, null, 2)).toString('base64'),
            sha,
        }, { headers });
    } catch (error) {
        logger.error(error); // Log l'erreur si une se produit
    }

    // Redirige vers la page d'accueil
    res.redirect('/');
});
 
 // Route POST pour modifier une erreur
app.post('/edit-error', async (req, res) => {
    // Si l'utilisateur n'est pas authentifié, rediriger vers l'authentification GitHub
    if (!req.user) {
        return res.redirect('/auth/github');
    }

    const { code, description, solution, tda, category } = req.body;
    const id = Number(req.body.id);
    const index = errors.findIndex(error => Number(error.id) === id);  // Trouve l'erreur par son id

    // Si l'erreur est trouvée, met à jour l'erreur
    if (index !== -1) {
        errors[index] = { id, code, description, solution, tda, category };
    }

    // Log la modification de l'erreur
    logger.info(`User: ${req.user.username}, Editing error: ${JSON.stringify(errors[index])}`);

    // Met à jour les erreurs sur GitHub
    try {
        const { data: { sha } } = await axios.get(fileURL, { headers });
        await axios.put(fileURL, {
            message: 'Modifier une erreur',
            content: Buffer.from(JSON.stringify(errors, null, 2)).toString('base64'),
            sha,
        }, { headers });
    } catch (error) {
        logger.error(error); // Log l'erreur si une se produit
    }

    // Redirige vers la page d'accueil
    res.redirect('/');
});

 
 // Route POST pour supprimer une erreur
 app.post('/delete-error', async (req, res) => {
     // Si l'utilisateur n'est pas authentifié, rediriger vers l'authentification GitHub
     if (!req.user) {
         return res.redirect('/auth/github');
     }
 
     const { id } = req.body;
     const index = errors.findIndex(error => Number(error.id) == id); // Trouve l'erreur par son id
 
     // Si l'erreur est trouvée, supprime l'erreur de la liste
     if (index !== -1) {
         errors.splice(index, 1);
     }
 
     // Log la suppression de l'erreur
     logger.info(`User: ${req.user.username}, Deleting error: ${JSON.stringify(req.body)}`);
 
     // Met à jour les erreurs sur GitHub
     try {
         const { data: { sha } } = await axios.get(fileURL, { headers });
         await axios.put(fileURL, {
             message: 'Supprimer une erreur',
             content: Buffer.from(JSON.stringify(errors, null, 2)).toString('base64'),
             sha,
         }, { headers });
     } catch (error) {
         logger.error(error); // Log l'erreur si une se produit
     }
 
     // Redirige vers la page d'accueil
     res.redirect('/');
 });
 
 app.get('/filter/:category', async (req, res) => {
    // Si l'utilisateur n'est pas authentifié, rediriger vers l'authentification GitHub
    if (!req.user) {
        return res.redirect('/auth/github');
    }

    const category = req.params.category;
    const filteredErrors = errors.filter(error => error.category === category);

    // Log pour le filtrage des erreurs
    logger.info(`User: ${req.user.username}, Filtering errors by category: ${category}`);

    // Essayez de mettre à jour ou d'obtenir des données si nécessaire (similaire à votre route add, mais cela dépend de votre cas d'utilisation)

    // Redirige vers une vue pour afficher les erreurs filtrées
    // Assumons que vous avez une vue 'errors.ejs' pour afficher les erreurs
    res.render('errors', { errors: filteredErrors });
});

 
 // Démarrer le serveur
 app.listen(443, () => logger.info('App is listening on port 443')); // Log le démarrage du serveur