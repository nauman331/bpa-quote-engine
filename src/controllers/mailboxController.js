/**
 * src/controllers/mailboxController.js
 * Handles incoming Graph change notifications for the shared mailbox.
 *
 * Full Flow:
 *   Email arrives (EstimateOne / BCI / Direct Builder)
 *   → Validate clientState
 *   → Fetch full message
 *   → Filter out replies, internal, and non-lead emails
 *   → Parse source + fields
 *   → Classify urgency via Claude Haiku
 *   → Persist lead to Supabase
 *   → Generate PDF, archive to SharePoint, send quote email
 *   → Schedule follow-ups in Supabase
 */
const { fetchMessage } = require('../services/mailboxService');
const { parseInboundEmail } = require('../services/parseService');
const { analyzeLeadEmail } = require('../services/classifyService');
const { insertLead, insertQuote, insertSend, scheduleFollowUps, writeAuditLog } = require('../services/supabaseService');
const { buildCanonicalTitle, buildPdfFileName } = require('../services/namingService');
const { getCachedOrGeneratePdf } = require('../services/documentService');
const { uploadPdfToArchive } = require('../services/archiveService');
const { sendQuoteEmail } = require('../services/mailService');

// Set of already-processed message IDs to prevent duplicate processing
const processedMessages = new Set();

/**
 * Returns true if the email looks like a genuine inbound lead (not a reply, bounce, or internal).
 */
const isLeadEmail = (message) => {
    const subject = (message.subject || '').toLowerCase();
    const from = message.from?.emailAddress?.address?.toLowerCase() || '';

    // Skip replies and forwards
    if (subject.startsWith('re:') || subject.startsWith('fwd:') || subject.startsWith('fw:')) return false;

    // Skip Microsoft delivery failures and auto-replies
    if (subject.startsWith('undeliverable:') || subject.startsWith('automatic reply:') || subject.startsWith('delivery:')) return false;

    // Skip bounces from mailer daemons
    if (from.includes('mailer-daemon') || from.includes('postmaster')) return false;

    // Skip emails from our own domain (internal) — catches bounce-backs from our own sends
    if (from.includes('brisbanepumpaction.com.au') || from.includes('gcpumpaction.com.au')) return false;

    // Skip emails whose subject is one of OUR own outgoing quote titles
    // (these are bounce-backs of quotes we sent that ended up back in the inbox)
    if (subject.includes('bpa price list') || subject.includes('gcpa price list') ||
        subject.includes('bpa sattelite price list')) return false;

    return true;
};


const handleMailboxNotification = async (req, res) => {
    // Graph sends a validationToken query param on first subscription setup
    if (req.query.validationToken) {
        console.log('[Mailbox] Subscription validation request received.');
        return res.status(200).set('Content-Type', 'text/plain').send(req.query.validationToken);
    }

    // Respond 202 immediately — Graph will retry if we don't respond within 10s
    res.status(202).send();

    const notifications = req.body?.value || [];

    for (const notification of notifications) {
        try {
            // Validate the clientState secret
            const expectedState = process.env.MAILBOX_CLIENT_STATE || 'bpa-sales-engine-secret';
            if (notification.clientState !== expectedState) {
                console.warn('[Mailbox] Invalid clientState — ignoring.');
                continue;
            }

            const messageId = notification.resourceData?.id;
            if (!messageId) continue;

            // Idempotency check
            if (processedMessages.has(messageId)) {
                console.log(`[Mailbox] Already processed messageId=${messageId} — skipping.`);
                continue;
            }
            processedMessages.add(messageId);

            console.log(`[Mailbox] New email received. Fetching messageId=${messageId}...`);

            // Fetch full message
            const message = await fetchMessage(messageId);

            // Filter — skip replies, internal, non-lead emails
            if (!isLeadEmail(message)) {
                console.log(`[Mailbox] Skipping non-lead email: "${message.subject}" from ${message.from?.emailAddress?.address}`);
                continue;
            }

            // Parse source + structured fields (Regex best-effort)
            const parsed = parseInboundEmail(message);

            // AI Validation & Extraction via Claude Haiku
            const aiAnalysis = await analyzeLeadEmail(parsed.subject, parsed.rawBody);
            const urgencyDisplay = (aiAnalysis.urgency || 'N/A').toUpperCase();
            console.log(`[Mailbox] AI Analysis: isLead=${aiAnalysis.isLead} | urgency=${urgencyDisplay} | reason=${aiAnalysis.reason}`);

            if (!aiAnalysis.isLead) {
                console.log(`[Mailbox] ⛔ AI determined this is NOT a lead (invoice/spam/general). Pipeline stopped.`);
                continue;
            }

            // Merge AI extraction with Regex extraction (AI wins if it found something, especially for DirectBuilders)
            const finalBuilderName = aiAnalysis.builderName || parsed.builderName;
            const finalProjectName = aiAnalysis.projectName || parsed.projectName;

            console.log(`[Mailbox] Final Lead: source=${parsed.source}, builder=${finalBuilderName}, project=${finalProjectName}`);

            // Persist lead to Supabase
            const lead = await insertLead({
                source: parsed.source,
                payload: { ...parsed, builderName: finalBuilderName, projectName: finalProjectName },
                urgency: aiAnalysis.urgency,
                urgencyReason: aiAnalysis.reason,
            });

            // Determine brand from which mailbox (BPA for now — GCPA will need separate subscription)
            const brand = 'BPA';
            const productFamily = 'Mobile Rates';
            const tier = 'DD';
            const recipientEmail = parsed.senderEmail;

            if (!recipientEmail) {
                console.warn(`[Mailbox] No sender email — cannot send quote for lead ${lead.id}`);
                continue;
            }

            // Build canonical title + filename
            const canonicalTitle = buildCanonicalTitle(brand, tier, finalBuilderName, finalProjectName);
            const pdfFileName = buildPdfFileName(canonicalTitle);
            console.log(`[M0] Ingested: ${canonicalTitle}`);

            // Generate PDF (with daily cache)
            const pdfBuffer = await getCachedOrGeneratePdf(brand, productFamily, tier);

            // Archive to SharePoint
            await uploadPdfToArchive(brand, productFamily, pdfFileName, pdfBuffer);

            // Send quote email (BCC auto-creates HubSpot deal via subject-line trigger)
            await sendQuoteEmail(brand, recipientEmail, canonicalTitle, pdfFileName, pdfBuffer);

            // Persist quote + send + schedule follow-ups
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

