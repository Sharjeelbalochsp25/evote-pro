const admin = require('../firebaseAdmin');

// Ensures the logged-in user is the owner/creator of the election specified by :id
// Works with Firestore structure: users/{ownerId}/elections/{electionId}
const ensureElectionOwner = async (req, res, next) => {
    const electionId = req.params.id;
    if (!electionId) return res.status(400).json({ message: 'Missing election id' });

    try {
        if (!req.user || !req.user.uid) return res.status(401).json({ message: 'Not authorized' });
        const db = admin.firestore();
        const snap = await db.collection('users').doc(req.user.uid).collection('elections').doc(electionId).get();
        if (!snap.exists) return res.status(404).json({ message: 'Election not found' });

        const ownerId = req.user.uid;

        // Attach election snapshot and owner info for downstream handlers
        req.election = { id: snap.id, ref: snap.ref, data: snap.data(), ownerId };
        next();
    } catch (error) {
        console.error('Ownership check failed', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = { ensureElectionOwner };
