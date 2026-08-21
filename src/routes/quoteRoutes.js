const express = require('express');
const { handleGenerateAndSend } = require('../controllers/quoteController');

const router = express.Router();

router.post('/generate-and-send', handleGenerateAndSend);

module.exports = router;