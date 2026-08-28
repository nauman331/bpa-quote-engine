const mapHubspotToQuotePayload = (hubspotData) => {
    // Safely extract raw properties from the HubSpot webhook payload
    return {
        brand: hubspotData.properties?.company_brand?.value || 'BPA',
        productFamily: hubspotData.properties?.product_family?.value || 'Mobile Rates',
        tier: hubspotData.properties?.pricing_tier?.value || 'DD',
        clientName: hubspotData.properties?.company?.value || 'Unknown Client',
        projectName: hubspotData.properties?.dealname?.value || 'Standard Project',
        recipientEmail: hubspotData.properties?.email?.value
    };
};

module.exports = { mapHubspotToQuotePayload };