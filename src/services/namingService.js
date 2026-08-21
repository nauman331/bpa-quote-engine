
const buildCanonicalTitle = (brand, tier, clientName, projectName) => {
    const cleanClient = clientName.trim();
    const cleanProject = projectName.trim();

    const prefix = tier === 'Satellite'
        ? `${brand} Sattelite Price List`
        : `${brand} Price List`;

    return `${prefix} - ${cleanClient} - ${cleanProject}`;
};

const buildPdfFileName = (canonicalTitle) => `${canonicalTitle}.pdf`;

module.exports = {
    buildCanonicalTitle,
    buildPdfFileName
};