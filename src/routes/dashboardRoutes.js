const express = require('express');
const { getDashboardData } = require('../controllers/dashboardController');

const router = express.Router();

router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

router.get('/', getDashboardData);

module.exports = router;
