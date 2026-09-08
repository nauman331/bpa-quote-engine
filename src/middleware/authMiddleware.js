const authMiddleware = (req, res, next) => {
    const configuredKey = process.env.API_SECRET_KEY;

    let providedKey = req.headers['x-api-key'];

    if (!providedKey && req.headers['authorization']) {
        const parts = req.headers['authorization'].split(' ');
        if (parts.length === 2 && (parts[0] === 'Bearer' || parts[0] === 'ApiKey')) {
            providedKey = parts[1];
        } else {
            providedKey = req.headers['authorization'];
        }
    }

    if (!providedKey && req.query) {
        providedKey = req.query.apiKey || req.query.api_key || req.query.key;
    }

    if (!configuredKey || !providedKey || providedKey !== configuredKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }

    next();
};

module.exports = authMiddleware;
