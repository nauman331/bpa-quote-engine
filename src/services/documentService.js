const { getGraphToken } = require('./graphAuth');
const { downloadTemplate } = require('./archiveService');
const PizZip = require('pizzip');

const pdfCache = new Map();

const injectTodaysDate = (templateBuffer, fileName) => {

    const formattedDate = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: '2-digit'
    }).format(new Date()).replace(/([a-zA-Z]+)/, '$1.');

    if (fileName.toLowerCase().endsWith('.docx')) {
        try {
            const zip = new PizZip(templateBuffer);
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
            return templateBuffer;
        }
    }

    if (fileName.toLowerCase().endsWith('.doc')) {
        try {
            const docStr = templateBuffer.toString('binary');
            const docDateRegex = /\b\d{1,2}\s+[A-Za-z]{3}\.?\s+\d{2,4}\b/g;
            let replacedCount = 0;

            const modifiedStr = docStr.replace(docDateRegex, (match) => {

                let replacement = formattedDate;
                if (replacement.length < match.length) {
                    replacement = replacement.padEnd(match.length, ' ');
                } else if (replacement.length > match.length) {
                    replacement = replacement.substring(0, match.length);
                }
                replacedCount++;
                return replacement;
            });

            if (replacedCount > 0) {
                console.log(`[M1] Injected today's date (${formattedDate}) into binary .doc file (${replacedCount} match(es))`);
                return Buffer.from(modifiedStr, 'binary');
            }
            return templateBuffer;
        } catch (err) {
            console.error(`[M1] Error injecting date into .doc on ${fileName}:`, err.message);
            return templateBuffer;
        }
    }

    return templateBuffer;
};

const convertToPdfViaGraph = async (docBuffer, originalFileName) => {
    const token = await getGraphToken();
    const siteId = process.env.BPA_DRIVE_ID;

    const ext = originalFileName.toLowerCase().endsWith('.docx') ? '.docx' : '.doc';
    const tempFileName = `temp_${Date.now()}${ext}`;
    const contentType = ext === '.docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/msword';

    const uploadRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/Temp/${tempFileName}:/content`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': contentType },
        body: docBuffer
    });

    if (!uploadRes.ok) throw new Error(`Temp upload failed: ${await uploadRes.text()}`);
    const uploadData = await uploadRes.json();

    const pdfRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${uploadData.id}/content?format=pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!pdfRes.ok) {
        const errText = await pdfRes.text();
        throw new Error(`Graph PDF conversion failed: ${pdfRes.status} ${pdfRes.statusText} - ${errText}`);
    }

    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${uploadData.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    return pdfBuffer;
};

const getCachedOrGeneratePdf = async (brand, productFamily, tier) => {

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

    pdfCache.set(cacheKey, pdfBuffer);
    return pdfBuffer;
};

module.exports = { getCachedOrGeneratePdf };
