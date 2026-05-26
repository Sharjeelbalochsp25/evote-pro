const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('../firebaseAdmin');
const crypto = require('crypto');

const db = admin.firestore();
const serverTs = () => (admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date());

const VERIFICATION_REGEX = {
    CNIC: /^[0-9]{5}-[0-9]{7}-[0-9]$/,
    STUDENT_ID: /^[A-Za-z0-9\-\s]{3,20}$/,
    EMPLOYEE_ID: /^[A-Za-z0-9\-\s]{3,20}$/,
    CUSTOM: /^.{3,100}$/,
};

const normalize = (value) => String(value || '').trim();

const hashIdentifier = (identifier, electionId) => crypto.createHash('sha256').update(`${electionId}:${identifier}`).digest('hex').slice(0, 16);

const validatePayload = (data) => {
    const publicCode = normalize(data?.publicCode);
    const candidateId = String(data?.candidateId || '').trim();
    const voterName = normalize(data?.voter?.name);
    const identifier = normalize(data?.voter?.identifier);
    const age = Number(data?.voter?.age);

    if (!publicCode) throw new HttpsError('invalid-argument', 'publicCode is required');
    if (!candidateId) throw new HttpsError('invalid-argument', 'candidateId is required');
    if (!voterName || !identifier || !Number.isFinite(age)) throw new HttpsError('invalid-argument', 'Voter name, identifier, and age are required');
    if (age < 18) throw new HttpsError('failed-precondition', 'Not eligible: Under 18');

    return { publicCode, candidateId, voterName, identifier, age };
};

const performCastPublicVote = async (data) => {
    const { publicCode, candidateId, voterName, identifier, age } = validatePayload(data);

    const publicElectionRef = db.collection('publicElections').doc(publicCode);
    const publicSnap = await publicElectionRef.get();

    if (!publicSnap.exists) {
        throw new HttpsError('not-found', 'Election not found');
    }

    const publicElection = publicSnap.data() || {};
    if (publicElection.isActive === false) {
        throw new HttpsError('failed-precondition', 'This election is closed');
    }

    const ownerUid = publicElection.creatorId;
    const electionId = publicElection.electionId;

    if (!ownerUid || !electionId) {
        throw new HttpsError('failed-precondition', 'Election is not fully configured');
    }

    const electionRef = db.collection('users').doc(ownerUid).collection('elections').doc(electionId);
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
        const voterHash = hashIdentifier(identifier, electionId);

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

exports.handleCastPublicVote = performCastPublicVote;

exports.castPublicVoteSecure = onCall(
    {
        cors: true,
        region: 'us-central1',
        enforceAppCheck: false,
    },
    async (request) => {
        return performCastPublicVote(request.data);
    },
);