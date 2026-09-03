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
const injectTodaysDate = (templateBuffer, fileName) => {
    // Only parse if it's a docx
    if (!fileName.toLowerCase().endsWith('.docx')) {
        console.log(`[M1] Skipping date injection for non-docx file: ${fileName}`);
        return templateBuffer;
    }

    try {
        const zip = new PizZip(templateBuffer);
        
        // Format date to match "d MMM. yy" (e.g., "31 Aug. 26")
        const formattedDate = new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'short',
            year: '2-digit'
        }).format(new Date()).replace(/([a-zA-Z]+)/, '$1.');

        // Regex to match dates like "10 Mar. 26" or "1 Aug. 26" inside the XML text nodes
        const dateRegex = /\b\d{1,2}\s[A-Za-z]{3}\.\s\d{2}\b/g;

        Object.keys(zip.files).forEach(xmlName => {
            if (xmlName.endsWith('.xml')) {
                let content = zip.files[xmlName].asText();
                if (dateRegex.test(content)) {
                    content = content.replace(dateRegex, formattedDate);
                    zip.file(xmlName, content);
                    console.log(`[M1] Injected today's date (${formattedDate}) into ${xmlName}`);
                }
            }
        });

        return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    } catch (err) {
        console.error(`[M1] Error parsing zip for date injection on ${fileName}:`, err.message);
        return templateBuffer; // Fallback to raw buffer
    }
};

const convertToPdfViaGraph = async (docBuffer, originalFileName) => {
    const token = await getGraphToken();
    const siteId = process.env.BPA_DRIVE_ID;

    // Use the original extension (either .doc or .docx)
    const ext = originalFileName.toLowerCase().endsWith('.docx') ? '.docx' : '.doc';
    const tempFileName = `temp_${Date.now()}${ext}`;
    const contentType = ext === '.docx' 
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/msword';

    // 1. Upload temporary doc to Graph 
    const uploadRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/Temp/${tempFileName}:/content`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': contentType },
        body: docBuffer
    });

    if (!uploadRes.ok) throw new Error(`Temp upload failed: ${await uploadRes.text()}`);
    const uploadData = await uploadRes.json();

    // 2. Download as PDF (Graph automatically evaluates native Word DATE fields during PDF rendering)
    const pdfRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${uploadData.id}/content?format=pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!pdfRes.ok) {
        const errText = await pdfRes.text();
        throw new Error(`Graph PDF conversion failed: ${pdfRes.status} ${pdfRes.statusText} - ${errText}`);
    }
    
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // 3. Clean up temporary doc 
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
    const { buffer: rawTemplateBuffer, fileName } = await downloadTemplate(brand, productFamily, tier);
    const processedDoc = injectTodaysDate(rawTemplateBuffer, fileName);
    const pdfBuffer = await convertToPdfViaGraph(processedDoc, fileName);
    
    // Store in cache for subsequent sends today
    pdfCache.set(cacheKey, pdfBuffer);
    return pdfBuffer;
};

module.exports = { getCachedOrGeneratePdf };