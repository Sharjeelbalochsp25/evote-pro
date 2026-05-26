const admin = require('../firebaseAdmin');
const db = admin.firestore();
const serverTs = () => (admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date());
const crypto = require('crypto');

const createPublicLink = () => {
    return crypto.randomBytes(4).toString('hex');
};

// @desc    Create a new election (requires auth)
// @route   POST /api/elections
// @access  Private
const createElection = async (req, res) => {
    try {
        if (!req.user || !req.user.uid) return res.status(401).json({ message: 'Not authorized' });
        const ownerId = req.user.uid;
        const { title, description, verification } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ message: 'Title is required' });

        const electionRef = db.collection('users').doc(ownerId).collection('elections').doc();
        const publicLink = createPublicLink();
        const payload = {
            title: title.trim(),
            description: (description || '').trim(),
            creatorId: ownerId,
            publicLink,
            isActive: true,
            verification: verification || { method: 'CNIC', customLabel: '' },
            createdAt: serverTs(),
            updatedAt: serverTs(),
        };

        await electionRef.set(payload);
        const created = (await electionRef.get()).data();
        res.status(201).json({ id: electionRef.id, ...created });
    } catch (error) {
        console.error('createElection error', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all elections created by logged-in user
// @route   GET /api/elections/my-elections
// @access  Private
const getMyElections = async (req, res) => {
    try {
        if (!req.user || !req.user.uid) return res.status(401).json({ message: 'Not authorized' });
        const ownerId = req.user.uid;
        const snaps = await db.collection('users').doc(ownerId).collection('elections').orderBy('createdAt', 'desc').get();
        const rows = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
        res.json(rows);
    } catch (error) {
        console.error('getMyElections error', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get a single election view via public link
// @route   GET /api/elections/:link
// @access  Public
const getElectionByLink = async (req, res) => {
    try {
        const link = req.params.link;
        const snaps = await db.collectionGroup('elections').where('publicLink', '==', link).limit(1).get();
        if (snaps.empty) return res.status(404).json({ message: 'Election not found or invalid link' });

        const electionSnap = snaps.docs[0];
        const electionRef = electionSnap.ref;
        const electionData = electionSnap.data();

        // Fetch candidates as well
        const candidatesSnap = await electionRef.collection('candidates').get();
        const candidates = candidatesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        res.json({ id: electionSnap.id, ...electionData, candidates });
    } catch (error) {
        console.error('getElectionByLink error', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Vote in an election via public link
// @route   POST /api/elections/:link/vote
// @access  Public
const voteInElection = async (req, res) => {
    try {
        const { candidateId, voterId } = req.body; // voterId is the identifier provided by voter
        const link = req.params.link;

        if (!candidateId || !voterId) return res.status(400).json({ message: 'candidateId and voterId are required' });

        // Find the election document by public link across all users
        const snaps = await db.collectionGroup('elections').where('publicLink', '==', link).limit(1).get();
        if (snaps.empty) return res.status(404).json({ message: 'Election not found or invalid link' });

        const electionSnap = snaps.docs[0];
        const electionRef = electionSnap.ref;
        const electionData = electionSnap.data();

        if (electionData.isActive === false) return res.status(400).json({ message: 'This election is currently closed' });

        // Paths for subcollections
        const ownerId = electionRef.parent.parent.id;
        const candidatesRef = electionRef.collection('candidates');
        const voterRef = electionRef.collection('voters').doc(String(voterId));
        const candidateRef = candidatesRef.doc(String(candidateId));
        const auditRef = electionRef.collection('auditLog').doc();

        // Transaction: ensure candidate exists and voter hasn't already voted
        await db.runTransaction(async (tx) => {
            const [candidateSnap, voterSnap] = await Promise.all([tx.get(candidateRef), tx.get(voterRef)]);
            if (!candidateSnap.exists) throw new Error('Candidate not found in this election');
            if (voterSnap.exists) throw new Error('You have already voted in this election');

            const currentVotes = (candidateSnap.exists && candidateSnap.data().votes) ? candidateSnap.data().votes : 0;
            tx.update(candidateRef, { votes: currentVotes + 1, updatedAt: serverTs() });
            tx.set(voterRef, { identifier: voterId, votedAt: serverTs() });
            tx.set(auditRef, { voterHash: `User-${String(voterId).slice(-4)}`, candidateId: Number(candidateId), timestamp: serverTs() });
        });

        res.json({ message: 'Vote successfully cast!', hasVoted: true });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// =========================
// Candidate management (owner-only)
// =========================

// @desc    Add a candidate to an election
// @route   POST /api/elections/:id/candidates
// @access  Private (owner)
const addCandidate = async (req, res) => {
    try {
        const { id } = req.params; // election id
        const { name, party } = req.body;
        if (!name) return res.status(400).json({ message: 'Candidate name is required' });

        // Expect ensureElectionOwner middleware to attach req.election with ref
        if (!req.election || !req.election.ref) return res.status(400).json({ message: 'Ownership not verified' });
        const electionRef = req.election.ref;
        const candidateRef = electionRef.collection('candidates').doc();
        const payload = { name: name.trim(), party: (party || '').trim(), votes: 0, createdAt: serverTs() };
        await candidateRef.set(payload);
        const created = (await candidateRef.get()).data();
        res.status(201).json({ id: candidateRef.id, ...created });
    } catch (error) {
        console.error('addCandidate error', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a candidate in an election
// @route   PUT /api/elections/:id/candidates/:candidateId
// @access  Private (owner)
const updateCandidate = async (req, res) => {
    try {
        const { id, candidateId } = req.params;
        const { name, party } = req.body;
        if (!req.election || !req.election.ref) return res.status(400).json({ message: 'Ownership not verified' });
        const electionRef = req.election.ref;
        const candidateRef = electionRef.collection('candidates').doc(String(candidateId));
        const update = {};
        if (typeof name !== 'undefined') update.name = name.trim();
        if (typeof party !== 'undefined') update.party = party.trim();
        if (Object.keys(update).length === 0) return res.status(400).json({ message: 'Nothing to update' });

        await candidateRef.update({ ...update, updatedAt: serverTs() });
        const updated = (await candidateRef.get()).data();
        res.json({ id: candidateRef.id, ...updated });
    } catch (error) {
        console.error('updateCandidate error', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Remove a candidate from an election
// @route   DELETE /api/elections/:id/candidates/:candidateId
// @access  Private (owner)
const removeCandidate = async (req, res) => {
    try {
        const { id, candidateId } = req.params;
        if (!req.election || !req.election.ref) return res.status(400).json({ message: 'Ownership not verified' });
        const electionRef = req.election.ref;
        const candidateRef = electionRef.collection('candidates').doc(String(candidateId));
        const snap = await candidateRef.get();
        if (!snap.exists) return res.status(404).json({ message: 'Candidate not found' });
        await candidateRef.delete();
        res.json({ message: 'Candidate removed' });
    } catch (error) {
        console.error('removeCandidate error', error);
        res.status(500).json({ message: error.message });
    }
};

// (exports continued at end of file to include backup functions)

// ------------------
// Backup / Export API
// ------------------

const exportElection = async (req, res) => {
    try {
        // req.election set by ensureElectionOwner middleware
        if (!req.election || !req.election.ref) return res.status(400).json({ message: 'Ownership not verified' });
        const electionRef = req.election.ref;
        const electionSnap = await electionRef.get();
        if (!electionSnap.exists) return res.status(404).json({ message: 'Election not found' });

        const election = electionSnap.data();
        const candidatesSnap = await electionRef.collection('candidates').get();
        const votersSnap = await electionRef.collection('voters').get();
        const auditSnap = await electionRef.collection('auditLog').get();

        const candidates = candidatesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const voters = votersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const auditLog = auditSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        res.json({ id: electionRef.id, election, candidates, voters, auditLog });
    } catch (error) {
        console.error('exportElection error', error);
        res.status(500).json({ message: error.message });
    }
};

const importElection = async (req, res) => {
    try {
        if (!req.election || !req.election.ref) return res.status(400).json({ message: 'Ownership not verified' });
        const electionRef = req.election.ref;
        const payload = req.body;
        if (!payload || !payload.election) return res.status(400).json({ message: 'Invalid payload' });

        // Overwrite election metadata
        await electionRef.set({
            ...(payload.election || {}),
            updatedAt: serverTs(),
            createdAt: payload.election.createdAt || serverTs(),
        }, { merge: true });

        // Import candidates (replace existing)
        if (Array.isArray(payload.candidates)) {
            const batch = db.batch();
            const candidatesCol = electionRef.collection('candidates');
            // Delete existing candidates (simple approach: overwrite or add)
            for (const c of payload.candidates) {
                const ref = candidatesCol.doc(String(c.id || c.name));
                batch.set(ref, { ...c, createdAt: serverTs() });
            }
            await batch.commit();
        }

        // Import voters and auditLog (if present) - these are sensitive; preserve as-is
        if (Array.isArray(payload.voters)) {
            const batchV = db.batch();
            const votersCol = electionRef.collection('voters');
            for (const v of payload.voters) {
                const ref = votersCol.doc(String(v.id || v.identifier));
                batchV.set(ref, { ...v });
            }
            await batchV.commit();
        }

        if (Array.isArray(payload.auditLog)) {
            const batchA = db.batch();
            const auditCol = electionRef.collection('auditLog');
            for (const a of payload.auditLog) {
                const ref = auditCol.doc(a.id || undefined);
                batchA.set(ref, { ...a });
            }
            await batchA.commit();
        }

        res.json({ message: 'Import completed' });
    } catch (error) {
        console.error('importElection error', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createElection, getMyElections, getElectionByLink, voteInElection, addCandidate, updateCandidate, removeCandidate, exportElection, importElection };
