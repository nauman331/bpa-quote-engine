const express = require('express');
const { handleGenerateAndSend, handleDownloadQuote, handleApproveQuote, handleRejectQuote, handleGetPendingQuotes } = require('../controllers/quoteController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, handleGenerateAndSend);
router.post('/generate-and-send', authMiddleware, handleGenerateAndSend);
router.get('/download', authMiddleware, handleDownloadQuote);
router.get('/pending', authMiddleware, handleGetPendingQuotes);
router.post('/:id/approve', authMiddleware, handleApproveQuote);
router.post('/:id/reject', authMiddleware, handleRejectQuote);

module.exports = router;
