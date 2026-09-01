/**
 * src/services/supabaseService.js
 * Supabase persistence layer — all DB writes go through here.
 */
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

/**
 * Inserts a raw inbound lead into the `leads` table.
 * Returns the inserted row (with id).
 */
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

/**
 * Inserts a quote record linked to a lead.
 */
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

/**
 * Inserts a send record linked to a quote.
 */
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

/**
 * Schedules the three follow-up touches for a given send.
 * Offsets: 7 days, 14 days, 21 days.
 */
const scheduleFollowUps = async ({ sendId, recipientEmail, canonicalTitle, brand, clientName, projectName }) => {
    const db = getClient();
    const now = new Date();

    const followUps = [
        { touch: 1, send_at: new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000), type: 'email' },
        { touch: 2, send_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), type: 'email' },
        { touch: 3, send_at: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000), type: 'call_prompt' },
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

/**
 * Writes an audit log entry.
 */
const writeAuditLog = async (eventType, payload) => {
    const db = getClient();
    await db.from('audit_log').insert({ event_type: eventType, payload });
};

/**
 * Fetches all pending follow-ups that are due (send_at <= now).
 */
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

/**
 * Marks a follow-up as sent.
 */
const markFollowUpSent = async (id) => {
    const db = getClient();
    await db.from('follow_ups').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
};

/**
 * Fetches recent leads for the dashboard.
 */
const getRecentLeads = async (limit = 50) => {
    const db = getClient();
    const { data, error } = await db.from('leads').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
};

/**
 * Fetches recent quotes for the dashboard (with lead details if joined).
 */
const getRecentQuotes = async (limit = 50) => {
    const db = getClient();
    const { data, error } = await db.from('quotes').select('*, leads(*)').order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
};

/**
 * Fetches upcoming pending follow-ups.
 */
const getPendingFollowUps = async (limit = 50) => {
    const db = getClient();
    const { data, error } = await db.from('follow_ups').select('*').eq('status', 'pending').order('send_at', { ascending: true }).limit(limit);
    if (error) throw error;
    return data;
};

/**
 * Fetches top-level dashboard stats.
 */
const getDashboardStats = async () => {
    const db = getClient();
    const [leadsReq, quotesReq, pendingReq] = await Promise.all([
        db.from('leads').select('*', { count: 'exact', head: true }),
        db.from('quotes').select('*', { count: 'exact', head: true }),
        db.from('follow_ups').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    ]);
    return {
        totalLeads: leadsReq.count || 0,
        totalQuotesSent: quotesReq.count || 0,
        pendingFollowUps: pendingReq.count || 0,
    };
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
    getPendingFollowUps,
    getDashboardStats,
};

