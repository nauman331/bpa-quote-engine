require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3000,
    AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
    AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
    AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
    BPA_SALES_EMAIL: process.env.BPA_SALES_EMAIL,
    GCPA_SALES_EMAIL: process.env.GCPA_SALES_EMAIL,
    BPA_HUBSPOT_BCC: process.env.BPA_HUBSPOT_BCC,
    GCPA_HUBSPOT_BCC: process.env.GCPA_HUBSPOT_BCC,
    ACCOUNTS_BCC: process.env.ACCOUNTS_BCC
};