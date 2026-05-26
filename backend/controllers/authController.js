const admin = require('../firebaseAdmin');
const serverTs = () => (admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date());

const getIdTokenFromRequest = (req) => {
    const authHeader = req.headers.authorization || '';
    return authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
};

const upsertUserProfile = async (decodedToken, name = '') => {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(decodedToken.uid);
    const userSnap = await userRef.get();
    await userRef.set(
        {
            email: decodedToken.email || '',
            name: name || decodedToken.name || decodedToken.email || '',
            updatedAt: serverTs(),
            createdAt: userSnap.exists ? userSnap.data().createdAt : serverTs(),
        },
        { merge: true },
    );
    const refreshed = await userRef.get();
    return { id: decodedToken.uid, ...refreshed.data() };
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
    try {
        const token = getIdTokenFromRequest(req);
        if (!token) return res.status(401).json({ message: 'Missing Firebase token' });

        const decoded = await admin.auth().verifyIdToken(token);
        const name = (req.body?.name || '').trim();
        const profile = await upsertUserProfile(decoded, name);
        res.status(201).json(profile);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    try {
        const token = getIdTokenFromRequest(req);
        if (!token) return res.status(401).json({ message: 'Missing Firebase token' });

        const decoded = await admin.auth().verifyIdToken(token);
        const profile = await upsertUserProfile(decoded);
        res.json(profile);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { registerUser, loginUser };
