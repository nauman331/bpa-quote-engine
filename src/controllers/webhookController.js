const { mapHubspotToQuotePayload } = require('../services/hubspotService');
const { validateQuoteData } = require('../models/quoteModel');
const { buildCanonicalTitle, buildPdfFileName } = require('../services/namingService');
const { downloadTemplate, uploadPdfToArchive } = require('../services/archiveService');
const { generateQuotePdf } = require('../services/documentService');
const { sendQuoteEmail } = require('../services/mailService');

const handleHubspotWebhook = async (req, res) => {
    try {
        console.log('[M0] Incoming HubSpot Webhook received.');

        // 1. Map the raw third-party data to our standard schema
        const payload = mapHubspotToQuotePayload(req.body);

        // 2. Validate the mapped payload
        const validation = validateQuoteData(payload);
        if (!validation.isValid) {
            console.error('[M0] Validation Error:', validation.errors);
            return res.status(400).json({ status: 'error', message: validation.errors });
        }

        const validData = validation.data;

        // 3. Format Naming Conventions
        const canonicalTitle = buildCanonicalTitle(
            validData.brand,
            validData.tier,
            validData.clientName,
            validData.projectName
        );
        const pdfFileName = buildPdfFileName(canonicalTitle);

        console.log(`[M0] Processing lead for: ${canonicalTitle}`);

        // 4. Retrieve Master Template from SharePoint (M1)
        const templateBuffer = await downloadTemplate(validData.brand, validData.productFamily, validData.tier);

        // 5. Generate Live PDF via Graph (M1)
        const pdfBuffer = await generateQuotePdf(templateBuffer, validData);

        // 6. Archive to SharePoint/OneDrive (M1)
        await uploadPdfToArchive(validData.brand, validData.productFamily, pdfFileName, pdfBuffer);

        // 7. Dispatch Email via Graph (M2)
        await sendQuoteEmail(
            validData.brand,
            validData.recipientEmail,
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