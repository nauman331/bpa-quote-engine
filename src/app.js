const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { PORT } = require('./config/env');
const quoteRoutes = require('./routes/quoteRoutes');
const mailboxRoutes = require('./routes/mailboxRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const profileRoutes = require('./routes/profileRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const { createOrRenewSubscription } = require('./services/mailboxService');
const { runFollowUpCron } = require('./services/followUpService');

const startApp = () => {
    const app = express();
    app.use(express.json());
    app.use(cors());

    app.use('/api/quotes', quoteRoutes);
    app.use('/api/webhook', mailboxRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/profile', profileRoutes);
    app.use('/api/settings', settingsRoutes);
    app.get('/', (req, res) => res.status(200).send('BPA Quote Engine API is running.'));

    app.listen(PORT, async () => {
        console.log(`BPA Quote Engine running on port ${PORT}`);

        const isAutomationEnabled = process.env.ENABLE_AUTOMATION === 'true';

        if (!isAutomationEnabled) {
            console.log('[Automation] ⏸️  Background automations (mailbox listener, follow-up cron) are PAUSED.');
            console.log('[Automation] ℹ️  All API endpoints (Dashboard, Quotes, Profile, Settings) remain fully active.');
            console.log('[Automation] ℹ️  To activate live email triage and cron dispatch on production, set ENABLE_AUTOMATION=true in .env.');
            return;
        }

        console.log('[Automation] ▶️  Background automations ACTIVE (ENABLE_AUTOMATION=true).');

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