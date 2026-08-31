const { validateQuoteData } = require('../models/quoteModel');
const { buildCanonicalTitle, buildPdfFileName } = require('../services/namingService');
const { getCachedOrGeneratePdf } = require('../services/documentService');
const { uploadPdfToArchive } = require('../services/archiveService');
const { sendQuoteEmail } = require('../services/mailService');

const handleGenerateAndSend = async (req, res) => {
    try {
        // 1. Ingest & Validate Incoming Lead Data (M0)
        const validation = validateQuoteData(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ status: 'error', message: validation.errors });
        }
        const payload = validation.data;

        // 2. Format Naming Conventions
        const canonicalTitle = buildCanonicalTitle(
            payload.brand,
            payload.tier,
            payload.clientName,
            payload.projectName
        );
        const pdfFileName = buildPdfFileName(canonicalTitle);

        console.log(`[M0] Ingested live lead for: ${canonicalTitle}`);

        // 3. Retrieve or Generate PDF via Cache (M1)
        const pdfBuffer = await getCachedOrGeneratePdf(payload.brand, payload.productFamily, payload.tier);

        // 4. Archive to SharePoint/OneDrive (M1)
        await uploadPdfToArchive(payload.brand, payload.productFamily, pdfFileName, pdfBuffer);

        // 6. Dispatch Email via Graph (M2)
        await sendQuoteEmail(
            payload.brand,
            payload.recipientEmail,
            canonicalTitle,
            pdfFileName,
            pdfBuffer
        );

        return res.status(200).json({
            status: 'success',
            message: 'Complete Pipeline Executed: PDF Generated, Archived, and Emailed.',
            data: { canonicalTitle, pdfFileName }
        });

    } catch (err) {
        console.error('Pipeline Error:', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

module.exports = { handleGenerateAndSend };