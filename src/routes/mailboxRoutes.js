const express = require('express');
const router = express.Router();
const { handleMailboxNotification } = require('../controllers/mailboxController');
const { fetchRecentMessages } = require('../services/mailboxService');

router.get('/mailbox', handleMailboxNotification);
router.post('/mailbox', handleMailboxNotification);

router.get('/recent', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const fromFilter = req.query.from || null;
        const keyword = req.query.q || null;
        const messages = await fetchRecentMessages(limit, fromFilter, keyword);
        const clean = messages.map(m => {

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
