/**
 * src/services/excelService.js
 * Appends a new row to the SPN Master Log (Excel workbook) hosted on SharePoint.
 */
const { getGraphToken } = require('./graphAuth');

/**
 * Appends a log entry to the master SPN tracking Excel file.
 */
const appendExcelLog = async (canonicalTitle, clientName, projectName, recipientEmail) => {
    try {
        const token = await getGraphToken();
        const driveId = process.env.SHAREPOINT_DRIVE_ID;
        const excelItemId = process.env.EXCEL_LOG_ITEM_ID;
        
        if (!driveId || !excelItemId) {
            console.warn('[Excel] SHAREPOINT_DRIVE_ID or EXCEL_LOG_ITEM_ID not set. Skipping Excel log.');
            return;
        }

        // The auto-generated SPN is derived from the canonical title or time
        const spnNumber = `SPN-${Date.now().toString().slice(-6)}`;
        const dateStr = new Date().toLocaleDateString();

        const payload = {
            values: [
                [dateStr, spnNumber, clientName, projectName, recipientEmail, canonicalTitle]
            ]
        };

        // Assumes a table named 'MasterLog' exists in the Excel file
        const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${excelItemId}/workbook/tables/MasterLog/rows/add`;
        
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(JSON.stringify(err));
        }

        console.log(`[Excel] Successfully appended SPN log: ${spnNumber}`);
    } catch (error) {
        // We log the error but don't crash the pipeline
        console.error('[Excel] Failed to append Excel log:', error.message);
    }
};

module.exports = { appendExcelLog };
