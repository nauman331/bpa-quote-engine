const express = require('express');
const { handleGenerateAndSend, handleDownloadQuote } = require('../controllers/quoteController');

const router = express.Router();

router.post('/generate-and-send', handleGenerateAndSend);
router.get('/download', handleDownloadQuote);

module.exports = router;