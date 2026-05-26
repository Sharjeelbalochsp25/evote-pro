const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('../firebaseAdmin');
const crypto = require('crypto');

const db = admin.firestore();
const serverTs = () => (admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date());

const VERIFICATION_REGEX = {
    CNIC: /^[0-9]{5}-[0-9]{7}-[0-9]$/,
    STUDENT_ID: /^[A-Za-z0-9\-\s]{3,20}$/,
    EMPLOYEE_ID: /^[A-Za-z0-9\-\s]{3,20}$/,
    PASSPORT: /^[A-Za-z0-9]{5,20}$/,
    PHONE_NUMBER: /^\+?[0-9]{10,15}$/,
    CUSTOM: /^.{3,100}$/,
};

const normalizeIdentifier = (identifier) => String(identifier || '').trim();

const hashVoterIdentifier = (identifier, electionId) => {
    return crypto
        .createHash('sha256')
        .update(`${electionId}:${identifier}`)
        .digest('hex')
        .slice(0, 16);
};

const validatePayload = (data) => {
    const electionId = String(data?.electionId || '').trim();
    const candidateId = Number(data?.candidateId);
    const voterName = String(data?.voter?.name || '').trim();
    const identifier = normalizeIdentifier(data?.voter?.identifier);
    const age = Number(data?.voter?.age);

    if (!electionId) {
        throw new HttpsError('invalid-argument', 'electionId is required');
    }

    if (!Number.isFinite(candidateId)) {
        throw new HttpsError('invalid-argument', 'candidateId must be a number');
    }

    if (!voterName || !identifier || !Number.isFinite(age)) {
        throw new HttpsError('invalid-argument', 'Voter name, identifier, and age are required');
    }

    if (age < 18) {
        throw new HttpsError('failed-precondition', 'Not eligible: Under 18');
    }

    return { electionId, candidateId, voterName, identifier, age };
};

const performCastVote = async (uid, data) => {
    const { electionId, candidateId, voterName, identifier, age } = validatePayload(data);

    const electionRef = db.collection('users').doc(uid).collection('elections').doc(electionId);
    const candidateRef = electionRef.collection('candidates').doc(String(candidateId));
    const voterRef = electionRef.collection('voters').doc(identifier);
    const auditRef = electionRef.collection('auditLog').doc();

    const result = await db.runTransaction(async (transaction) => {
        const [electionSnap, candidateSnap, voterSnap] = await Promise.all([
            transaction.get(electionRef),
            transaction.get(candidateRef),
            transaction.get(voterRef),
        ]);

        if (!electionSnap.exists) {
            throw new HttpsError('not-found', 'Election not found');
        }

        const election = electionSnap.data() || {};
        if (election.isActive === false) {
            throw new HttpsError('failed-precondition', 'This election is closed');
        }

        const verification = election.verification || { method: 'CNIC', customLabel: '' };
        const regex = VERIFICATION_REGEX[verification.method] || VERIFICATION_REGEX.CNIC;
        if (!regex.test(identifier)) {
            throw new HttpsError('invalid-argument', 'Identifier format is invalid for this election');
        }

        if (!candidateSnap.exists) {
            throw new HttpsError('not-found', 'Candidate not found');
        }

        if (voterSnap.exists) {
            throw new HttpsError('already-exists', 'Not eligible: Already voted');
        }

        const transactionId = auditRef.id;
        const voterHash = hashVoterIdentifier(identifier, electionId);

        const currentVotes = (candidateSnap.exists && candidateSnap.data().votes) ? candidateSnap.data().votes : 0;
        transaction.update(candidateRef, { votes: currentVotes + 1, updatedAt: serverTs() });

        transaction.set(voterRef, {
            identifier,
            name: voterName,
            age,
            hasVoted: true,
            votedAt: serverTs(),
        });

        transaction.set(auditRef, {
            id: transactionId,
            voterHash,
            candidateId,
            electionId,
            timestamp: serverTs(),
        });

        return { transactionId, candidateId };
    });

    return {
        success: true,
        message: 'Vote cast successfully',
        transactionId: result.transactionId,
        candidateId: result.candidateId,
    };
};

exports.handleCastVote = performCastVote;

exports.castVoteSecure = onCall(
    {
        cors: true,
        region: 'us-central1',
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth?.uid) {
            throw new HttpsError('unauthenticated', 'Authentication required');
        }

        return performCastVote(request.auth.uid, request.data);
    },
);