/**
 * src/services/archiveService.js
 * Handles reading templates and writing PDFs to the client's OneDrive/SharePoint.
 */
const { getGraphToken } = require('./graphAuth');

// Helper to determine the exact folder paths based on the brand, product, and tier
const getFolderPaths = (brand, productFamily, tier) => {
    const isBPA = brand.toLowerCase().includes('brisbane') || brand.toLowerCase() === 'bpa';
    const driveId = isBPA ? process.env.BPA_DRIVE_ID : process.env.GCPA_DRIVE_ID;

    // 1. Map CRM Product to OneDrive Folder
    let folderProduct = 'Mobile Pumps'; // Fallback
    if (productFamily && productFamily.includes('Spider')) folderProduct = 'Spider Boom';
    if (productFamily && productFamily.includes('Satellite')) folderProduct = 'Static Line Satellite Rates';

    // 2. Map CRM Tier to OneDrive Folder
    let folderTier = 'LEVEL D CONDITIONS D'; // Fallback for DD
    if (tier === 'ED') folderTier = 'LEVEL E CONDITIONS D';
    if (tier === 'FD') folderTier = 'LEVEL F CONDITIONS D';

    // 3. Set the exact template filename we just found
    // Note: If you expand to GCPA or other tiers, you will need to add a conditional here for their specific filenames
    const fileName = 'BPA Price List - Level D Conditions D - ORIGINAL 10Mar26.docx';

    const templatePath = `${folderProduct}/${folderTier}/${fileName}`;

    // 4. Map the exact Archive folder based on the Brand
    const archiveFolderName = isBPA ? 'Price Lists sent Mobile Pumps' : 'GCPA Price Lists Sent Mobile Pumps';
    const archivePath = `${folderProduct}/${archiveFolderName}`;

    return { driveId, templatePath, archivePath };
};
const downloadTemplate = async (brand, productFamily, tier) => {
    const token = await getGraphToken();
    const { driveId: siteId, templatePath } = getFolderPaths(brand, productFamily, tier);

    // 3. INJECT THE DEBUG LOG HERE
    console.log('[DEBUG GRAPH FETCH PATH]: Attempting to fetch ->', templatePath);

    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${templatePath}:/content`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Failed to download template: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
};

const uploadPdfToArchive = async (brand, productFamily, rawFileName, pdfBuffer) => {
    const token = await getGraphToken();
    const { driveId: siteId, archivePath } = getFolderPaths(brand, productFamily, null);

    // 1. Sanitize the filename (Remove /, \, #, ? that break URLs and file systems)
    const safeFileName = rawFileName.replace(/[/#?%\\]/g, '-');

    // 2. URL-encode the path segments so spaces don't break the fetch request
    const fullPath = `${archivePath}/${safeFileName}`;
    const encodedPath = fullPath.split('/').map(segment => encodeURIComponent(segment)).join('/');

    // 3. Execute the upload to the safely encoded URL
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/content`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/pdf'
        },
        body: pdfBuffer
    });

    if (!res.ok) {
        const errData = await res.text();
        throw new Error(`Failed to upload PDF: ${errData}`);
    }
    console.log(`[M1] Successfully archived ${safeFileName} to ${archivePath}`);
};

module.exports = { downloadTemplate, uploadPdfToArchive };