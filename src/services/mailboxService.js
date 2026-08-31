/**
 * src/services/mailboxService.js
 * Manages the Microsoft Graph change notification subscription
 * on the BPA shared sales mailbox.
 */
const { getGraphToken } = require('./graphAuth');

const SHARED_MAILBOX = process.env.BPA_SALES_EMAIL; // sales@brisbanepumpaction.com.au

/**
 * Creates (or renews) a Graph subscription on the shared mailbox Inbox.
 * Subscriptions expire after ~3 days, so this is called on startup + daily.
 */
const createOrRenewSubscription = async (notificationUrl) => {
    const token = await getGraphToken();

    // Check if an active subscription already exists
    const listRes = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const listData = await listRes.json();
    const existing = listData.value?.find(s => s.resource?.includes(SHARED_MAILBOX));

    const expiryDate = new Date(Date.now() + 4000 * 60 * 1000); // ~66 hours

    if (existing) {
        // Renew existing subscription
        const renewRes = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expirationDateTime: expiryDate.toISOString() })
        });
        const renewData = await renewRes.json();
        console.log(`[Mailbox] Subscription renewed until ${renewData.expirationDateTime}`);
        return renewData;
    }

    // Create new subscription
    const createRes = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            changeType: 'created',
            notificationUrl,
            resource: `users/${SHARED_MAILBOX}/mailFolders/Inbox/messages`,
            expirationDateTime: expiryDate.toISOString(),
            clientState: process.env.MAILBOX_CLIENT_STATE || 'bpa-sales-engine-secret'
        })
    });
    const createData = await createRes.json();
    if (createData.error) {
        throw new Error(`Failed to create subscription: ${JSON.stringify(createData.error)}`);
    }
    console.log(`[Mailbox] New subscription created: ${createData.id} (expires ${createData.expirationDateTime})`);
    return createData;
};

/**
 * Fetches the full message content for a given message ID.
 */
const fetchMessage = async (messageId) => {
    const token = await getGraphToken();
    const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${SHARED_MAILBOX}/messages/${messageId}?$select=id,subject,from,body,receivedDateTime,toRecipients`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Failed to fetch message ${messageId}: ${res.statusText}`);
    return res.json();
};

module.exports = { createOrRenewSubscription, fetchMessage };
