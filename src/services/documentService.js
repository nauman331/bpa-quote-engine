/**
 * src/services/documentService.js
 * Smart-routes the document generation and converts to PDF via MS Graph.
 */
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { getGraphToken } = require('./graphAuth');

const processTemplate = (templateBuffer, payload) => {
    // 1. Smart Routing: If Mobile Rates, return buffer immediately (100% static)
    if (payload.productFamily === 'Mobile Rates') {
        console.log('[M1] Mobile Rates detected. Bypassing data injection.');
        return templateBuffer;
    }

    // 2. If Static Line, inject the Client and Project names
    console.log('[M1] Static Line detected. Injecting template variables.');
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    doc.render({
        clientName: payload.clientName,
        projectName: payload.projectName
    });

    return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
};

const convertToPdfViaGraph = async (docxBuffer) => {
    const token = await getGraphToken();
    const driveId = process.env.BPA_DRIVE_ID; // Temporary location for conversion

    // 1. Upload temporary docx to Graph
    const tempFileName = `temp_${Date.now()}.docx`;
    const uploadRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root:/Temp/${tempFileName}:/content`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        body: docxBuffer
    });
    const uploadData = await uploadRes.json();

    // 2. Download as PDF (Graph auto-updates the DATE field during this step)
    const pdfRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${uploadData.id}/content?format=pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // 3. Clean up temporary docx
    await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${uploadData.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    return pdfBuffer;
};

const generateQuotePdf = async (templateBuffer, payload) => {
    const processedDocx = processTemplate(templateBuffer, payload);
    const pdfBuffer = await convertToPdfViaGraph(processedDocx);
    return pdfBuffer;
};

module.exports = { generateQuotePdf };