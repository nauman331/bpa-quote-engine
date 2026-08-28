/**
 * src/services/archiveService.js
 * Handles reading templates and writing PDFs to the client's OneDrive/SharePoint.
 */
const { getGraphToken } = require('./graphAuth');

// Helper to determine the exact folder paths based on the brand and product
// Helper to determine the exact folder paths based on the brand and product
const getFolderPaths = (brand, productFamily, tier) => {
    const driveId = brand.toLowerCase().includes('brisbane') || brand.toLowerCase() === 'bpa'
        ? process.env.BPA_DRIVE_ID
        : process.env.GCPA_DRIVE_ID;

    // 1. Handle the .doc vs .docx discrepancy from your P0 Report
    const fileExtension = productFamily.includes('Static Line') ? '.doc' : '.docx';

    // 2. IMPORTANT: Change 'Template' to match your EXACT file name in OneDrive
    // If your file is named "Level D Conditions D", change the string below!
    const fileName = `Template${fileExtension}`;

    const templatePath = `Shared/${productFamily}/${tier}/${fileName}`;

    const archiveFolderName = productFamily.includes('Mobile') ? 'Price List Sent Mobile Pumps' : 'Price List Sent';
    const archivePath = `Shared/${productFamily}/${archiveFolderName}`;

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

const uploadPdfToArchive = async (brand, productFamily, fileName, pdfBuffer) => {
    const token = await getGraphToken();
    const { driveId: siteId, archivePath } = getFolderPaths(brand, productFamily, null);

    // Updated to use /sites/ instead of /drives/
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${archivePath}/${fileName}:/content`, {
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
    console.log(`[M1] Successfully archived ${fileName} to ${archivePath}`);
};

module.exports = { downloadTemplate, uploadPdfToArchive };