/**
 * src/services/documentService.js
 * Smart-routes the document generation and converts to PDF via MS Graph.
 */
const { getGraphToken } = require('./graphAuth');
const { downloadTemplate } = require('./archiveService');
const PizZip = require('pizzip');

// In-memory cache for daily PDFs: Map<CacheKey, Buffer>
const pdfCache = new Map();

/**
 * Parses the docx XML and replaces any hardcoded dates (e.g. "10 Mar. 26") with today's date.
 */
const injectTodaysDate = (templateBuffer) => {
    const zip = new PizZip(templateBuffer);
    
    // Format date to match "d MMM. yy" (e.g., "31 Aug. 26")
    const formattedDate = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: '2-digit'
    }).format(new Date()).replace(/([a-zA-Z]+)/, '$1.');

    // Regex to match dates like "10 Mar. 26" or "1 Aug. 26" inside the XML text nodes
    const dateRegex = /\b\d{1,2}\s[A-Za-z]{3}\.\s\d{2}\b/g;

    Object.keys(zip.files).forEach(fileName => {
        if (fileName.endsWith('.xml')) {
            let content = zip.files[fileName].asText();
            if (dateRegex.test(content)) {
                content = content.replace(dateRegex, formattedDate);
                zip.file(fileName, content);
                console.log(`[M1] Injected today's date (${formattedDate}) into ${fileName}`);
            }
        }
    });

    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
};

const convertToPdfViaGraph = async (docxBuffer) => {
    const token = await getGraphToken();
    const siteId = process.env.BPA_DRIVE_ID;

    // 1. Upload temporary docx to Graph 
    const tempFileName = `temp_${Date.now()}.docx`;
    const uploadRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/Temp/${tempFileName}:/content`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        body: docxBuffer
    });

    if (!uploadRes.ok) throw new Error(`Temp upload failed: ${await uploadRes.text()}`);
    const uploadData = await uploadRes.json();

    // 2. Download as PDF (Graph automatically evaluates native Word DATE fields during PDF rendering)
    const pdfRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${uploadData.id}/content?format=pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // 3. Clean up temporary docx 
    await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${uploadData.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    return pdfBuffer;
};

/**
 * Retrieves a daily cached PDF or generates a new one if missing.
 */
const getCachedOrGeneratePdf = async (brand, productFamily, tier) => {
    // Cache key format: BRAND_PRODUCT_TIER_YYYY-MM-DD
    const dateStr = new Date().toISOString().split('T')[0];
    const cacheKey = `${brand}_${productFamily}_${tier}_${dateStr}`.toUpperCase();

    if (pdfCache.has(cacheKey)) {
        console.log(`[M1] Cache HIT for: ${cacheKey}`);
        return pdfCache.get(cacheKey);
    }

    console.log(`[M1] Cache MISS for: ${cacheKey}. Generating new PDF...`);
    const rawTemplateBuffer = await downloadTemplate(brand, productFamily, tier);
    const processedDocx = injectTodaysDate(rawTemplateBuffer);
    const pdfBuffer = await convertToPdfViaGraph(processedDocx);
    
    // Store in cache for subsequent sends today
    pdfCache.set(cacheKey, pdfBuffer);
    return pdfBuffer;
};

module.exports = { getCachedOrGeneratePdf };