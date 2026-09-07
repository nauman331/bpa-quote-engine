const {
    getRecentLeads,
    getRecentQuotes,
    getPendingFollowUps,
    getDashboardStats
} = require('../services/supabaseService');

const getDashboardData = async (req, res) => {
    try {
        const [stats, leads, quotes, followUps] = await Promise.all([
            getDashboardStats(),
            getRecentLeads(20),
            getRecentQuotes(20),
            getPendingFollowUps(20)
        ]);

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
