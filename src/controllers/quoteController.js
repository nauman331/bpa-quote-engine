const { validateQuoteData } = require('../models/quoteModel');
const { buildCanonicalTitle, buildPdfFileName } = require('../services/namingService');
const { getCachedOrGeneratePdf } = require('../services/documentService');
const { uploadPdfToArchive } = require('../services/archiveService');
const { sendQuoteEmail } = require('../services/mailService');
const { insertQuote, insertSend, scheduleFollowUps, writeAuditLog, verifyDealInMirror } = require('../services/supabaseService');
const { appendExcelLog } = require('../services/excelService');

const handleGenerateAndSend = async (req, res) => {
    try {

        const validation = validateQuoteData(req.body);
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

        console.log(`[M0] Ingested live lead for: ${canonicalTitle}`);

        const pdfBuffer = await getCachedOrGeneratePdf(payload.brand, payload.productFamily, payload.tier);

        await uploadPdfToArchive(payload.brand, payload.productFamily, pdfFileName, pdfBuffer);

        await sendQuoteEmail(
            payload.brand,
            payload.recipientEmail,
            canonicalTitle,
            pdfFileName,
            pdfBuffer
        );

        try {
            const quote = await insertQuote({ leadId: null, canonicalTitle, pdfFileName });
            const send  = await insertSend({ quoteId: quote.id, recipientEmail: payload.recipientEmail });
            await scheduleFollowUps({
                sendId:       send.id,
                recipientEmail: payload.recipientEmail,
                canonicalTitle,
                brand:        payload.brand,
                clientName:   payload.clientName,
                projectName:  payload.projectName,
            });
            await writeAuditLog('quote_sent', { canonicalTitle, pdfFileName, recipientEmail: payload.recipientEmail });

            await appendExcelLog(canonicalTitle, payload.clientName, payload.projectName, payload.recipientEmail);

            setTimeout(() => {
                verifyDealInMirror(canonicalTitle).catch(console.error);
            }, 60000);

        } catch (dbErr) {

            console.error('[DB] Persistence/Excel write failed (non-blocking):', dbErr.message);
        }

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

const handleDownloadQuote = async (req, res) => {
    try {
        const { file } = req.query;
        if (!file) return res.status(400).json({ error: 'file query parameter is required' });

        const { downloadPdfFromArchive } = require('../services/archiveService');
        const pdfBuffer = await downloadPdfFromArchive(file);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${file}"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('[Download Quote Error]', error.message);
        res.status(500).json({ error: 'Failed to download quote document' });
    }
};

module.exports = {
    handleGenerateAndSend,
    handleDownloadQuote
};
