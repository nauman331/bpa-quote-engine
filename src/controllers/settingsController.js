const fs = require('fs');
const path = require('path');

const getSettings = (req, res) => {

    res.json({
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "••••" + process.env.ANTHROPIC_API_KEY.slice(-4) : null,
        HUBSPOT_ACCESS_TOKEN: process.env.HUBSPOT_ACCESS_TOKEN ? "••••" + process.env.HUBSPOT_ACCESS_TOKEN.slice(-4) : null,
        AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET ? "••••" + process.env.AZURE_CLIENT_SECRET.slice(-4) : null,
    });
};

const updateSettings = (req, res) => {
    const { ANTHROPIC_API_KEY, HUBSPOT_ACCESS_TOKEN, AZURE_CLIENT_SECRET } = req.body;

    const envPath = path.resolve(__dirname, '../../.env');
    let envContent = '';

    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }

    const updateEnvVar = (key, value) => {
        if (!value) return;

        process.env[key] = value;

        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}="${value}"`);
        } else {
            envContent += `\n${key}="${value}"`;
        }
    };

    updateEnvVar('ANTHROPIC_API_KEY', ANTHROPIC_API_KEY);
    updateEnvVar('HUBSPOT_ACCESS_TOKEN', HUBSPOT_ACCESS_TOKEN);
    updateEnvVar('AZURE_CLIENT_SECRET', AZURE_CLIENT_SECRET);

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');

    res.json({ success: true, message: "Settings updated successfully." });
};

module.exports = { getSettings, updateSettings };
