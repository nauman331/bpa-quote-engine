/**
 * src/services/graphAuth.js
 * Generates an OAuth token for Microsoft Graph using Client Credentials.
 */
const getGraphToken = async () => {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.AZURE_CLIENT_ID,
            scope: 'https://graph.microsoft.com/.default',
            client_secret: process.env.AZURE_CLIENT_SECRET,
            grant_type: 'client_credentials'
        })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
        throw new Error(`Azure Auth Failed: ${JSON.stringify(tokenData)}`);
    }
    return tokenData.access_token;
};

module.exports = { getGraphToken };