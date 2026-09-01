const express = require('express');
const { getDashboardData } = require('../controllers/dashboardController');

const router = express.Router();

// Allow CORS for the dashboard route since Next.js calls this from browser/server
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); // Or strict to localhost:3001
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

router.get('/', getDashboardData);

module.exports = router;
