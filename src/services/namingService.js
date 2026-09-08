const buildCanonicalTitle = (brand, tier, clientName, projectName) => {
    const cleanClient = (clientName || 'General Client').replace(/[\r\n\t]/g, ' ').trim();
    const cleanProject = (projectName || 'General Works').replace(/[\r\n\t]/g, ' ').trim();

    const prefix = tier === 'Satellite'
        ? `${brand || 'BPA'} Sattelite Price List`
        : `${brand || 'BPA'} Price List`;

    return `${prefix} - ${cleanClient} - ${cleanProject}`;
};

const buildPdfFileName = (canonicalTitle) => {
    const safeTitle = (canonicalTitle || 'Quote').replace(/[/#?%\\:*<>|"]/g, '-');
    return `${safeTitle}.pdf`;
};

module.exports = {
    buildCanonicalTitle,
    buildPdfFileName
};
