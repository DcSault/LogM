// Importer les dépendances nécessaires
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const winston = require('winston');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github').Strategy;
const Redis = require('ioredis');

// Chargement des fichiers d'environnement
['./token.env', './github.env', './redis.env', './session_secret.env'].forEach(path => {
    require('dotenv').config({ path });
});

// Configuration de Redis
const client = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
});
client.on('connect', () => console.log('Connecté à Redis'));
client.on('error', err => console.error('Erreur Redis:', err));

// Configuration de Winston pour le logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'user-service' },
    transports: [
        new winston.transports.File({ filename: 'log.json' }),
        new winston.transports.Console()
    ],
});

// Configuration d'Express
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static(__dirname));
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
}));

// Configurations Passport et GitHub Strategy
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
    // Vérification dans Redis pour l'autorisation
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

// Routes app.get(), app.post()...
app.get('/auth/github', passport.authenticate('github'));
app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/login' }),
    (req, res) => res.redirect('/')
);

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

app.get('/filter', async (req, res) => {
   // Assumons que vous avez un tableau d'erreurs nommé 'errors'
   const category = req.query.category;

   // Si aucun paramètre de catégorie n'est fourni, renvoyer toutes les erreurs
   if (!category) {
       res.render('index', { 
           errors: errors, 
           nextErrorId: errors.length + 1,
           totalPages: Math.ceil(errors.length / 10)  // 10 est supposé être le nombre d'items par page
       });
       return;
   }

   const filteredErrors = errors.filter(error => error.category === category);
   const totalPages = Math.ceil(filteredErrors.length / 10);  // 10 est supposé être le nombre d'items par page

   res.render('index', { 
       errors: filteredErrors, 
       nextErrorId: Math.max(...errors.map(error => error.id)) + 1,
       totalPages: totalPages
   });
});

app.get('/all-categories', (req, res) => {
   Category.find({}, (err, categories) => { // Pas de filtres appliqués
       if (err) {
           return res.status(500).send(err);
       }
       res.json(categories);
   });
});

// Démarrage du serveur
app.listen(443, () => logger.info('App is listening on port 443'));
