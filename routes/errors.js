const express = require('express');
const router = express.Router();

router.get('/404', (req, res) => {
    res.status(404).send('Page Not Found');
});

router.get('/500', (req, res) => {
    res.status(500).send('Internal Server Error');
});

module.exports = router;
