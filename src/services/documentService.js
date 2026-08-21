const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const populateTemplate = (templateBuffer, payload) => {
    try {
        const zip = new PizZip(templateBuffer);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });

        doc.render({
            brand: payload.brand,
            clientName: payload.clientName,
            projectName: payload.projectName,
            ...payload.rates
        });

        return doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
        });
    } catch (error) {
        console.error('Error populating docx template:', error);
        throw new Error('Template population failed');
    }
};

/**
 * DUMMY PDF CONVERTER (To be swapped with MS Graph API)
 * For now, we will just return the DOCX buffer as a fake PDF so the pipeline keeps moving.
 */
const convertDocxToPdfMock = async (docxBuffer) => {
    console.log('[MOCK] Converting DOCX to PDF...');
    // In a real scenario, this buffer will be PDF bytes. 
    // We pass the docx buffer through just so we have a file to save.
    return docxBuffer;
};

module.exports = {
    populateTemplate,
    convertDocxToPdfMock
};