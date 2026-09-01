const express = require('express');
const cron = require('node-cron');
const { PORT } = require('./config/env');
const quoteRoutes = require('./routes/quoteRoutes');
const mailboxRoutes = require('./routes/mailboxRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { createOrRenewSubscription } = require('./services/mailboxService');
const { runFollowUpCron } = require('./services/followUpService');

const startApp = () => {
    const app = express();
    app.use(express.json());

    app.use('/api/quotes', quoteRoutes);
    app.use('/api/webhook', mailboxRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.get('/', (req, res) => res.status(200).send('BPA Quote Engine API is running.'));

    app.listen(PORT, async () => {
        console.log(`BPA Quote Engine running on port ${PORT}`);

        // Register/renew mailbox subscription on startup
        const publicUrl = process.env.PUBLIC_URL;
        if (publicUrl) {
            try {
                await createOrRenewSubscription(`${publicUrl}/api/webhook/mailbox`);
            } catch (err) {
                console.warn('[Mailbox] Could not register subscription on startup:', err.message);
            }
        } else {
            console.warn('[Mailbox] PUBLIC_URL not set — skipping subscription registration. Add ngrok URL to .env as PUBLIC_URL.');
        }

        // Daily cron at 8am AEST (UTC+10) = 22:00 UTC
        // Dispatches any due follow-ups
        cron.schedule('0 22 * * *', async () => {
            console.log('[Cron] Running daily follow-up dispatch...');
            try { await runFollowUpCron(); } catch (e) { console.error('[Cron] Follow-up error:', e.message); }
        });

        // Daily cron at 2am to renew the mailbox subscription before it expires
        cron.schedule('0 16 * * *', async () => {
            console.log('[Cron] Renewing mailbox subscription...');
            if (publicUrl) {
                try { await createOrRenewSubscription(`${publicUrl}/api/webhook/mailbox`); }
                catch (e) { console.error('[Cron] Renewal error:', e.message); }
            }
        });
    });

    module.exports = app;
};

startApp();