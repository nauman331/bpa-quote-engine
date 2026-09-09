const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const os = require('os');
const legacySessionsPath = path.resolve(__dirname, '../../data/sessions.json');
const sessionsFilePath = path.resolve(os.tmpdir(), 'bpa_sessions.json');

const loadSessions = () => {
    try {
        if (fs.existsSync(sessionsFilePath)) {
            const raw = fs.readFileSync(sessionsFilePath, 'utf8');
            const parsed = JSON.parse(raw);
            return new Map(Object.entries(parsed));
        }
        if (fs.existsSync(legacySessionsPath)) {
            const raw = fs.readFileSync(legacySessionsPath, 'utf8');
            const parsed = JSON.parse(raw);
            return new Map(Object.entries(parsed));
        }
    } catch (e) {}
    return new Map();
};

const saveSessions = (map) => {
    try {
        const obj = Object.fromEntries(map);
        fs.writeFileSync(sessionsFilePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {}
};

const sessions = loadSessions();

const hashPassword = (password, salt) => {
    return crypto.scryptSync(password, salt, 64).toString('hex');
};

const defaultSalt = 'bpa_sales_engine_salt_2026';
const defaultHash = hashPassword('Password123!', defaultSalt);

const users = [
    {
        id: 'usr_krishna_01',
        email: 'bharadwajkarishna@gmail.com',
        name: 'Krishna Bharadwaj',
        role: 'admin',
        userStatus: 'ACTIVE',
        image: '',
        userLanguage: 'en',
        salt: defaultSalt,
        hash: defaultHash
    }
];

const login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = users.find(u => u.email === cleanEmail);
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const computed = hashPassword(password, user.salt);
    if (computed !== user.hash) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const session = {
        id: 'sess_' + crypto.randomUUID().slice(0, 8),
        token,
        userId: user.id,
        expiresAt,
        createdAt: new Date().toISOString()
    };

    sessions.set(token, session);
    saveSessions(sessions);

    const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        userStatus: user.userStatus,
        image: user.image,
        userLanguage: user.userLanguage
    };

    res.json({
        success: true,
        token,
        user: safeUser,
        session
    });
};

const getSession = async (req, res) => {
    let token = req.headers['x-session-token'];
    if (!token && req.headers['authorization']) {
        const parts = req.headers['authorization'].split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Session token required' });
    }

    const session = sessions.get(token);
    if (!session) {
        return res.status(401).json({ error: 'Session not found or expired' });
    }

    if (new Date(session.expiresAt) < new Date()) {
        sessions.delete(token);
        saveSessions(sessions);
        return res.status(401).json({ error: 'Session expired' });
    }

    const user = users.find(u => u.id === session.userId);
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }

    const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        userStatus: user.userStatus,
        image: user.image,
        userLanguage: user.userLanguage
    };

    res.json({
        success: true,
        user: safeUser,
        session
    });
};

const logout = async (req, res) => {
    let token = req.headers['x-session-token'];
    if (!token && req.headers['authorization']) {
        const parts = req.headers['authorization'].split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }
    if (!token && req.body && req.body.token) {
        token = req.body.token;
    }

    if (token) {
        sessions.delete(token);
        saveSessions(sessions);
    }

    res.json({ success: true });
};

module.exports = {
    login,
    getSession,
    logout
};
