const { processLegacyWebhook } = require('../services/hubspotService');
const { validateQuoteData } = require('../models/quoteModel');
const { buildCanonicalTitle, buildPdfFileName } = require('../services/namingService');
const { downloadTemplate, uploadPdfToArchive } = require('../services/archiveService');
const { generateQuotePdf } = require('../services/documentService');
const { sendQuoteEmail } = require('../services/mailService');

const handleHubspotWebhook = async (req, res) => {
    try {
        const result = await processLegacyWebhook(req.body);

        if (!result.shouldProcess) {
            return res.status(200).json({ status: 'ignored' });
        }

        const validation = validateQuoteData(result.data);
        if (!validation.isValid) {
            return res.status(400).json({ status: 'error', message: validation.errors });
        }

        const payload = validation.data;
        const canonicalTitle = buildCanonicalTitle(
            payload.brand,
            payload.tier,
            payload.clientName,
            payload.projectName
        );
        const pdfFileName = buildPdfFileName(canonicalTitle);
        const templateBuffer = await downloadTemplate(payload.brand, payload.productFamily, payload.tier);
        const pdfBuffer = await generateQuotePdf(templateBuffer, payload);

        await uploadPdfToArchive(payload.brand, payload.productFamily, pdfFileName, pdfBuffer);
        await sendQuoteEmail(
            payload.brand,
            payload.recipientEmail,
            canonicalTitle,
            pdfFileName,
            pdfBuffer
        );

        return res.status(200).json({
            status: 'success',
            message: 'Pipeline Complete: Lead processed, generated, archived, and emailed.',
            data: { canonicalTitle, pdfFileName }
        });
    } catch (error) {
        console.error('[Pipeline Error]:', error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = { handleHubspotWebhook };