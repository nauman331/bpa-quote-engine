const express = require('express');
const router = express.Router();
const { handleMailboxNotification, handleSyncMailbox } = require('../controllers/mailboxController');
const { fetchRecentMessages } = require('../services/mailboxService');
const authMiddleware = require('../middleware/authMiddleware');
const { isAutomationEnabled } = require('../utils/safetyGuards');

router.get('/mailbox', handleMailboxNotification);
router.post('/mailbox', handleMailboxNotification);
router.post('/sync', handleSyncMailbox);
router.get('/sync', handleSyncMailbox);

router.get('/recent', authMiddleware, async (req, res) => {
    if (!isAutomationEnabled()) {
        return res.status(403).json({
            error: 'Mailbox queries are paused while automation is disabled.',
            count: 0,
            messages: []
        });
    }

    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
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
