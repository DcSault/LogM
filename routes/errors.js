const express = require('express');
const router = express.Router();

// Un middleware pour simuler une erreur
router.use('/simulate-error', (req, res, next) => {
    throw new Error("Erreur simulée pour démonstration");
});

// Gestion des différentes erreurs HTTP

// 404 Not Found
router.use((req, res, next) => {
    const err = new Error('Page non trouvée');
    err.status = 404;
    next(err);
});

// 500 Internal Server Error
router.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.render('error', { 
        message: err.message, 
        error: req.app.get('env') === 'development' ? err : {} 
    });
});

module.exports = router;
