const axios = require('axios');

const fetchDealProperties = async (dealId) => {
    // I added 'email' back into this string so your backend can find the recipient
    const properties = 'brand,pricing,rate_tier,dealname,products,email';

    const response = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=${properties}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        }
    );
    console.log('[RAW HUBSPOT DATA]:', response.data);
    return response.data.properties;
};

const processLegacyWebhook = async (webhookPayload) => {
    const event = webhookPayload[0];
    const validStages = process.env.TARGET_DEAL_STAGE_IDS.split(',');

    if (!validStages.includes(event.propertyValue)) {
        return { shouldProcess: false };
    }

    const rawProperties = await fetchDealProperties(event.objectId);

    return {
        shouldProcess: true,
        data: {
            brand: rawProperties.brand,
            productFamily: rawProperties.products,
            tier: rawProperties.rate_tier,
            clientName: rawProperties.company || 'Unknown',
            projectName: rawProperties.dealname,
            recipientEmail: rawProperties.email
        }
    };
};

module.exports = { processLegacyWebhook };