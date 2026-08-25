const generateDDQuote = async (payload, templateBuffer, graphClient) => {

    const pdfBuffer = await convertDocxToPdfViaGraph(templateBuffer, graphClient);

    return pdfBuffer;
};

/**
 * DUMMY PDF CONVERTER (Waiting on Azure Credentials)
 */
const convertDocxToPdfViaGraph = async (docxBuffer, graphClient) => {
    console.log('[MOCK] Passing raw template to PDF converter...');
    return docxBuffer;
};

module.exports = {
    generateDDQuote
};