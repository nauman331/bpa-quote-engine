const { escapeHtml } = require('../utils/sanitize');
const { canDispatchEmails } = require('../utils/safetyGuards');

const buildQuoteEmailHtml = ({ recipientFirstName, projectName }) => {
    const safeFirstName = escapeHtml(recipientFirstName);
    const safeProject = escapeHtml(projectName);

    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=Windows-1252">
</head>
<body dir="ltr" style="font-family: Aptos, sans-serif; font-size: 12pt; color: rgb(36, 36, 36);">
<div>Hi ${safeFirstName},</div>
<br>
<div><b>Schedule of Rates – Concrete Pumping at ${safeProject}</b></div>
<br>
<div>We would like to supply you with our rates for the concrete pumping works, please see our schedule of rates attached.</div>
<br>
<div>Our experience in this industry is extensive, from small pool surrounds to high rise buildings, we pride ourselves on being able to provide the best services possible for our clientele. We are highly experienced in commercial high-rise buildings and large industrial sheds.</div>
<br>
<div>We have a large fleet of mobile concrete pumps ranging from high pressure Line Pumps through to 56 Metre Booms, along with a Spider Boom &amp; a Satellite Pump.</div>
<br>
<div>All our Boom pump operators hold a 3<sup>rd</sup> party VOC.</div>
<br>
<div>Our fleet is highly maintained and we have all the required safety documentation in place and up to date.</div>
<br>
<div>Chris would like to discuss any feedback you may have, please don’t hesitate to contact him directly on 0461 459 755.</div>
<br>
<div>Thank you and have a lovely day.</div>
<br>
<div id="Signature" style="font-family: Gadugi, sans-serif;">
    <div style="font-size: 12pt; color: rgb(21, 96, 130);"><b>Steve</b></div>
    <div style="font-size: 12pt; color: black;">BPA <span style="color: rgb(36, 36, 36);">Sales</span> Team</div>
    <br>
    <div style="font-size: 10pt; color: rgb(89, 89, 89);">
        Brisbane Pump Action Pty Ltd<br>
        PO Box 1336, Burpengary DC Qld 4505<br>
        Pump Bookings: 0410 158 451<br>
        Pump Allocations: 0438 930 580<br>
        Ph: 07 3888 2660<br>
        Fax: 07 3888 4412<br>
        <a href="http://www.brisbanepumpaction.com.au/" style="color: rgb(5, 99, 193);">www.brisbanepumpaction.com.au</a>
    </div>
</div>
</body>
</html>`;
};

const sendQuoteEmail = async (brand, recipientEmail, subject, pdfFileName, pdfBuffer) => {
    if (!recipientEmail) {
        console.warn(`[Mail] No recipient email specified for subject: "${subject}" — send aborted.`);
        return;
    }

    if (!canDispatchEmails()) {
        console.log(`[DRY RUN / PAUSED] Outbound quote email skipped: "${subject}" -> ${recipientEmail}`);
        return;
    }

    console.log(`[M2] Authenticating with Azure for Tenant: ${process.env.AZURE_TENANT_ID}...`);

    const tokenRes = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.AZURE_CLIENT_ID,
            scope: 'https://graph.microsoft.com/.default',
            client_secret: process.env.AZURE_CLIENT_SECRET,
            grant_type: 'client_credentials'
        })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
        throw new Error(`Azure Auth Failed: ${JSON.stringify(tokenData)}`);
    }

    const brandStr = (brand || '').toLowerCase();
    const isBrisbane = brandStr.includes('brisbane') || brandStr === 'bpa';
    const senderAddress = isBrisbane ? process.env.BPA_SALES_EMAIL : process.env.GCPA_SALES_EMAIL;
    const hubspotBcc = isBrisbane ? process.env.BPA_HUBSPOT_BCC : process.env.GCPA_HUBSPOT_BCC;

    const firstName = recipientEmail.includes('@')
        ? recipientEmail.split('@')[0].split('.')[0].replace(/^\w/, c => c.toUpperCase())
        : 'Valued Client';

    const projectName = (subject || '').split(' - ').slice(2).join(' - ') || 'Upcoming Project';

    const messagePayload = {
        message: {
            subject: subject,
            body: {
                contentType: "HTML",
                content: buildQuoteEmailHtml({ recipientFirstName: firstName, projectName })
            },
            toRecipients: [{ emailAddress: { address: recipientEmail } }],
            bccRecipients: [
                { emailAddress: { address: hubspotBcc } },
                { emailAddress: { address: process.env.ACCOUNTS_BCC } }
            ].filter(b => Boolean(b.emailAddress.address)),
            attachments: [
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    name: pdfFileName || 'Schedule_of_Rates.pdf',
                    contentType: "application/pdf",
                    contentBytes: pdfBuffer.toString('base64')
                }
            ]
        },
        saveToSentItems: "true"
    };

    console.log(`[M2] Sending email from ${senderAddress} to ${recipientEmail}...`);

    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${senderAddress}/sendMail`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(messagePayload)
        });

        if (sendRes.ok) {
            console.log('[M2] Email dispatched successfully via MS Graph!');
            return;
        }

        if (sendRes.status === 429) {
            const retryAfter = parseInt(sendRes.headers.get('Retry-After') || '5', 10);
            const backoff = retryAfter * 1000 * attempt;
            console.warn(`[M2] 429 Too Many Requests. Retrying in ${backoff / 1000}s (attempt ${attempt}/3)...`);
            await new Promise(res => setTimeout(res, backoff));
            lastError = `429 rate limit hit after 3 attempts`;
            continue;
        }

        const errorData = await sendRes.json();
        throw new Error(`Graph API Send Failed: ${JSON.stringify(errorData)}`);
    }

    throw new Error(`[M2] ${lastError}`);
};

module.exports = {
    buildQuoteEmailHtml,
    sendQuoteEmail
};
