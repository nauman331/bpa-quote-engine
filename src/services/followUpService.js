const { getDueFollowUps, markFollowUpSent } = require('./supabaseService');
const { getGraphToken } = require('./graphAuth');
const { escapeHtml } = require('../utils/sanitize');
const { isAutomationEnabled, canDispatchEmails } = require('../utils/safetyGuards');

const buildTouch1Html = ({ clientName, projectName }) => {
    const safeClient = escapeHtml(clientName || 'there');
    const safeProject = escapeHtml(projectName || 'your upcoming project');

    return `<!DOCTYPE html>
<html><body style="font-family: Aptos, sans-serif; font-size: 12pt; color: rgb(36,36,36);">
<div>Hi ${safeClient},</div><br>
<div>I just wanted to follow up on the schedule of rates I sent through for <b>${safeProject}</b>.</div><br>
<div>Please don't hesitate to reach out if you have any questions or if there's anything we can clarify for you.</div><br>
<div>We would love the opportunity to assist with your concrete pumping requirements.</div><br>
<div>Thank you,</div><br>
<div style="font-family: Gadugi, sans-serif;">
  <div style="font-size:12pt;color:rgb(21,96,130);"><b>Steve</b></div>
  <div>BPA Sales Team</div>
  <div style="font-size:10pt;color:rgb(89,89,89);">Brisbane Pump Action Pty Ltd<br>Ph: 07 3888 2660</div>
</div>
</body></html>`;
};

const buildTouch2Html = ({ clientName, projectName }) => {
    const safeClient = escapeHtml(clientName || 'there');
    const safeProject = escapeHtml(projectName || 'your project');

    return `<!DOCTYPE html>
<html><body style="font-family: Aptos, sans-serif; font-size: 12pt; color: rgb(36,36,36);">
<div>Hi ${safeClient},</div><br>
<div>I'm Chris Turner, Director of Brisbane Pump Action.</div><br>
<div>I wanted to personally reach out regarding our rates for <b>${safeProject}</b>.
We've been pumping concrete across South East Queensland for over 20 years and I'd love to discuss
how we can support your project.</div><br>
<div>If you have a moment, I'd welcome a quick call — 0461 459 755.</div><br>
<div>Kind regards,</div><br>
<div style="font-family: Gadugi, sans-serif;">
  <div style="font-size:12pt;color:rgb(21,96,130);"><b>Chris Turner</b></div>
  <div>Director — Brisbane Pump Action Pty Ltd</div>
  <div style="font-size:10pt;color:rgb(89,89,89);">Ph: 0461 459 755</div>
</div>
</body></html>`;
};

const sendFollowUpEmail = async (followUp, htmlBody) => {
    if (!followUp?.recipient_email) {
        console.warn('[FollowUp] Missing recipient_email — cannot send follow-up.');
        return;
    }

    if (!canDispatchEmails()) {
        console.log(`[FollowUp] [DRY RUN / PAUSED] Follow-up send skipped: "${followUp.canonical_title}" -> ${followUp.recipient_email}`);
        return;
    }

    const token = await getGraphToken();

    const isBPA = (followUp.brand || '').toLowerCase() === 'bpa';
    const senderAddress = isBPA
        ? process.env.BPA_SALES_EMAIL
        : process.env.GCPA_SALES_EMAIL;

    const subject = `RE: ${followUp.canonical_title || 'Schedule of Rates'}`;

    const payload = {
        message: {
            subject,
            body: { contentType: 'HTML', content: htmlBody },
            toRecipients: [{ emailAddress: { address: followUp.recipient_email } }],
            bccRecipients: [
                { emailAddress: { address: isBPA ? process.env.BPA_HUBSPOT_BCC : process.env.GCPA_HUBSPOT_BCC } },
                { emailAddress: { address: process.env.ACCOUNTS_BCC } }
            ].filter(b => Boolean(b.emailAddress.address))
        },
        saveToSentItems: 'true'
    };

    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${senderAddress}/sendMail`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Follow-up send failed: ${JSON.stringify(err)}`);
    }
};

const runFollowUpCron = async () => {
    if (!isAutomationEnabled()) {
        console.log('[FollowUp] ⏸️  Automation is paused (ENABLE_AUTOMATION!=true) — skipping follow-up cron.');
        return;
    }

    const due = await getDueFollowUps();
    if (due.length === 0) {
        console.log('[FollowUp] No due follow-ups.');
        return;
    }

    console.log(`[FollowUp] Processing ${due.length} due follow-up(s)...`);

    for (const followUp of due) {
        try {
            if (followUp.type === 'call_prompt') {
                console.log(`[FollowUp] ⚠️  CALL PROMPT due for ${followUp.client_name} re: ${followUp.project_name} — assign to Chris.`);
                await markFollowUpSent(followUp.id);
                continue;
            }

            if (followUp.type === 're_engage_prompt') {
                console.log(`[FollowUp] ⚠️  RE-ENGAGE (NO CONTACT) due for ${followUp.client_name} re: ${followUp.project_name}. Total 51 days passed.`);
                await markFollowUpSent(followUp.id);
                continue;
            }

            const html = followUp.touch_number === 1
                ? buildTouch1Html({ clientName: followUp.client_name, projectName: followUp.project_name })
                : buildTouch2Html({ clientName: followUp.client_name, projectName: followUp.project_name });

            await sendFollowUpEmail(followUp, html);
            await markFollowUpSent(followUp.id);
            console.log(`[FollowUp] Touch ${followUp.touch_number} processed for ${followUp.recipient_email}`);
        } catch (err) {
            console.error(`[FollowUp] Failed for id=${followUp.id}:`, err.message);
        }
    }
};

module.exports = { runFollowUpCron, sendFollowUpEmail };
