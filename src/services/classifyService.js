const Anthropic = require('@anthropic-ai/sdk');

let client;
const getClient = () => {
    if (!client) {
        client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }
    return client;
};

const SYSTEM_PROMPT = `You are an expert sales classifier for a concrete pumping company (Brisbane Pump Action / GC Pump Action).
Your job is to read an inbound email and do four things:

1. Validate: Is this actually a request for a quote, concrete pumping rates, or a tender alert? If it is a generic email, spam, invoice, or general inquiry not related to a project quote, set "isLead" to false.
2. Extract: Find the name of the Builder (company requesting the quote) and the Project Name. If missing, return null.
3. Classify Urgency: If it is a lead, classify urgency as:
   - "hot"  — immediate need, tight tender deadline, or repeat/known builder
   - "warm" — clear project but no urgency signal, or tender more than 2 weeks away
   - "cold" — vague inquiry, no project details, or general information request
4. Determine Product: Determine what type of concrete pump is requested based on keywords in the email. Options: "Mobile Rates", "Satellite Rates", "Spider Boom", "Line Pump". If no specific type is mentioned, default to "Mobile Rates".

Respond ONLY with valid JSON in this exact format:
{
  "isLead": true|false,
  "builderName": "<extracted builder name or null>",
  "projectName": "<extracted project name or null>",
  "urgency": "hot"|"warm"|"cold",
  "productFamily": "Mobile Rates"|"Satellite Rates"|"Spider Boom"|"Line Pump",
  "reason": "<one sentence explanation>"
}`;

const analyzeLeadEmail = async (subject, body) => {
    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[Classify] No ANTHROPIC_API_KEY set — skipping AI validation.');
        return {
            isLead: true,
            builderName: null,
            projectName: null,
            urgency: 'warm',
            reason: 'No API key configured; defaulted to warm.'
        };
    }

        const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
        const response = await getClient().messages.create({
            model: modelName,
            max_tokens: 256,
            system: SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: `Subject: ${subject || ''}\n\n${(body || '').substring(0, 2000)}`
                }
            ]
        });

        const textBlock = (response?.content || []).find(c => c.type === 'text');
        const textContent = textBlock?.text || response?.content?.[0]?.text || '';
        const raw = textContent.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
        const parsed = JSON.parse(raw || '{}');
        console.log(`[Classify] model=${modelName} | isLead=${parsed.isLead} | urgency=${parsed.urgency} | builder=${parsed.builderName}`);
        return parsed;
    } catch (err) {
        console.warn('[Classify] Claude call failed:', err.message);
        return { isLead: true, builderName: null, projectName: null, urgency: 'warm', reason: 'Classification failed.' };
    }
};

module.exports = { analyzeLeadEmail };
