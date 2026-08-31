require('dotenv').config();
const { getGraphToken } = require('./src/services/graphAuth');

(async () => {
    try {
        const token = await getGraphToken();
        const siteId = process.env.BPA_DRIVE_ID;
        
        console.log('Listing root...');
        const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.value) {
            data.value.forEach(v => console.log(`- ${v.name} (folder: ${!!v.folder})`));
        } else {
            console.log(data);
        }

        console.log('\nListing Mobile Pumps (old path)...');
        const res2 = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/Mobile Pumps:/children`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data2 = await res2.json();
        if (data2.value) {
            data2.value.forEach(v => console.log(`- ${v.name} (folder: ${!!v.folder})`));
        } else {
            console.log(data2);
        }

    } catch(err) {
        console.error(err);
    }
})();
