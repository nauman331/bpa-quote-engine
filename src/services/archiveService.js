const { getGraphToken } = require('./graphAuth');
const { canWriteSharePoint } = require('../utils/safetyGuards');

const getFolderPaths = (brand, productFamily, tier) => {
    const isBPA = (brand || '').toLowerCase().includes('brisbane') || (brand || '').toLowerCase() === 'bpa';
    const driveId = isBPA ? process.env.BPA_DRIVE_ID : process.env.GCPA_DRIVE_ID;

    let folderProduct = 'Mobile Pumps';
    if (productFamily && productFamily.includes('Spider')) folderProduct = 'Spider Boom';
    if (productFamily && productFamily.includes('Satellite')) folderProduct = 'Static Line Satellite Rates';

    let folderTier = 'LEVEL D CONDITIONS D';
    if (tier === 'ED') folderTier = 'LEVEL E CONDITIONS D';
    if (tier === 'FD') folderTier = 'LEVEL F CONDITIONS D';

    let templateFolderPath = folderProduct;
    if (process.env.RATE_TEMPLATES_FOLDER) {
        templateFolderPath = process.env.RATE_TEMPLATES_FOLDER;
    } else if (folderProduct === 'Mobile Pumps') {
        templateFolderPath += `/${folderTier}`;
    }

    let archiveFolderName = isBPA ? 'Price Lists sent Mobile Pumps' : 'GCPA Price Lists Sent Mobile Pumps';
    if (folderProduct === 'Spider Boom') {
        archiveFolderName = 'Spider Boom Prices List sent';
    } else if (folderProduct === 'Static Line Satellite Rates') {
        archiveFolderName = 'Price Lists sent - Satellite';
    }

    const stagingFolder = process.env.SHAREPOINT_ARCHIVE_FOLDER;
    const archivePath = stagingFolder
        ? `${stagingFolder}/${folderProduct}/${archiveFolderName}`
        : `${folderProduct}/${archiveFolderName}`;

    return { driveId, templateFolderPath, archivePath };
};

const downloadTemplate = async (brand, productFamily, tier) => {
    const token = await getGraphToken();
    const { driveId: siteId, templateFolderPath } = getFolderPaths(brand, productFamily, tier);

    console.log('[DEBUG GRAPH FETCH PATH]: Attempting to fetch folder ->', templateFolderPath);

    const encodedFolderPath = templateFolderPath.split('/').map(segment => encodeURIComponent(segment)).join('/');

    const listRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedFolderPath}:/children`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!listRes.ok) throw new Error(`Failed to list template folder: ${await listRes.text()}`);
    const listData = await listRes.json();

    const validFiles = (listData.value || []).filter(file => !file.folder && (file.name.endsWith('.docx') || file.name.endsWith('.doc')));
    const templateFile = validFiles.find(file => file.name.endsWith('.docx')) || validFiles.find(file => file.name.endsWith('.doc'));
    if (!templateFile) {
        throw new Error(`No .docx or .doc template found in ${templateFolderPath}`);
    }

    console.log(`[M1] Resolved dynamic template file: ${templateFile.name}`);

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
    const { driveId: siteId, archivePath } = getFolderPaths(brand, productFamily, null);
    const safeFileName = (rawFileName || 'Quote.pdf').replace(/[/#?%\\]/g, '-');

    if (!canWriteSharePoint()) {
        console.log(`[Archive] [DRY RUN / PAUSED] SharePoint upload skipped for "${safeFileName}" to "${archivePath}".`);
        return;
    }

    const token = await getGraphToken();
    const fullPath = `${archivePath}/${safeFileName}`;
    const encodedPath = fullPath.split('/').map(segment => encodeURIComponent(segment)).join('/');

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

    const brand = (fileName || '').toLowerCase().includes('gcpa') ? 'GCPA' : 'BPA';
    let productFamily = 'Mobile Pumps';
    if ((fileName || '').toLowerCase().includes('spider')) productFamily = 'Spider';
    if ((fileName || '').toLowerCase().includes('satellite')) productFamily = 'Satellite';

    const { driveId: siteId, archivePath } = getFolderPaths(brand, productFamily, null);

    const safeFileName = (fileName || '').replace(/[/#?%\\]/g, '-');
    const fullPath = `${archivePath}/${safeFileName}`;
    const encodedPath = fullPath.split('/').map(segment => encodeURIComponent(segment)).join('/');

    let res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/content`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        let folderProduct = 'Mobile Pumps';
        if (productFamily.includes('Spider')) folderProduct = 'Spider Boom';
        if (productFamily.includes('Satellite')) folderProduct = 'Static Line Satellite Rates';
        const isBPA = brand === 'BPA';
        let archiveFolderName = isBPA ? 'Price Lists sent Mobile Pumps' : 'GCPA Price Lists Sent Mobile Pumps';
        if (folderProduct === 'Spider Boom') archiveFolderName = 'Spider Boom Prices List sent';
        if (folderProduct === 'Static Line Satellite Rates') archiveFolderName = 'Price Lists sent - Satellite';

        const directPath = `${folderProduct}/${archiveFolderName}/${safeFileName}`;
        const encodedDirect = directPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
        res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedDirect}:/content`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }

    if (!res.ok) {
        const searchRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/search(q='${encodeURIComponent(safeFileName)}')`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            const match = (searchData.value || []).find(i => i.name && (i.name.toLowerCase() === safeFileName.toLowerCase() || i.name.toLowerCase().includes(safeFileName.toLowerCase())));
            if (match) {
                res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${match.id}/content`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        }
    }

    if (!res.ok) {
        throw new Error(`Failed to download PDF from archive: ${res.statusText}`);
    }

    return Buffer.from(await res.arrayBuffer());
};

module.exports = { downloadTemplate, uploadPdfToArchive, downloadPdfFromArchive };
