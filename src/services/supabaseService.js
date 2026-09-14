const { createClient } = require('@supabase/supabase-js');

let supabase;
const getClient = () => {
    if (!supabase) {
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );
    }
    return supabase;
};

const insertLead = async ({ source, payload, urgency, urgencyReason }) => {
    const db = getClient();
    const { data, error } = await db
        .from('leads')
        .insert({ source, payload, urgency, urgency_reason: urgencyReason })
        .select()
        .single();
    if (error) throw new Error(`Supabase insertLead failed: ${error.message}`);
    console.log(`[DB] Lead inserted: id=${data.id} source=${source} urgency=${urgency}`);
    return data;
};

const insertQuote = async ({ leadId, canonicalTitle, pdfFileName }) => {
    const db = getClient();
    const { data, error } = await db
        .from('quotes')
        .insert({ lead_id: leadId, canonical_title: canonicalTitle, pdf_filename: pdfFileName })
        .select()
        .single();
    if (error) throw new Error(`Supabase insertQuote failed: ${error.message}`);
    console.log(`[DB] Quote inserted: id=${data.id}`);
    return data;
};

const insertSend = async ({ quoteId, recipientEmail, status = 'sent' }) => {
    const db = getClient();
    const { data, error } = await db
        .from('sends')
        .insert({ quote_id: quoteId, recipient_email: recipientEmail, status })
        .select()
        .single();
    if (error) throw new Error(`Supabase insertSend failed: ${error.message}`);
    console.log(`[DB] Send inserted: id=${data.id} to=${recipientEmail}`);
    return data;
};

const scheduleFollowUps = async ({ sendId, recipientEmail, canonicalTitle, brand, clientName, projectName }) => {
    const db = getClient();
    const now = new Date();

    const followUps = [
        { touch: 1, send_at: new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000), type: 'email' },
        { touch: 2, send_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), type: 'email' },
        { touch: 3, send_at: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000), type: 'call_prompt' },
        { touch: 4, send_at: new Date(now.getTime() + 51 * 24 * 60 * 60 * 1000), type: 're_engage_prompt' },
    ].map(f => ({
        send_id:        sendId,
        recipient_email: recipientEmail,
        canonical_title: canonicalTitle,
        brand,
        client_name:    clientName,
        project_name:   projectName,
        touch_number:   f.touch,
        type:           f.type,
        send_at:        f.send_at.toISOString(),
        status:         'pending',
    }));

    const { error } = await db.from('follow_ups').insert(followUps);
    if (error) throw new Error(`Supabase scheduleFollowUps failed: ${error.message}`);
    console.log(`[DB] Scheduled 3 follow-ups for sendId=${sendId}`);
};

const writeAuditLog = async (eventType, payload) => {
    const db = getClient();
    await db.from('audit_log').insert({ event_type: eventType, payload });
};

const getDueFollowUps = async () => {
    const db = getClient();
    const { data, error } = await db
        .from('follow_ups')
        .select('*')
        .eq('status', 'pending')
        .lte('send_at', new Date().toISOString());
    if (error) throw new Error(`Supabase getDueFollowUps failed: ${error.message}`);
    return data || [];
};

const markFollowUpSent = async (id) => {
    const db = getClient();
    await db.from('follow_ups').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
};

const getRecentLeads = async (limit = 50) => {
    const db = getClient();
    const { data, error } = await db.from('leads').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
};

const getRecentQuotes = async (limit = 50) => {
    const db = getClient();
    const { data, error } = await db.from('quotes').select('*, leads(*), sends(*)').order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
};

const getPendingQuotes = async (limit = 50) => {
    const db = getClient();
    const { data, error } = await db
        .from('quotes')
        .select('*, leads(*), sends!inner(*)')
        .eq('sends.status', 'pending_approval')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
};

const getQuoteById = async (quoteId) => {
    const db = getClient();
    const { data, error } = await db
        .from('quotes')
        .select('*, leads(*), sends(*)')
        .eq('id', quoteId)
        .single();
    if (error) throw error;
    return data;
};

const updateSendStatus = async (quoteId, status) => {
    const db = getClient();
    const { data, error } = await db
        .from('sends')
        .update({ status })
        .eq('quote_id', quoteId)
        .select();
    if (error) throw error;
    return data;
};

const getPendingFollowUps = async (limit = 50) => {
    const db = getClient();
    const { data, error } = await db.from('follow_ups').select('*').eq('status', 'pending').order('send_at', { ascending: true }).limit(limit);
    if (error) throw error;
    return data;
};

const getDashboardStats = async () => {
    const db = getClient();
    const [leadsReq, quotesReq, pendingReq, approvalReq] = await Promise.all([
        db.from('leads').select('*', { count: 'exact', head: true }),
        db.from('quotes').select('*', { count: 'exact', head: true }),
        db.from('follow_ups').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('sends').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval')
    ]);
    return {
        totalLeads: leadsReq.count || 0,
        totalQuotesSent: quotesReq.count || 0,
        pendingFollowUps: pendingReq.count || 0,
        pendingApprovals: approvalReq.count || 0,
    };
};

const verifyDealInMirror = async (canonicalTitle) => {
    const db = getClient();
    const { data, error } = await db
        .from('crm_records')
        .select('*')
        .ilike('deal_name', `%${canonicalTitle}%`)
        .limit(1);

    if (error) {
        console.error(`[Mirror Check] DB error checking mirror for ${canonicalTitle}:`, error.message);
        return false;
    }

    if (data && data.length > 0) {
        console.log(`[Mirror Check] SUCCESS: Deal for ${canonicalTitle} found in mirror.`);
        return true;
    }

    console.warn(`[Mirror Check] WARNING: Deal for ${canonicalTitle} NOT found in mirror after sync window.`);
    return false;
};

const hasRecentQuoteForRecipient = async (recipientEmail, canonicalTitle) => {
    try {
        const db = getClient();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await db
            .from('quotes')
            .select('id, created_at, canonical_title, sends!inner(recipient_email)')
            .eq('canonical_title', canonicalTitle)
            .eq('sends.recipient_email', recipientEmail)
            .gte('created_at', oneDayAgo)
            .limit(1);

        if (error) return false;
        return Boolean(data && data.length > 0);
    } catch {
        return false;
    }
};

module.exports = {
    insertLead,
    insertQuote,
    insertSend,
    scheduleFollowUps,
    writeAuditLog,
    getDueFollowUps,
    markFollowUpSent,
    getRecentLeads,
    getRecentQuotes,
    getPendingQuotes,
    getQuoteById,
    updateSendStatus,
    getPendingFollowUps,
    getDashboardStats,
    verifyDealInMirror,
    hasRecentQuoteForRecipient,
    getClient,
};
