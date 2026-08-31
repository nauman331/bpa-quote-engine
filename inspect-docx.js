require('dotenv').config();
const { getGraphToken } = require('./src/services/graphAuth');
const PizZip = require('pizzip');
const fs = require('fs');

(async () => {
    try {
        const token = await getGraphToken();
        const siteId = process.env.BPA_DRIVE_ID;
        
        console.log('Fetching template...');
        const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/Mobile Pumps/LEVEL D CONDITIONS D:/children`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const listData = await res.json();
        const file = listData.value.find(f => f.name.endsWith('.docx'));
        
        console.log(`Downloading ${file.name}...`);
        const contentRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${file.id}/content`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const buffer = Buffer.from(await contentRes.arrayBuffer());
        
        const zip = new PizZip(buffer);
        if (zip.files['word/footer2.xml']) {
            fs.writeFileSync('footer2.xml', zip.files['word/footer2.xml'].asText());
            console.log('Saved footer2.xml');
        }
    } catch(err) {
        console.error(err);
    }
})();
