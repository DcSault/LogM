// ======== Importations ========
const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const axios = require('axios');
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
require('dotenv').config({ path: 'ip.env' });

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
    secret: process.env.SESSION_SECRET,  // Assurez-vous d'avoir défini cette variable d'environnement ou remplacez-la par une chaîne de caractères secrète unique
    resave: false,
    saveUninitialized: true,
    store: new RedisStore({ client: client }),
    cookie: {
        secure: false,  // Si vous êtes en HTTPS, mettez cette option à true
        httpOnly: true,  // Assure que le cookie ne peut pas être lu par du JavaScript côté client
        maxAge: 24 * 60 * 60 * 1000  // Durée de vie du cookie en millisecondes (ici, 24 heures)
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
                done(null, profile);
            } else {
                done(new Error('User not authorized'));
            }
        });
    }));
 
 app.get('/auth/github', passport.authenticate('github'));
 
 // Callback pour l'authentification GitHub
 app.get('/auth/github/callback', 
 passport.authenticate('github', { failureRedirect: '/' }),
 (req, res) => {
     if (req.isAuthenticated()) {
         logger.info(`User: ${req.user.username}, Authenticated successfully via GitHub. Session ID: ${req.sessionID}`);
         // Redirigez vers la page d'accueil ou une autre page après authentification
         res.redirect('/');
     } else {
         logger.info(`User: ${req.user.username}, Failed to authenticate via GitHub. Session ID: ${req.sessionID}`);
         res.redirect('/login');
     }
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
 app.set('trust proxy', true);
 app.use((req, res, next) => {
    const ipAddress = req.ip;
    const allowedIps = (process.env.ALLOWED_IPS || "").split(',');
    if (allowedIps.includes(ipAddress)) {
        console.log(`IP autorisée : ${ipAddress}`);
        next();  // Continue vers la prochaine middleware ou route
    } else {
        console.log(`Accès interdit depuis l'IP: ${ipAddress}`);
        next(new Error(`Accès interdit depuis l'IP: ${ipAddress}`));
    }
});

app.use((err, req, res, next) => {
    console.error(err.message);
    if (!res.headersSent) {
        res.status(403).send(err.message); 
    }
});

app.get('/', async (req, res) => {
    // Si l'utilisateur n'est pas authentifié, rediriger vers l'authentification GitHub
    if (!req.user) {
        return res.redirect('/auth/github');
    }

    const page = req.query.page ? Number(req.query.page) : 1;

    // Récupère les erreurs depuis Redis
    client.get('errors', (err, result) => {
        if (err) {
            logger.error(err); // Log l'erreur si une se produit
            return res.status(500).send('Erreur lors de la récupération des erreurs.');
        }

        const allErrors = JSON.parse(result) || [];

        // Filtrer les erreurs selon le service et l'environnement
        const service = req.query.service;
        const environment = req.query.environment;

        let filteredErrors = allErrors;

        if (service) {
            filteredErrors = filteredErrors.filter(error => error.service === service);
        }

        if (environment) {
            filteredErrors = filteredErrors.filter(error => error.environment === environment);
        }

        // Met à jour nextErrorId pour qu'il soit un de plus que le plus grand id actuel
        if (filteredErrors.length > 0) {
            nextErrorId = Math.max(...filteredErrors.map(error => Number(error.id))) + 1;
        }

        // Pagination des erreurs
        const offset = (page - 1) * perPage;
        const pagedErrors = filteredErrors.slice(offset, offset + perPage);
        const totalPages = Math.ceil(filteredErrors.length / perPage);

        // Rend le template avec les erreurs paginées et les informations de pagination
        res.render('index', { errors: pagedErrors, totalPages, currentPage: page, nextErrorId });
    });
});

// Route POST pour ajouter une erreur
app.post('/add-error', async (req, res) => {
    // Vérifie si l'utilisateur est authentifié
    if (!req.user) {
        return res.redirect('/auth/github');
    }

    // Récupère les détails de l'erreur depuis le formulaire et ajoute à la liste
    const error = {
        id: nextErrorId++,
        code: req.body.code,
        description: req.body.description,
        solution: req.body.solution,
        tda: req.body.tda,
        category: req.body.category
    };
    errors.push(error);
 
    // Enregistre l'ajout de l'erreur dans les logs
    logger.info(`User: ${req.user.username}, Added error: ${JSON.stringify(error)}`);

    // Save to Redis
    client.set('errors', JSON.stringify(errors), (err) => {
        if(err) {
            logger.error(`Failed to save errors to Redis: ${err}`);
        }
    });

    // Mise à jour de la liste d'erreurs sur GitHub
    try {
        const { data: { sha } } = await axios.get(fileURL, { headers });
        await axios.put(fileURL, {
            message: 'Added a new error',
            content: Buffer.from(JSON.stringify(errors, null, 2)).toString('base64'),
            sha,
        }, { headers });
    } catch (error) {
        // En cas d'erreur lors de la mise à jour, la log
        logger.error(error);
    }
 
    res.redirect('/');
 });
 
 app.post('/edit-error', (req, res) => {
    redisClient.get('errors', (err, data) => {
        if (err) {
            res.status(500).send({ error: 'Failed to fetch errors from Redis' });
            return;
        }

        const errors = JSON.parse(data || '[]');
        const { id, code, description, solution, tda, category } = req.body;
        const index = errors.findIndex(error => Number(error.id) === Number(id));
        
        if (index !== -1) {
            errors[index] = { id: Number(id), code, description, solution, tda, category };

            // Mise à jour du cache Redis
            redisClient.set('errors', JSON.stringify(errors), (setErr) => {
                if (setErr) {
                    res.status(500).send({ error: 'Failed to update error in Redis' });
                } else {
                    res.redirect('/');
                }
            });
        } else {
            res.status(404).send({ error: 'Error not found' });
        }
    });
});

 
app.delete('/delete-error', (req, res) => {
    redisClient.get('errors', (err, data) => {
        if (err) {
            res.status(500).send({ error: 'Failed to fetch errors from Redis' });
            return;
        }

        const errors = JSON.parse(data || '[]');
        const id = req.body.id;
        const index = errors.findIndex(error => Number(error.id) === Number(id));
        
        if (index !== -1) {
            errors.splice(index, 1);

            // Mise à jour du cache Redis
            redisClient.set('errors', JSON.stringify(errors), (setErr) => {
                if (setErr) {
                    res.status(500).send({ error: 'Failed to delete error from Redis' });
                } else {
                    res.redirect('/');
                }
            });
        } else {
            res.status(404).send({ error: 'Error not found' });
        }
    });
});
 
 // Route pour filtrer les erreurs par catégorie
 app.get('/filter', (req, res) => {
    const category = req.query.category;

    // Récupération des erreurs depuis Redis
    redisClient.get('errors', (err, data) => {
        if (err) {
            res.status(500).send({ error: 'Failed to fetch errors from Redis' });
            return;
        }

        const errors = JSON.parse(data || '[]');

        // Si aucune catégorie n'est spécifiée, affiche toutes les erreurs
        if (!category) {
            res.render('index', { 
                errors: errors, 
                nextErrorId: errors.length + 1,
                totalPages: Math.ceil(errors.length / 3)  
            });
            return;
        }

        // Filtrage des erreurs en fonction de la catégorie
        const filteredErrors = errors.filter(error => error.category === category);
        const totalPages = Math.ceil(filteredErrors.length / 3);

        res.render('index', {
            errors: filteredErrors,
            nextErrorId: filteredErrors.length + 1,
            totalPages
        });
    });
});


// Clear Debug 

app.get('/clear', async (req, res) => {
    // Vérifier si l'utilisateur est authentifié
    if (!req.isAuthenticated()) {
        return res.status(401).send("Non autorisé");
    }

    // Vérifier si l'utilisateur authentifié est DcSault
    if (req.user.username !== "DcSault") {
        return res.status(403).send("Accès interdit");
    }

    // Supprimer toutes les sessions de Redis
    client.keys("sess:*", (err, keys) => {
        if (err) {
            logger.error(err);
            return res.status(500).send("Erreur serveur");
        }
        
        // Si aucune clé n'est trouvée, simplement retourner
        if (!keys || keys.length === 0) {
            return res.send("Aucune session à effacer");
        }

        // Sinon, supprimer chaque session
        keys.forEach(key => {
            client.del(key, (err, response) => {
                if (err) {
                    logger.error(err);
                }
            });
        });

        // Envoyer une réponse confirmant la suppression
        res.send("Toutes les sessions ont été supprimées");
    });
});


// ======== Démarrage du serveur ========
app.listen(443, () => logger.info('App is listening on port 443'));
