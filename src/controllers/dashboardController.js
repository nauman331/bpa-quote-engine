const {
    getRecentLeads,
    getRecentQuotes,
    getPendingFollowUps,
    getDashboardStats
} = require('../services/supabaseService');

const getDashboardData = async (req, res) => {
    try {
        const fetchData = () => Promise.all([
            getDashboardStats(),
            getRecentLeads(20),
            getRecentQuotes(20),
            getPendingFollowUps(20)
        ]);

        let results;
        try {
            results = await fetchData();
        } catch (initialErr) {
            if (initialErr.code === 'PGRST303' || (initialErr.message && initialErr.message.includes('future'))) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                results = await fetchData();
            } else {
                throw initialErr;
            }
        }

        const [stats, leads, quotes, followUps] = results;

        res.status(200).json({
            stats,
            leads,
            quotes,
            followUps
        });
    } catch (err) {
        console.error('[Dashboard API Error]:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
};

module.exports = {
    getDashboardData
};
