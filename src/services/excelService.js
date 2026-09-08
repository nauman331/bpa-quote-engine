const crypto = require('crypto');
const { getGraphToken } = require('./graphAuth');
const { sanitizeExcelCell } = require('../utils/sanitize');
const { canWriteSharePoint } = require('../utils/safetyGuards');

const appendExcelLog = async (canonicalTitle, clientName, projectName, recipientEmail) => {
    try {
        const driveId = process.env.SHAREPOINT_DRIVE_ID;
        const excelItemId = process.env.EXCEL_LOG_ITEM_ID;

        if (!driveId || !excelItemId) {
            console.warn('[Excel] SHAREPOINT_DRIVE_ID or EXCEL_LOG_ITEM_ID not set. Skipping Excel log.');
            return;
        }

        const spnNumber = `SPN-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const dateStr = new Date().toLocaleDateString();

        if (!canWriteSharePoint()) {
            console.log(`[Excel] [DRY RUN / PAUSED] Excel append skipped for SPN: ${spnNumber}`);
            return;
        }

        const token = await getGraphToken();

        const safeClientName = sanitizeExcelCell(clientName);
        const safeProjectName = sanitizeExcelCell(projectName);
        const safeRecipientEmail = sanitizeExcelCell(recipientEmail);
        const safeCanonicalTitle = sanitizeExcelCell(canonicalTitle);

        const payload = {
            values: [
                [dateStr, spnNumber, safeClientName, safeProjectName, safeRecipientEmail, safeCanonicalTitle]
            ]
        };

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
        console.error('[Excel] Failed to append Excel log:', error.message);
    }
};

module.exports = { appendExcelLog };
