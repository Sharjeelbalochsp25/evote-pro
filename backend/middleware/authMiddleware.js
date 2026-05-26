const admin = require('firebase-admin');

// Verify Firebase ID token passed in Authorization: Bearer <token>
const protect = async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!idToken) return res.status(401).json({ message: 'Not authorized, no token provided' });

    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        // Attach minimal user info
        req.user = { uid: decoded.uid, email: decoded.email, name: decoded.name || decoded.email };
        next();
    } catch (err) {
        console.error('Firebase token verification failed', err?.message || err);
        return res.status(401).json({ message: 'Not authorized, token invalid' });
    }
};

module.exports = { protect };
