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

const extractFields = (source, subject = '', bodyText = '') => {
    let builderName = null;
    let projectName = null;
    let projectLocation = null;

    if (source === 'EstimateOne') {

        const subjectMatch = subject.match(/watchlist (?:match|alert)[:\s]+(.+?)(?:\s+-\s+(.+))?$/i);
        if (subjectMatch) {
            projectName = subjectMatch[1]?.trim();
            builderName = subjectMatch[2]?.trim();
        }

        const projectLine  = bodyText.match(/project\s*[:–]\s*(.+)/i);
        const builderLine  = bodyText.match(/builder\s*[:–]\s*(.+)/i);
        const locationLine = bodyText.match(/location\s*[:–]\s*(.+)/i);

        projectName  = projectLine?.[1]?.trim()  || projectName;
        builderName  = builderLine?.[1]?.trim()  || builderName;
        projectLocation = locationLine?.[1]?.trim();

    } else if (source === 'BCI') {

        const tenderLine  = bodyText.match(/tender\s*[:–]\s*(.+)/i);
        const companyLine = bodyText.match(/company\s*[:–]\s*(.+)/i);
        const locationLine = bodyText.match(/(?:location|state|suburb)\s*[:–]\s*(.+)/i);

        projectName  = tenderLine?.[1]?.trim();
        builderName  = companyLine?.[1]?.trim();
        projectLocation = locationLine?.[1]?.trim();

    } else {

        const projectLine = bodyText.match(/(?:project|site|job|address|located at|at)\s*[:–]?\s*([A-Z0-9][^.\n]{5,60})/i);
        projectName = projectLine?.[1]?.trim() || null;

        const companyLine = bodyText.match(/(?:regards|from|company)[,:\n\s]+([A-Z][^\n]{2,50}(?:Pty|Ltd|Co|Group|Constructions|Builders|Group)?)/i);
        builderName = companyLine?.[1]?.trim() || null;
    }

    return {
        builderName:     builderName     || 'Unknown Builder',

        projectName:     projectName     || 'New Enquiry',
        projectLocation: projectLocation || null,
    };
};

const parseInboundEmail = (graphMessage) => {
    const from    = graphMessage.from?.emailAddress?.address || '';
    const subject = graphMessage.subject || '';
    const bodyText = graphMessage.body?.content
        ?.replace(/<[^>]*>/g, ' ')
        ?.replace(/\s+/g, ' ')
        ?.trim() || '';

    const source = detectSource(from, subject);
    const { builderName, projectName, projectLocation } = extractFields(source, subject, bodyText);

    return {
        source,
        senderEmail: from,
        subject,
        builderName,
        projectName,
        projectLocation,
        rawBody: bodyText.substring(0, 3000),
    };
};

module.exports = { parseInboundEmail, detectSource };
