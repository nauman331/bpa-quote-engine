const fs = require('fs');
const path = require('path');

/**
 * Pure function to ensure directories exist and save the file.
 * Rule 16: Brand -> Shared -> Product Family -> Price List Sent
 */
const saveToArchive = (brand, tier, fileName, fileBuffer) => {
    // For M1, we are only focusing on Mobile Rates
    const productFamily = 'Mobile Rates';

    // Construct the specific "Sent" folder path
    const archivePath = path.join(__dirname, '../../outputs', brand, 'Shared', productFamily, 'Price List Sent');

    // Create the folders if they don't exist
    if (!fs.existsSync(archivePath)) {
        fs.mkdirSync(archivePath, { recursive: true });
    }

    const filePath = path.join(archivePath, fileName);
    fs.writeFileSync(filePath, fileBuffer);

    return filePath;
};

module.exports = {
    saveToArchive
};