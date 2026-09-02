/**
 * src/services/followUpService.js
 * Dispatches follow-up emails and call prompts based on the follow-up schedule.
 * Called by the daily cron job in app.js.
 */
const { getDueFollowUps, markFollowUpSent } = require('./supabaseService');
const { getGraphToken } = require('./graphAuth');

// ─── Follow-up email templates ──────────────────────────────────────────────

const buildTouch1Html = ({ clientName, projectName }) => `<!DOCTYPE html>
<html><body style="font-family: Aptos, sans-serif; font-size: 12pt; color: rgb(36,36,36);">
<div>Hi ${clientName},</div><br>
<div>I just wanted to follow up on the schedule of rates I sent through for <b>${projectName}</b>.</div><br>
<div>Please don't hesitate to reach out if you have any questions or if there's anything we can clarify for you.</div><br>
<div>We would love the opportunity to assist with your concrete pumping requirements.</div><br>
<div>Thank you,</div><br>
<div style="font-family: Gadugi, sans-serif;">
  <div style="font-size:12pt;color:rgb(21,96,130);"><b>Steve</b></div>
  <div>BPA Sales Team</div>
  <div style="font-size:10pt;color:rgb(89,89,89);">Brisbane Pump Action Pty Ltd<br>Ph: 07 3888 2660</div>
</div>
</body></html>`;

const buildTouch2Html = ({ clientName, projectName }) => `<!DOCTYPE html>
<html><body style="font-family: Aptos, sans-serif; font-size: 12pt; color: rgb(36,36,36);">
<div>Hi ${clientName},</div><br>
<div>I'm Chris Turner, Director of Brisbane Pump Action.</div><br>
<div>I wanted to personally reach out regarding our rates for <b>${projectName}</b>. 
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

// ─── Dispatcher ──────────────────────────────────────────────────────────────

const sendFollowUpEmail = async (followUp, htmlBody) => {
    const token = await getGraphToken();

    const isBPA = followUp.brand?.toLowerCase() === 'bpa';
    const senderAddress = isBPA
        ? process.env.BPA_SALES_EMAIL
        : process.env.GCPA_SALES_EMAIL;

    const subject = `RE: ${followUp.canonical_title}`;

    const payload = {
        message: {
            subject,
            body: { contentType: 'HTML', content: htmlBody },
            toRecipients: [{ emailAddress: { address: followUp.recipient_email } }],
            bccRecipients: [
                { emailAddress: { address: isBPA ? process.env.BPA_HUBSPOT_BCC : process.env.GCPA_HUBSPOT_BCC } },
                { emailAddress: { address: process.env.ACCOUNTS_BCC } }
            ]
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

/**
 * Main runner — called by cron. Fetches all due follow-ups and dispatches them.
 */
const runFollowUpCron = async () => {
    const due = await getDueFollowUps();
    if (due.length === 0) {
        console.log('[FollowUp] No due follow-ups.');
        return;
    }

    console.log(`[FollowUp] Processing ${due.length} due follow-up(s)...`);

    for (const followUp of due) {
        try {
            if (followUp.type === 'call_prompt') {
                // Touch 3 — Phone call prompt. Log it but don't send an email.
                console.log(`[FollowUp] ⚠️  CALL PROMPT due for ${followUp.client_name} re: ${followUp.project_name} — assign to Chris.`);
                // TODO: In Phase E, write this to the CRM dashboard as a task notification.
                await markFollowUpSent(followUp.id);
                continue;
            }

            if (followUp.type === 're_engage_prompt') {
                // Touch 4 (Outcome) — 30-day re-engage. Log it as 'No contact' final outcome.
                console.log(`[FollowUp] ⚠️  RE-ENGAGE (NO CONTACT) due for ${followUp.client_name} re: ${followUp.project_name}. Total 51 days passed.`);
                await markFollowUpSent(followUp.id);
                continue;
            }

            const html = followUp.touch_number === 1
                ? buildTouch1Html({ clientName: followUp.client_name, projectName: followUp.project_name })
                : buildTouch2Html({ clientName: followUp.client_name, projectName: followUp.project_name });

            await sendFollowUpEmail(followUp, html);
            await markFollowUpSent(followUp.id);
            console.log(`[FollowUp] Touch ${followUp.touch_number} sent to ${followUp.recipient_email}`);
        } catch (err) {
            console.error(`[FollowUp] Failed for id=${followUp.id}:`, err.message);
        }
    }
};

module.exports = { runFollowUpCron };
