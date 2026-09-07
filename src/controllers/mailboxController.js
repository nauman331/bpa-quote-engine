const { fetchMessage } = require('../services/mailboxService');
const { parseInboundEmail } = require('../services/parseService');
const { analyzeLeadEmail } = require('../services/classifyService');
const { insertLead, insertQuote, insertSend, scheduleFollowUps, writeAuditLog } = require('../services/supabaseService');
const { buildCanonicalTitle, buildPdfFileName } = require('../services/namingService');
const { getCachedOrGeneratePdf } = require('../services/documentService');
const { uploadPdfToArchive } = require('../services/archiveService');
const { sendQuoteEmail } = require('../services/mailService');

const processedMessages = new Set();

const isLeadEmail = (message) => {
    const subject = (message.subject || '').toLowerCase();
    const from = message.from?.emailAddress?.address?.toLowerCase() || '';

    if (subject.startsWith('re:') || subject.startsWith('fwd:') || subject.startsWith('fw:')) return false;

    if (subject.startsWith('undeliverable:') || subject.startsWith('automatic reply:') || subject.startsWith('delivery:')) return false;

    if (from.includes('mailer-daemon') || from.includes('postmaster')) return false;

    if (from.includes('brisbanepumpaction.com.au') || from.includes('gcpumpaction.com.au')) return false;

    if (subject.includes('bpa price list') || subject.includes('gcpa price list') ||
        subject.includes('bpa sattelite price list')) return false;

    return true;
};

const handleMailboxNotification = async (req, res) => {

    if (req.query.validationToken) {
        console.log('[Mailbox] Subscription validation request received.');
        return res.status(200).set('Content-Type', 'text/plain').send(req.query.validationToken);
    }

    res.status(202).send();

    if (process.env.ENABLE_AUTOMATION !== 'true') {
        console.log('[Mailbox] ⏸️  Automation is paused (ENABLE_AUTOMATION!=true). Webhook notification acknowledged without pipeline processing.');
        return;
    }

    const notifications = req.body?.value || [];

    for (const notification of notifications) {
        try {

            const expectedState = process.env.MAILBOX_CLIENT_STATE || 'bpa-sales-engine-secret';
            if (notification.clientState !== expectedState) {
                console.warn('[Mailbox] Invalid clientState — ignoring.');
                continue;
            }

            const messageId = notification.resourceData?.id;
            if (!messageId) continue;

            if (processedMessages.has(messageId)) {
                console.log(`[Mailbox] Already processed messageId=${messageId} — skipping.`);
                continue;
            }
            processedMessages.add(messageId);

            console.log(`[Mailbox] New email received. Fetching messageId=${messageId}...`);

            const message = await fetchMessage(messageId);

            if (!isLeadEmail(message)) {
                console.log(`[Mailbox] Skipping non-lead email: "${message.subject}" from ${message.from?.emailAddress?.address}`);
                continue;
            }

            const parsed = parseInboundEmail(message);

            const aiAnalysis = await analyzeLeadEmail(parsed.subject, parsed.rawBody);
            const urgencyDisplay = (aiAnalysis.urgency || 'N/A').toUpperCase();
            console.log(`[Mailbox] AI Analysis: isLead=${aiAnalysis.isLead} | urgency=${urgencyDisplay} | reason=${aiAnalysis.reason}`);

            if (!aiAnalysis.isLead) {
                console.log(`[Mailbox] ⛔ AI determined this is NOT a lead (invoice/spam/general). Pipeline stopped.`);
                continue;
            }

            const finalBuilderName = aiAnalysis.builderName || parsed.builderName;
            const finalProjectName = aiAnalysis.projectName || parsed.projectName;

            console.log(`[Mailbox] Final Lead: source=${parsed.source}, builder=${finalBuilderName}, project=${finalProjectName}`);

            const lead = await insertLead({
                source: parsed.source,
                payload: { ...parsed, builderName: finalBuilderName, projectName: finalProjectName },
                urgency: aiAnalysis.urgency,
                urgencyReason: aiAnalysis.reason,
            });

            const brand = 'BPA';
            const productFamily = aiAnalysis.productFamily || 'Mobile Rates';
            const tier = 'DD';
            const recipientEmail = parsed.senderEmail;

            if (!recipientEmail) {
                console.warn(`[Mailbox] No sender email — cannot send quote for lead ${lead.id}`);
                continue;
            }

            const canonicalTitle = buildCanonicalTitle(brand, tier, finalBuilderName, finalProjectName);
            const pdfFileName = buildPdfFileName(canonicalTitle);
            console.log(`[M0] Ingested: ${canonicalTitle}`);

            const pdfBuffer = await getCachedOrGeneratePdf(brand, productFamily, tier);

            await uploadPdfToArchive(brand, productFamily, pdfFileName, pdfBuffer);

            await sendQuoteEmail(brand, recipientEmail, canonicalTitle, pdfFileName, pdfBuffer);

            const quote = await insertQuote({ leadId: lead.id, canonicalTitle, pdfFileName });
            const send = await insertSend({ quoteId: quote.id, recipientEmail });
            await scheduleFollowUps({
                sendId: send.id,
                recipientEmail,
                canonicalTitle,
                brand,
                clientName: finalBuilderName,
                projectName: finalProjectName,
            });
            await writeAuditLog('quote_sent', { canonicalTitle, pdfFileName, recipientEmail, source: parsed.source, urgency: aiAnalysis.urgency });

            console.log(`[Mailbox] ✅ Full pipeline complete: ${canonicalTitle} → ${recipientEmail} [${(aiAnalysis.urgency || 'N/A').toUpperCase()}]`);

        } catch (err) {
            console.error('[Mailbox] Pipeline error:', err.message);
        }
    }
};

module.exports = { handleMailboxNotification };
