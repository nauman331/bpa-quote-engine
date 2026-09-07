const { getClient } = require('../services/supabaseService');

const getProfile = async (req, res) => {
    const supabase = getClient();
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const { data, error } = await supabase.from('Users').select('*').eq('email', email).maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    if (!data) {
        return res.json({ email, name: 'Admin User', avatar: null });
    }

    res.json(data);
};

const updateProfile = async (req, res) => {
    const supabase = getClient();
    const { email, name, avatar } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });

    const { data, error } = await supabase.from('Users')
        .upsert({ email, name, avatar })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
};

module.exports = { getProfile, updateProfile };
