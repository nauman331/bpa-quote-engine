const fs = require('fs');
const path = require('path');
const { validateQuoteData } = require('../models/quoteModel');
const { buildCanonicalTitle, buildPdfFileName } = require('../services/namingService');
const { populateTemplate, convertDocxToPdfMock } = require('../services/documentService');
const { saveToArchive } = require('../services/archiveService');

const handleGenerateAndSend = async (req, res) => {
    try {
        // 1. Validate Input
        const validation = validateQuoteData(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ status: 'error', message: validation.errors });
        }
        const validatedData = validation.data;

        // 2. Exact Naming 
        const canonicalTitle = buildCanonicalTitle(
            validatedData.brand,
            validatedData.tier,
            validatedData.clientName,
            validatedData.projectName
        );
        const pdfFileName = buildPdfFileName(canonicalTitle);

        // 3. Document Generation
        // Fetch the dummy template from our local folder
        const templatePath = path.join(__dirname, '../views/templates/Mobile-DD-Template.docx');
        if (!fs.existsSync(templatePath)) {
            return res.status(500).json({ error: 'Dummy template not found. Please place Mobile-DD-Template.docx in src/views/templates/' });
        }

        const templateBuffer = fs.readFileSync(templatePath);
        const populatedDocxBuffer = populateTemplate(templateBuffer, validatedData);

        // 4. Convert to PDF (Mocked for now)
        const pdfBuffer = await convertDocxToPdfMock(populatedDocxBuffer);

        // 5. Archive the PDF (Rule 16)
        const savedFilePath = saveToArchive(validatedData.brand, validatedData.tier, pdfFileName, pdfBuffer);

        // 6. Return Success
        return res.status(200).json({
            status: 'success',
            message: 'M1 Pipeline Complete: Document Generated and Archived',
            data: {
                canonicalTitle,
                pdfFileName,
                savedFilePath
            }
        });

    } catch (err) {
        console.error('Quote Pipeline Error:', err);
        return res.status(500).json({
            status: 'error',
            message: err.message || 'Internal server error'
        });
    }
};

module.exports = {
    handleGenerateAndSend
};