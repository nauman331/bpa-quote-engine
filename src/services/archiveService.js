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

    // Template folder path
    // For Spider and Satellite, the template is just in the root of the product folder?
    let templateFolderPath = folderProduct;
    if (folderProduct === 'Mobile Pumps') {
        templateFolderPath += `/${folderTier}`;
    }

    // 4. Map the exact Archive folder based on the Product and Brand
    let archiveFolderName = isBPA ? 'Price Lists sent Mobile Pumps' : 'GCPA Price Lists Sent Mobile Pumps';
    if (folderProduct === 'Spider Boom') {
        archiveFolderName = 'Spider Boom Prices List sent';
    } else if (folderProduct === 'Static Line Satellite Rates') {
        archiveFolderName = 'Price Lists sent - Satellite';
    }
    const archivePath = `${folderProduct}/${archiveFolderName}`;

    return { driveId, templateFolderPath, archivePath };
};

const downloadTemplate = async (brand, productFamily, tier) => {
    const token = await getGraphToken();
    const { driveId: siteId, templateFolderPath } = getFolderPaths(brand, productFamily, tier);

    console.log('[DEBUG GRAPH FETCH PATH]: Attempting to fetch folder ->', templateFolderPath);

    // URL-encode path
    const encodedFolderPath = templateFolderPath.split('/').map(segment => encodeURIComponent(segment)).join('/');

    // 1. List children of the folder to find the template file
    const listRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedFolderPath}:/children`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!listRes.ok) throw new Error(`Failed to list template folder: ${await listRes.text()}`);
    const listData = await listRes.json();

    const validFiles = listData.value.filter(file => !file.folder && (file.name.endsWith('.docx') || file.name.endsWith('.doc')));
    const templateFile = validFiles.find(file => file.name.endsWith('.docx')) || validFiles.find(file => file.name.endsWith('.doc'));
    if (!templateFile) {
        throw new Error(`No .docx or .doc template found in ${templateFolderPath}`);
    }

    console.log(`[M1] Resolved dynamic template file: ${templateFile.name}`);

    // 2. Download the exact template file content
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${templateFile.id}/content`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Failed to download template file: ${res.statusText}`);
    return {
        buffer: Buffer.from(await res.arrayBuffer()),
        fileName: templateFile.name
    };
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

const downloadPdfFromArchive = async (fileName) => {
    const token = await getGraphToken();

    // Guess brand and product from filename
    const brand = fileName.toLowerCase().includes('gcpa') ? 'GCPA' : 'BPA';
    let productFamily = 'Mobile Pumps';
    if (fileName.toLowerCase().includes('spider')) productFamily = 'Spider';
    if (fileName.toLowerCase().includes('satellite')) productFamily = 'Satellite';

    const { driveId: siteId, archivePath } = getFolderPaths(brand, productFamily, null);

    const safeFileName = fileName.replace(/[/#?%\\]/g, '-');
    const fullPath = `${archivePath}/${safeFileName}`;
    const encodedPath = fullPath.split('/').map(segment => encodeURIComponent(segment)).join('/');

    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/content`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        throw new Error(`Failed to download PDF from archive: ${res.statusText}`);
    }

    return Buffer.from(await res.arrayBuffer());
};

module.exports = { downloadTemplate, uploadPdfToArchive, downloadPdfFromArchive };