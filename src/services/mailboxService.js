const { getGraphToken } = require('./graphAuth');

const SHARED_MAILBOX = process.env.BPA_SALES_EMAIL;

const createOrRenewSubscription = async (notificationUrl) => {
    const token = await getGraphToken();

    const listRes = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const listData = await listRes.json();
    const existing = listData.value?.find(s => s.resource?.includes(SHARED_MAILBOX));

    const expiryDate = new Date(Date.now() + 4000 * 60 * 1000);

    if (existing) {

        const renewRes = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expirationDateTime: expiryDate.toISOString() })
        });
        const renewData = await renewRes.json();
        console.log(`[Mailbox] Subscription renewed until ${renewData.expirationDateTime}`);
        return renewData;
    }

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

const fetchMessage = async (messageId) => {
    const token = await getGraphToken();
    const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${SHARED_MAILBOX}/messages/${messageId}?$select=id,subject,from,body,receivedDateTime,toRecipients`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Failed to fetch message ${messageId}: ${res.statusText}`);
    return res.json();
};

const fetchRecentMessages = async (limit = 50, fromEmail = null, keyword = null) => {
    const token = await getGraphToken();
    const headers = { 'Authorization': `Bearer ${token}` };

    let url = `https://graph.microsoft.com/v1.0/users/${SHARED_MAILBOX}/mailFolders/Inbox/messages?$top=${limit}&$select=id,subject,from,receivedDateTime,isRead,body`;

    if (fromEmail) {

        url += `&$filter=from/emailAddress/address eq '${fromEmail}'&$count=true`;
        headers['ConsistencyLevel'] = 'eventual';
    } else if (keyword) {

        url += `&$search="${keyword}"`;
        headers['ConsistencyLevel'] = 'eventual';
    } else {
        url += `&$orderby=receivedDateTime desc`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch recent messages: ${res.statusText}`);
    const data = await res.json();
    return data.value || [];
};

module.exports = { createOrRenewSubscription, fetchMessage, fetchRecentMessages };
