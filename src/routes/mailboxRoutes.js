const express = require('express');
const router = express.Router();
const { handleMailboxNotification } = require('../controllers/mailboxController');
const { fetchRecentMessages } = require('../services/mailboxService');

// Graph sends a GET for subscription validation, POST for notifications
router.get('/mailbox', handleMailboxNotification);
router.post('/mailbox', handleMailboxNotification);

/**
 * GET /api/webhook/recent?limit=50
 * Returns the latest N emails from the BPA shared inbox for manual testing.
 */
router.get('/recent', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const fromFilter = req.query.from || null;
        const keyword = req.query.q || null;
        const messages = await fetchRecentMessages(limit, fromFilter, keyword);
        const clean = messages.map(m => {
            // Strip HTML tags to return clean plain text body
            const plainBody = (m.body?.content || '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s{2,}/g, '\n')
                .trim();
            return {
                id: m.id,
                subject: m.subject,
                from: m.from?.emailAddress?.address,
                fromName: m.from?.emailAddress?.name,
                receivedAt: m.receivedDateTime,
                isRead: m.isRead,
                body: plainBody
            };
        });
        res.json({ count: clean.length, messages: clean });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
