/**
 * src/services/parseService.js
 * Parses raw inbound emails to extract structured lead data.
 * Detects source: EstimateOne | BCI | DirectBuilder
 */

/**
 * Detects the lead source from the email sender/subject.
 */
const detectSource = (from = '', subject = '') => {
    const f = from.toLowerCase();
    const s = subject.toLowerCase();

    if (f.includes('estimateone.com') || s.includes('watchlist') || s.includes('estimate one')) {
        return 'EstimateOne';
    }
    if (f.includes('bcicentral.com') || f.includes('bciq.com.au') || s.includes('tender alert')) {
        return 'BCI';
    }
    return 'DirectBuilder';
};

/**
 * Extracts builder name, project name, and project location from email text.
 * Uses pattern matching for EstimateOne/BCI structured formats,
 * and best-effort extraction for direct builder emails.
 */
const extractFields = (source, subject = '', bodyText = '') => {
    let builderName = null;
    let projectName = null;
    let projectLocation = null;

    if (source === 'EstimateOne') {
        // EstimateOne subject format: "New watchlist match: [Project Name] - [Builder]"
        const subjectMatch = subject.match(/watchlist (?:match|alert)[:\s]+(.+?)(?:\s+-\s+(.+))?$/i);
        if (subjectMatch) {
            projectName = subjectMatch[1]?.trim();
            builderName = subjectMatch[2]?.trim();
        }

        // Body often has "Project:" and "Builder:" lines
        const projectLine  = bodyText.match(/project\s*[:–]\s*(.+)/i);
        const builderLine  = bodyText.match(/builder\s*[:–]\s*(.+)/i);
        const locationLine = bodyText.match(/location\s*[:–]\s*(.+)/i);

        projectName  = projectLine?.[1]?.trim()  || projectName;
        builderName  = builderLine?.[1]?.trim()  || builderName;
        projectLocation = locationLine?.[1]?.trim();

    } else if (source === 'BCI') {
        // BCI format has "Tender:" and "Company:" labels in the body
        const tenderLine  = bodyText.match(/tender\s*[:–]\s*(.+)/i);
        const companyLine = bodyText.match(/company\s*[:–]\s*(.+)/i);
        const locationLine = bodyText.match(/(?:location|state|suburb)\s*[:–]\s*(.+)/i);

        projectName  = tenderLine?.[1]?.trim();
        builderName  = companyLine?.[1]?.trim();
        projectLocation = locationLine?.[1]?.trim();

    } else {
        // Direct Builder: best-effort from subject + first line of body
        projectName = subject.replace(/^(re|fwd|fw):\s*/i, '').trim();
        // Try to get the sender's company from the email signature
        const companyLine = bodyText.match(/(?:company|from|regards)[,:\s]+(.+)/i);
        builderName = companyLine?.[1]?.trim() || 'Unknown Builder';
    }

    return {
        builderName:     builderName     || 'Unknown Builder',
        projectName:     projectName     || subject || 'Unknown Project',
        projectLocation: projectLocation || null,
    };
};

/**
 * Main parse function. Takes a raw Graph message object and returns structured lead data.
 */
const parseInboundEmail = (graphMessage) => {
    const from    = graphMessage.from?.emailAddress?.address || '';
    const subject = graphMessage.subject || '';
    const bodyText = graphMessage.body?.content
        ?.replace(/<[^>]*>/g, ' ')   // strip HTML tags
        ?.replace(/\s+/g, ' ')        // collapse whitespace
        ?.trim() || '';

    const source = detectSource(from, subject);
    const { builderName, projectName, projectLocation } = extractFields(source, subject, bodyText);

    // Infer brand from which mailbox the email came to (BPA vs GCPA)
    // This will be enriched by the controller based on which subscription fired
    return {
        source,
        senderEmail: from,
        subject,
        builderName,
        projectName,
        projectLocation,
        rawBody: bodyText.substring(0, 3000), // store first 3000 chars
    };
};

module.exports = { parseInboundEmail, detectSource };
