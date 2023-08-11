// ======== Importations ========
const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const winston = require('winston');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github').Strategy;
const Redis = require('ioredis');
const RedisStore = require('connect-redis')(session);



// Configuration des fichiers d'environnement
require('dotenv').config({ path: './token.env' });
require('dotenv').config({ path: './github.env' });
require('dotenv').config({ path: './redis.env' });
require('dotenv').config({ path: './session_secret.env' });

// ======== Variables d'environnement ========
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

// ======== Configuration Redis ========
const client = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
});

client.on('connect', function() {
    console.log('Connecté à Redis');
});

client.on('error', function(err) {
    console.error('Erreur Redis:', err);
});


// ======== Configuration de Winston (Logging) ========
const logger = winston.createLogger({
     level: 'info',
     format: winston.format.json(),
     defaultMeta: { service: 'user-service' },
     transports: [
         new winston.transports.File({ filename: 'log.json' }),
         new winston.transports.Console()
     ],
 });

// ======== Configuration Express ========
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static(__dirname));
app.use(express.static('public'));

// ======== Configuration des sessions Express ========
app.use(session({
    store: new RedisStore({ client: client }),  // Utilisez l'instance client ici
    secret: process.env.SESSION_SECRET,
    name: 'sessionId', // nom du cookie
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',  // assurez-vous que le cookie est seulement utilisé sur https
        httpOnly: true, // empêche l'accès au cookie depuis JavaScript côté client
        maxAge: 1000 * 60 * 60 * 24 * 7  // cookie valable pour 7 jours
    }
}));

// ======== Configuration de Passport ========
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Stratégie GitHub
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    }, async (accessToken, refreshToken, profile, done) => {
        // Vérification si l'utilisateur est autorisé via Redis
        client.sismember('allowedUsers', profile.username, function(err, reply) {
            if (reply === 1) {
                logger.info(`User: ${profile.username}, Authenticated successfully via GitHub`);
                done(null, profile);
            } else {
                logger.info(`User: ${profile.username}, Failed to authenticate via GitHub`);
                done(new Error('User not authorized'));
            }
        });
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
 const owner = process.env.GITHUB_OWNER;
 const repo = process.env.GITHUB_REPO;
 const path = process.env.GITHUB_PATH;
 const fileURL = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
 let errors = [];
 
 // Nombre d'erreurs par page pour la pagination
 const perPage = 3;  
 
 // Initialise l'id de la prochaine erreur
 let nextErrorId = 1;  
 
// ======== Configuration des Route ========
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

app.get('/filter', async (req, res) => {
   const category = req.query.category;
   if (!category) {
       res.render('index', { 
           errors: errors, 
           nextErrorId: errors.length + 1,
           totalPages: Math.ceil(errors.length / 3)  
       });
       return;
   }

   const filteredErrors = errors.filter(error => error.category === category);
   const totalPages = Math.ceil(filteredErrors.length / 3);

   res.render('index', { 
       errors: filteredErrors, 
       nextErrorId: Math.max(...errors.map(error => error.id)) + 1,
       totalPages: totalPages
   });
});

// ======== Démarrage du serveur ========
app.listen(443, () => logger.info('App is listening on port 443'));
