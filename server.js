const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github').Strategy;
const Redis = require('ioredis');

require('dotenv').config({ path: './token.env' });
require('dotenv').config({ path: './github.env' });
require('dotenv').config({ path: './redis.env' });
require('dotenv').config({ path: './session_secret.env' });

const {
    GITHUB_CLIENT_ID, 
    GITHUB_CLIENT_SECRET, 
    GITHUB_CALLBACK_URL,
    REDIS_HOST,
    REDIS_PORT,
    REDIS_PASSWORD,
    SESSION_SECRET,
    GITHUB_TOKEN,
    GITHUB_OWNER,
    GITHUB_REPO,
    GITHUB_PATH
} = process.env;

const headers = { Authorization: `token ${GITHUB_TOKEN}` };
const fileURL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;

const app = express();
const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD
});

const isAuthenticated = (req, res, next) => {
    if (req.user) {
        return next();
    }
    res.redirect('/auth/github');
};

// Configuration de Redis
// Exemple: vérifier la connexion, gérer les erreurs, etc.

// Configuration de Passport pour GitHub
passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: GITHUB_CALLBACK_URL
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static(__dirname));
app.use(express.static('public'));
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/errors', isAuthenticated, require('./routes/errors'));

app.listen(443, () => console.log('App is listening on port 443'));
