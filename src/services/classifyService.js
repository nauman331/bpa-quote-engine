/**
 * src/services/classifyService.js
 * Calls Claude Haiku to classify inbound lead urgency as hot / warm / cold.
 */
const Anthropic = require('@anthropic-ai/sdk');

let client;
const getClient = () => {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
};

const SYSTEM_PROMPT = `You are an expert sales classifier for a concrete pumping company (Brisbane Pump Action / GC Pump Action).
Your job is to read an inbound lead email and classify it as:
- "hot"  — immediate need, tight tender deadline, or repeat/known builder
- "warm" — clear project but no urgency signal, or tender more than 2 weeks away
- "cold" — vague inquiry, no project details, or general information request

Respond ONLY with valid JSON in this exact format:
{"urgency": "hot"|"warm"|"cold", "reason": "<one sentence explanation>"}`;

/**
 * Classifies an email body + subject as hot/warm/cold via Claude Haiku.
 * @param {string} subject - Email subject line
 * @param {string} body    - Plain-text email body
 * @returns {{ urgency: string, reason: string }}
 */
const classifyUrgency = async (subject, body) => {
    // Gracefully degrade if no API key is set
    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[Classify] No ANTHROPIC_API_KEY set — defaulting urgency to warm.');
        return { urgency: 'warm', reason: 'No API key configured; defaulted to warm.' };
    }

    try {
        const response = await getClient().messages.create({
            model: 'claude-haiku-20240307',
            max_tokens: 128,
            system: SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: `Subject: ${subject}\n\n${body.substring(0, 2000)}` // cap at 2000 chars
                }
            ]
        });

        const raw = response.content[0].text.trim();
        const parsed = JSON.parse(raw);
        console.log(`[Classify] urgency=${parsed.urgency} — ${parsed.reason}`);
        return parsed;
    } catch (err) {
        console.warn('[Classify] Claude call failed:', err.message, '— defaulting to warm.');
        return { urgency: 'warm', reason: 'Classification failed; defaulted to warm.' };
    }
};

module.exports = { classifyUrgency };
