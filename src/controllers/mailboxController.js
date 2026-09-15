const { fetchMessage, fetchRecentMessages } = require('../services/mailboxService');
const { parseInboundEmail } = require('../services/parseService');
const { analyzeLeadEmail } = require('../services/classifyService');
const { insertLead, insertQuote, insertSend, scheduleFollowUps, writeAuditLog, hasRecentQuoteForRecipient } = require('../services/supabaseService');
const { buildCanonicalTitle, buildPdfFileName } = require('../services/namingService');
const { getCachedOrGeneratePdf } = require('../services/documentService');
const { uploadPdfToArchive } = require('../services/archiveService');
const { sendQuoteEmail } = require('../services/mailService');
const { appendExcelLog } = require('../services/excelService');
const { canDispatchEmails, canWriteSharePoint, isDryRun } = require('../utils/safetyGuards');

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

const processMessage = async (message) => {
    if (!isLeadEmail(message)) {
        console.log(`[Mailbox] Skipping non-lead email: "${message.subject}" from ${message.from?.emailAddress?.address}`);
        return null;
    }

    if (process.env.SAFE_TEST_MODE === 'true') {
        const senderAddr = (message.from?.emailAddress?.address || '').toLowerCase();
        const allowedSendersStr = process.env.ALLOWED_TEST_SENDERS;
        const allowedSenders = allowedSendersStr ? allowedSendersStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
        if (allowedSenders.length > 0 && !allowedSenders.includes(senderAddr)) {
            console.log(`[Mailbox] [SAFE TEST MODE] Skipping email from non-whitelisted sender: ${senderAddr}`);
            return null;
        }
    }

    const parsed = parseInboundEmail(message);

    const aiAnalysis = await analyzeLeadEmail(parsed.subject, parsed.rawBody);
    const urgencyDisplay = (aiAnalysis.urgency || 'N/A').toUpperCase();
    console.log(`[Mailbox] AI Analysis: isLead=${aiAnalysis.isLead} | urgency=${urgencyDisplay} | reason=${aiAnalysis.reason}`);

    if (!aiAnalysis.isLead) {
        console.log(`[Mailbox] ⛔ AI determined this is NOT a lead (invoice/spam/general). Pipeline stopped.`);
        return null;
    }

    const finalBuilderName = aiAnalysis.builderName || parsed.builderName || 'General Client';
    const finalProjectName = aiAnalysis.projectName || parsed.projectName || 'General Works';

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
        return lead;
    }

    const canonicalTitle = buildCanonicalTitle(brand, tier, finalBuilderName, finalProjectName);
    const pdfFileName = buildPdfFileName(canonicalTitle);
    console.log(`[M0] Ingested: ${canonicalTitle}`);

    const isDuplicate = await hasRecentQuoteForRecipient(recipientEmail, canonicalTitle);
    if (isDuplicate) {
        console.log(`[Mailbox] Duplicate quote prevented: ${canonicalTitle} already dispatched to ${recipientEmail} in last 24h.`);
        return lead;
    }

    const pdfBuffer = await getCachedOrGeneratePdf(brand, productFamily, tier);

    if (process.env.REQUIRE_APPROVAL === 'true') {
        const quote = await insertQuote({ leadId: lead.id, canonicalTitle, pdfFileName });
        await insertSend({ quoteId: quote.id, recipientEmail, status: 'pending_approval' });
        await writeAuditLog('quote_staged_for_approval', { canonicalTitle, pdfFileName, recipientEmail, source: parsed.source, urgency: aiAnalysis.urgency });
        console.log(`[Mailbox] ⏸️  Quote staged for review (REQUIRE_APPROVAL=true): ${canonicalTitle} → ${recipientEmail}`);
        return { lead, quote, status: 'staged' };
    }

    if (canWriteSharePoint()) {
        await uploadPdfToArchive(brand, productFamily, pdfFileName, pdfBuffer);
    } else {
        console.log(`[Mailbox] [DRY RUN / PAUSED] SharePoint upload skipped for ${pdfFileName}`);
    }

    if (canDispatchEmails()) {
        await sendQuoteEmail(brand, recipientEmail, canonicalTitle, pdfFileName, pdfBuffer);
    } else {
        console.log(`[Mailbox] [DRY RUN / PAUSED] Outbound email skipped for ${recipientEmail}`);
    }

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
    await writeAuditLog('quote_sent', { canonicalTitle, pdfFileName, recipientEmail, source: parsed.source, urgency: aiAnalysis.urgency, dryRun: isDryRun() });

    if (canWriteSharePoint()) {
        await appendExcelLog(canonicalTitle, finalBuilderName, finalProjectName, recipientEmail);
    } else {
        console.log(`[Mailbox] [DRY RUN / PAUSED] Excel log append skipped for ${canonicalTitle}`);
    }

    console.log(`[Mailbox] ✅ Full pipeline complete: ${canonicalTitle} → ${recipientEmail} [${urgencyDisplay}]`);
    return { lead, quote, status: 'sent' };
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
            const expectedState = process.env.MAILBOX_CLIENT_STATE;
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
            if (!message) {
                console.warn(`[Mailbox] Message ${messageId} could not be fetched.`);
                continue;
            }

            await processMessage(message);

        } catch (err) {
            console.error(`[Mailbox] Failed processing notification:`, err.message);
        }
    }
};

const handleSyncMailbox = async (req, res) => {
    try {
        const messages = await fetchRecentMessages(5);
        const results = [];
        for (const msg of messages) {
            if (processedMessages.has(msg.id)) continue;
            processedMessages.add(msg.id);
            const resData = await processMessage(msg);
            if (resData) results.push(resData);
        }
        return res.status(200).json({ status: 'success', processedCount: results.length, results });
    } catch (err) {
        console.error('[Mailbox Sync Error]:', err);
        return res.status(500).json({ error: err.message });
    }
};

module.exports = {
    handleMailboxNotification,
    handleSyncMailbox
};
