const axios = require('axios');

const processedEvents = new Set();

const PIPELINE_BRAND_MAP = {
    'default':    'BPA',
    '2044407265': 'BPA',
    '941363658':  'GCPA',
};

const fetchDealProperties = async (dealId) => {
    const properties = 'brand,pricing,rate_tier,dealname,products,email,pipeline,hs_pipeline_stage,hubspot_owner_id';
    const response = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=${properties}&associations=contacts`,
        { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
    );
    console.log('[RAW HUBSPOT DATA]:', response.data);
    return response.data;
};

const fetchContactEmail = async (dealId, inlineAssociations) => {
    try {

        let contactIds = inlineAssociations?.contacts?.results?.map(r => r.id) || [];

        if (contactIds.length === 0) {

            const assocRes = await axios.get(
                `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts`,
                { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
            );
            contactIds = assocRes.data.results?.map(r => r.id) || [];
        }

        if (contactIds.length === 0) return null;

        const contactRes = await axios.get(
            `https://api.hubapi.com/crm/v3/objects/contacts/${contactIds[0]}?properties=email,firstname,lastname`,
            { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
        );
        return contactRes.data.properties;
    } catch (err) {
        console.warn('[M0] Could not fetch contact:', err.message);
        return null;
    }
};

const inferBrand = (pipelineId) => {
    return PIPELINE_BRAND_MAP[pipelineId] || 'BPA';
};

const inferProductFamily = (dealName) => {
    if (!dealName) return 'Mobile Rates';
    const lower = dealName.toLowerCase();
    if (lower.includes('satellite') || lower.includes('sattelite')) return 'Satellite Rates';
    if (lower.includes('spider')) return 'Spider Rates';
    return 'Mobile Rates';
};

const processLegacyWebhook = async (webhookPayload) => {
    const event = webhookPayload[0];
    const validStages = process.env.TARGET_DEAL_STAGE_IDS.split(',');

    if (!validStages.includes(event.propertyValue)) {
        return { shouldProcess: false, reason: 'stage not in target list' };
    }

    const idempotencyKey = `${event.objectId}:${event.propertyValue}`;
    if (processedEvents.has(idempotencyKey)) {
        console.log(`[M0] Duplicate webhook for key ${idempotencyKey} — skipping.`);
        return { shouldProcess: false, reason: 'duplicate' };
    }
    processedEvents.add(idempotencyKey);

    const dealResponse = await fetchDealProperties(event.objectId);
    const rawProperties = dealResponse.properties;
    const inlineAssociations = dealResponse.associations;

    const contactProperties = await fetchContactEmail(event.objectId, inlineAssociations);

    const brand         = rawProperties.brand        || inferBrand(rawProperties.pipeline);
    const productFamily = rawProperties.products     || inferProductFamily(rawProperties.dealname);
    const tier          = rawProperties.rate_tier    || 'DD';
    const recipientEmail = rawProperties.email       || contactProperties?.email || null;

    const dealParts   = (rawProperties.dealname || '').split(' - ');
    const clientName  = dealParts[0]?.trim() || 'Unknown Client';
    const projectName = dealParts.slice(1).join(' - ').replace(/ - New Enquiry$/i, '').trim() || rawProperties.dealname || 'Unknown Project';

    console.log(`[M0] Resolved lead: brand=${brand}, product=${productFamily}, tier=${tier}, client=${clientName}, project=${projectName}, email=${recipientEmail}`);

    return {
        shouldProcess: true,
        data: { brand, productFamily, tier, clientName, projectName, recipientEmail }
    };
};

module.exports = { processLegacyWebhook };
