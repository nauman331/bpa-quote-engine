const express = require('express');
const { handleGenerateAndSend, handleDownloadQuote } = require('../controllers/quoteController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/generate-and-send', authMiddleware, handleGenerateAndSend);
router.get('/download', authMiddleware, handleDownloadQuote);

module.exports = router;
