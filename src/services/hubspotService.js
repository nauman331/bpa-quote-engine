const axios = require('axios');

// Idempotency guard — prevents double-send if HubSpot retries the same webhook
// Key format: "dealId:stageId"
const processedEvents = new Set();

// Pipeline ID → Brand mapping (from live HubSpot API)
const PIPELINE_BRAND_MAP = {
    'default':    'BPA',   // Makin' Millions → BPA
    '2044407265': 'BPA',   // Toowoomba       → BPA
    '941363658':  'GCPA',  // Chasin' Millions → GCPA
};

/**
 * Fetches deal properties + pipeline from HubSpot.
 */
const fetchDealProperties = async (dealId) => {
    const properties = 'brand,pricing,rate_tier,dealname,products,email,pipeline,hs_pipeline_stage,hubspot_owner_id';
    const response = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=${properties}&associations=contacts`,
        { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
    );
    console.log('[RAW HUBSPOT DATA]:', response.data);
    return response.data;
};

/**
 * Fetches the associated contact email for a deal via the v3 associations API.
 */
const fetchContactEmail = async (dealId, inlineAssociations) => {
    try {
        // First, try the contact IDs already embedded in the deal response (associations param)
        let contactIds = inlineAssociations?.contacts?.results?.map(r => r.id) || [];

        if (contactIds.length === 0) {
            // Fallback: fetch via v3 associations endpoint
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

/**
 * Infers brand from the HubSpot pipeline ID when the custom property is not set.
 */
const inferBrand = (pipelineId) => {
    return PIPELINE_BRAND_MAP[pipelineId] || 'BPA'; // Default to BPA
};

/**
 * Infers productFamily from the deal name when the custom property is not set.
 * Satellite and Spider deals contain those keywords in their deal names.
 */
const inferProductFamily = (dealName) => {
    if (!dealName) return 'Mobile Rates';
    const lower = dealName.toLowerCase();
    if (lower.includes('satellite') || lower.includes('sattelite')) return 'Satellite Rates';
    if (lower.includes('spider')) return 'Spider Rates';
    return 'Mobile Rates'; // Default
};

const processLegacyWebhook = async (webhookPayload) => {
    const event = webhookPayload[0];
    const validStages = process.env.TARGET_DEAL_STAGE_IDS.split(',');

    if (!validStages.includes(event.propertyValue)) {
        return { shouldProcess: false, reason: 'stage not in target list' };
    }

    // --- Idempotency check ---
    const idempotencyKey = `${event.objectId}:${event.propertyValue}`;
    if (processedEvents.has(idempotencyKey)) {
        console.log(`[M0] Duplicate webhook for key ${idempotencyKey} — skipping.`);
        return { shouldProcess: false, reason: 'duplicate' };
    }
    processedEvents.add(idempotencyKey);

    // Fetch deal (with inline associations) — then fetch contact in parallel if needed
    const dealResponse = await fetchDealProperties(event.objectId);
    const rawProperties = dealResponse.properties;
    const inlineAssociations = dealResponse.associations;

    const contactProperties = await fetchContactEmail(event.objectId, inlineAssociations);

    // --- Smart inference when CRM properties are not set ---
    const brand         = rawProperties.brand        || inferBrand(rawProperties.pipeline);
    const productFamily = rawProperties.products     || inferProductFamily(rawProperties.dealname);
    const tier          = rawProperties.rate_tier    || 'DD'; // Default to standard tier
    const recipientEmail = rawProperties.email       || contactProperties?.email || null;

    // Parse client name and project from dealname: "ClientName - Project Name"
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