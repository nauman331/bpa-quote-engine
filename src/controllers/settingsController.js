const fs = require('fs');
const path = require('path');

const ALLOWED_KEYS = new Set([
    'ANTHROPIC_API_KEY',
    'HUBSPOT_ACCESS_TOKEN',
    'AZURE_CLIENT_SECRET',
    'ANTHROPIC_MODEL',
    'API_SECRET_KEY',
    'DRY_RUN',
    'ENABLE_AUTOMATION',
    'DISPATCH_EMAILS',
    'SHAREPOINT_ARCHIVE_FOLDER'
]);

const getSettings = (req, res) => {
    res.json({
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "••••" + process.env.ANTHROPIC_API_KEY.slice(-4) : null,
        HUBSPOT_ACCESS_TOKEN: process.env.HUBSPOT_ACCESS_TOKEN ? "••••" + process.env.HUBSPOT_ACCESS_TOKEN.slice(-4) : null,
        AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET ? "••••" + process.env.AZURE_CLIENT_SECRET.slice(-4) : null,
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
        DRY_RUN: process.env.DRY_RUN,
        ENABLE_AUTOMATION: process.env.ENABLE_AUTOMATION,
        DISPATCH_EMAILS: process.env.DISPATCH_EMAILS,
        SHAREPOINT_ARCHIVE_FOLDER: process.env.SHAREPOINT_ARCHIVE_FOLDER
    });
};

const updateSettings = (req, res) => {
    const updates = req.body || {};
    const envPath = path.resolve(__dirname, '../../.env');
    let envContent = '';

    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }

    const updateEnvVar = (key, value) => {
        if (!ALLOWED_KEYS.has(key)) return;
        if (value === undefined || value === null) return;

        const cleanVal = String(value).replace(/[\r\n]/g, '').trim();
        if (!cleanVal) return;

        process.env[key] = cleanVal;

        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}="${cleanVal}"`);
        } else {
            envContent += `\n${key}="${cleanVal}"`;
        }
    };

    for (const [k, v] of Object.entries(updates)) {
        updateEnvVar(k, v);
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');

    res.json({ success: true, message: "Settings updated successfully." });
};

module.exports = { getSettings, updateSettings };
