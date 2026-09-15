const fs = require('fs');
const path = require('path');
const { getClient } = require('../services/supabaseService');

const ALLOWED_KEYS = new Set([
    'ANTHROPIC_API_KEY',
    'HUBSPOT_ACCESS_TOKEN',
    'AZURE_CLIENT_SECRET',
    'ANTHROPIC_MODEL',
    'API_SECRET_KEY',
    'DRY_RUN',
    'ENABLE_AUTOMATION',
    'DISPATCH_EMAILS',
    'SHAREPOINT_ARCHIVE_FOLDER',
    'REQUIRE_APPROVAL',
    'SAFE_TEST_MODE',
    'ALLOWED_TEST_SENDERS',
    'RATE_TEMPLATES_FOLDER'
]);

const restoreSettingsFromDb = async () => {
    try {
        const supabase = getClient();
        const { data: snapshot } = await supabase
            .from('audit_log')
            .select('payload')
            .eq('event_type', 'system_settings_snapshot')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (snapshot && snapshot.payload) {
            for (const [k, v] of Object.entries(snapshot.payload)) {
                if (ALLOWED_KEYS.has(k) && v !== undefined && v !== null && (process.env[k] === undefined || process.env[k] === '')) {
                    process.env[k] = String(v);
                }
            }
        }
    } catch { }
};

const getSettings = async (req, res) => {
    await restoreSettingsFromDb();
    res.json({
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "••••" + process.env.ANTHROPIC_API_KEY.slice(-4) : null,
        HUBSPOT_ACCESS_TOKEN: process.env.HUBSPOT_ACCESS_TOKEN ? "••••" + process.env.HUBSPOT_ACCESS_TOKEN.slice(-4) : null,
        AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET ? "••••" + process.env.AZURE_CLIENT_SECRET.slice(-4) : null,
        API_SECRET_KEY: process.env.API_SECRET_KEY ? "••••" + process.env.API_SECRET_KEY.slice(-4) : null,
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
        DRY_RUN: process.env.DRY_RUN,
        ENABLE_AUTOMATION: process.env.ENABLE_AUTOMATION,
        DISPATCH_EMAILS: process.env.DISPATCH_EMAILS,
        SHAREPOINT_ARCHIVE_FOLDER: process.env.SHAREPOINT_ARCHIVE_FOLDER,
        REQUIRE_APPROVAL: process.env.REQUIRE_APPROVAL,
        SAFE_TEST_MODE: process.env.SAFE_TEST_MODE,
        ALLOWED_TEST_SENDERS: process.env.ALLOWED_TEST_SENDERS,
        RATE_TEMPLATES_FOLDER: process.env.RATE_TEMPLATES_FOLDER
    });
};

const updateSettings = async (req, res) => {
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
        if (!cleanVal || cleanVal.startsWith('••••') || cleanVal.startsWith('****')) return;

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

    try {
        fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    } catch { }

    try {
        const supabase = getClient();
        const snapshot = {};
        for (const k of ALLOWED_KEYS) {
            if (process.env[k] !== undefined && process.env[k] !== null && !k.includes('SECRET') && !k.includes('TOKEN') && !k.includes('KEY')) {
                snapshot[k] = process.env[k];
            }
        }
        await supabase.from('audit_log').insert({
            event_type: 'system_settings_snapshot',
            payload: snapshot
        });
    } catch { }

    res.json({ success: true, message: "Settings updated successfully." });
};

module.exports = { getSettings, updateSettings, restoreSettingsFromDb };
