const { validateQuoteData } = require('../models/quoteModel');
const { buildCanonicalTitle, buildPdfFileName } = require('../services/namingService');
const { getCachedOrGeneratePdf } = require('../services/documentService');
const { uploadPdfToArchive, downloadPdfFromArchive } = require('../services/archiveService');
const { sendQuoteEmail } = require('../services/mailService');
const { insertQuote, insertSend, scheduleFollowUps, writeAuditLog, verifyDealInMirror, hasRecentQuoteForRecipient, getQuoteById, updateSendStatus, getPendingQuotes } = require('../services/supabaseService');
const { appendExcelLog } = require('../services/excelService');
const { canDispatchEmails, canWriteSharePoint, isDryRun } = require('../utils/safetyGuards');

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

        console.log(`[M0] Ingested quote request for: ${canonicalTitle}`);

        if (payload.recipientEmail) {
            const isDuplicate = await hasRecentQuoteForRecipient(payload.recipientEmail, canonicalTitle);
            if (isDuplicate) {
                console.warn(`[Quote] Duplicate send prevented: quote for ${canonicalTitle} already sent to ${payload.recipientEmail} in last 24h.`);
                return res.status(409).json({
                    status: 'skipped',
                    message: 'A quote for this project was already dispatched to this recipient within the last 24 hours.',
                    data: { canonicalTitle, pdfFileName }
                });
            }
        }

        const pdfBuffer = await getCachedOrGeneratePdf(payload.brand, payload.productFamily, payload.tier);

        if (process.env.REQUIRE_APPROVAL === 'true') {
            const quote = await insertQuote({ leadId: null, canonicalTitle, pdfFileName });
            if (payload.recipientEmail) {
                await insertSend({ quoteId: quote.id, recipientEmail: payload.recipientEmail, status: 'pending_approval' });
            }
            await writeAuditLog('quote_staged_for_approval', { canonicalTitle, pdfFileName, recipientEmail: payload.recipientEmail || null });
            return res.status(200).json({
                status: 'staged',
                message: 'Review & Confirmation Gate active: Quote generated and staged for operator approval in Pending Review queue.',
                data: { quoteId: quote.id, canonicalTitle, pdfFileName, status: 'pending_approval' }
            });
        }

        if (canWriteSharePoint()) {
            await uploadPdfToArchive(payload.brand, payload.productFamily, pdfFileName, pdfBuffer);
        } else {
            console.log(`[Quote] [DRY RUN / PAUSED] SharePoint upload skipped for ${pdfFileName}`);
        }

        if (payload.recipientEmail && canDispatchEmails()) {
            await sendQuoteEmail(
                payload.brand,
                payload.recipientEmail,
                canonicalTitle,
                pdfFileName,
                pdfBuffer
            );
        } else {
            console.log(`[Quote] [DRY RUN / PAUSED] Outbound email skipped for ${payload.recipientEmail || 'unspecified recipient'}`);
        }

        try {
            const quote = await insertQuote({ leadId: null, canonicalTitle, pdfFileName });
            if (payload.recipientEmail) {
                const send = await insertSend({ quoteId: quote.id, recipientEmail: payload.recipientEmail });
                await scheduleFollowUps({
                    sendId: send.id,
                    recipientEmail: payload.recipientEmail,
                    canonicalTitle,
                    brand: payload.brand,
                    clientName: payload.clientName,
                    projectName: payload.projectName,
                });
            }
            await writeAuditLog('quote_sent', { canonicalTitle, pdfFileName, recipientEmail: payload.recipientEmail || null, dryRun: isDryRun() });

            if (canWriteSharePoint()) {
                await appendExcelLog(canonicalTitle, payload.clientName, payload.projectName, payload.recipientEmail || 'N/A');
            } else {
                console.log(`[Quote] [DRY RUN / PAUSED] Excel log append skipped for ${canonicalTitle}`);
            }

            setTimeout(() => {
                verifyDealInMirror(canonicalTitle).catch(console.error);
            }, 60000);

        } catch (dbErr) {
            console.error('[DB] Persistence/Excel write failed (non-blocking):', dbErr.message);
        }

        return res.status(200).json({
            status: 'success',
            message: isDryRun() ? 'Dry run completed: PDF generated and logged.' : 'Complete Pipeline Executed: PDF Generated, Archived, and Emailed.',
            data: { canonicalTitle, pdfFileName, dryRun: isDryRun() }
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

        const pdfBuffer = await downloadPdfFromArchive(file);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${file}"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('[Download Quote Error]', error.message);
        res.status(500).json({ error: 'Failed to download quote document' });
    }
};

const handleApproveQuote = async (req, res) => {
    try {
        const quoteId = req.params.id || req.body.quoteId;
        if (!quoteId) return res.status(400).json({ error: 'Quote ID is required.' });

        const quote = await getQuoteById(quoteId);
        if (!quote) return res.status(404).json({ error: 'Quote not found.' });

        const send = quote.sends?.[0] || {};
        const lead = quote.leads || {};
        const payload = lead.payload || {};
        const recipientEmail = send.recipient_email || payload.senderEmail;
        const clientName = payload.builderName || 'General Client';
        const projectName = payload.projectName || 'General Works';
        const brand = 'BPA';
        const productFamily = 'Mobile Rates';
        const tier = 'DD';

        const pdfBuffer = await getCachedOrGeneratePdf(brand, productFamily, tier);

        if (canWriteSharePoint()) {
            await uploadPdfToArchive(brand, productFamily, quote.pdf_filename, pdfBuffer);
        }

        if (recipientEmail && canDispatchEmails()) {
            await sendQuoteEmail(
                brand,
                recipientEmail,
                quote.canonical_title,
                quote.pdf_filename,
                pdfBuffer
            );
        }

        await updateSendStatus(quoteId, 'sent');

        if (recipientEmail && send.id) {
            await scheduleFollowUps({
                sendId: send.id,
                recipientEmail,
                canonicalTitle: quote.canonical_title,
                brand,
                clientName,
                projectName,
            });
        }

        if (canWriteSharePoint()) {
            await appendExcelLog(quote.canonical_title, clientName, projectName, recipientEmail || 'N/A');
        }

        await writeAuditLog('quote_approved_and_sent', {
            quoteId,
            canonicalTitle: quote.canonical_title,
            recipientEmail,
            dryRun: isDryRun()
        });

        return res.status(200).json({
            status: 'success',
            message: 'Quote approved and dispatched successfully.',
            data: { quoteId, canonicalTitle: quote.canonical_title }
        });
    } catch (err) {
        console.error('Approve Quote Error:', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

const handleRejectQuote = async (req, res) => {
    try {
        const quoteId = req.params.id || req.body.quoteId;
        if (!quoteId) return res.status(400).json({ error: 'Quote ID is required.' });

        await updateSendStatus(quoteId, 'rejected');
        await writeAuditLog('quote_rejected', { quoteId });

        return res.status(200).json({
            status: 'success',
            message: 'Quote rejected successfully.',
            data: { quoteId }
        });
    } catch (err) {
        console.error('Reject Quote Error:', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

const handleGetPendingQuotes = async (req, res) => {
    try {
        const pendingQuotes = await getPendingQuotes();
        return res.status(200).json({ status: 'success', data: pendingQuotes });
    } catch (err) {
        console.error('Get Pending Quotes Error:', err);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

module.exports = {
    handleGenerateAndSend,
    handleDownloadQuote,
    handleApproveQuote,
    handleRejectQuote,
    handleGetPendingQuotes
};
