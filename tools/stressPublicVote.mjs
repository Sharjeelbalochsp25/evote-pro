#!/usr/bin/env node
import admin from 'firebase-admin';
import { serverTimestamp } from 'firebase/firestore';
import fs from 'node:fs';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'evotepro-7deff';
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9100';
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;

admin.initializeApp({ projectId: PROJECT_ID });
const adminDb = admin.firestore();


const PUBLIC_CODE = `TEST-${Date.now().toString(36).slice(2, 8)}`;
const ELECTION_OWNER = `creator-${Date.now().toString(36).slice(2, 6)}`;
const ELECTION_ID = `e-${Date.now().toString(36).slice(2, 8)}`;
const CANDIDATE_ID = 1;

const nowIso = () => new Date().toISOString();

const seed = async (inviteCount = 200) => {
    console.log('Seeding election and invites...', { PUBLIC_CODE, ELECTION_ID, ELECTION_OWNER });

    await adminDb.doc(`users/${ELECTION_OWNER}/elections/${ELECTION_ID}`).set({
        id: ELECTION_ID,
        title: 'Stress Test Election',
        description: 'Seeded for stress test',
        creatorId: ELECTION_OWNER,
        publicCode: PUBLIC_CODE,
        publicLink: PUBLIC_CODE,
        isActive: true,
        verification: { method: 'CNIC' },
        createdAt: nowIso(),
        updatedAt: nowIso(),
    });

    await adminDb.doc(`users/${ELECTION_OWNER}/elections/${ELECTION_ID}/candidates/${String(CANDIDATE_ID)}`).set({
        id: CANDIDATE_ID,
        name: 'Stress Candidate',
        party: 'Test',
        votes: 0,
        createdAt: nowIso(),
    });

    await adminDb.doc(`publicElections/${PUBLIC_CODE}`).set({
        creatorId: ELECTION_OWNER,
        electionId: ELECTION_ID,
        publicCode: PUBLIC_CODE,
        title: 'Stress Test Election',
        description: 'Seeded for stress test',
        isActive: true,
        ballotCandidates: [{ id: CANDIDATE_ID, name: 'Stress Candidate', party: 'Test' }],
    });

    const invites = [];
    for (let i = 0; i < inviteCount; i++) {
        const token = `T${String(i).padStart(4, '0')}-${Date.now().toString(36).slice(-4)}`;
        invites.push(token);
        await adminDb.doc(`publicElections/${PUBLIC_CODE}/invites/${token}`).set({
            token,
            creatorId: ELECTION_OWNER,
            publicCode: PUBLIC_CODE,
            electionId: ELECTION_ID,
            used: false,
            usedBy: '',
            usedAt: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
        });
    }

    return invites;
};

const simulateVote = async (inviteToken) => {
    try {
        const result = await adminDb.runTransaction(async (transaction) => {
            const publicElectionRef = adminDb.doc(`publicElections/${PUBLIC_CODE}`);
            const inviteRef = adminDb.doc(`publicElections/${PUBLIC_CODE}/invites/${inviteToken}`);
            const publicElectionSnap = await transaction.get(publicElectionRef);
            const inviteSnap = await transaction.get(inviteRef);

            if (!publicElectionSnap.exists || !inviteSnap.exists) {
                throw new Error('Precondition failed');
            }

            const inviteData = inviteSnap.data() || {};
            if (inviteData.used) throw new Error('Invite already used');

            const electionData = publicElectionSnap.data() || {};
            const ownerId = electionData.creatorId;
            const electionId = electionData.electionId;

            // use a generated uid per transaction to simulate different voters
            const uid = `sim-${Math.random().toString(36).slice(2, 10)}`;

            const candidateRef = adminDb.doc(`users/${ownerId}/elections/${electionId}/candidates/${String(CANDIDATE_ID)}`);
            const voterRef = adminDb.doc(`users/${ownerId}/elections/${electionId}/voters/${uid}`);
            const auditRef = adminDb.doc(`users/${ownerId}/elections/${electionId}/auditLog/${uid}`);

            const ts = admin.firestore.FieldValue.serverTimestamp();
            transaction.update(inviteRef, { used: true, usedBy: uid, usedAt: ts, updatedAt: ts });
            transaction.set(voterRef, { inviteToken, authUid: uid, candidateId: CANDIDATE_ID, publicCode: PUBLIC_CODE, electionId, hasVoted: true, votedAt: ts });
            transaction.set(auditRef, { id: uid, inviteToken, voterHash: `User-${String(uid).slice(-4)}`, candidateId: CANDIDATE_ID, publicCode: PUBLIC_CODE, electionId, timestamp: ts });
            transaction.update(candidateRef, { votes: admin.firestore.FieldValue.increment(1), updatedAt: ts });

            return { transactionId: uid };
        });

        return { success: true, transactionId: result.transactionId };
    } catch (err) {
        return { success: false, error: String(err.message || err) };
    }
};

const run = async () => {
    const inviteCount = Number(process.argv[2] || 200);
    const concurrency = Number(process.argv[3] || 50);

    const invites = await seed(inviteCount);
    console.log(`Seeded ${invites.length} invites`);

    const results = [];
    let idx = 0;

    const workers = Array.from({ length: concurrency }).map(async () => {
        while (true) {
            const my = idx;
            idx += 1;
            if (my >= invites.length) break;
            const token = invites[my];
            const res = await simulateVote(token);
            results.push({ token, res });
        }
    });

    await Promise.all(workers);

    const candidateSnap = await adminDb.doc(`users/${ELECTION_OWNER}/elections/${ELECTION_ID}/candidates/${String(CANDIDATE_ID)}`).get();
    const votes = candidateSnap.exists ? candidateSnap.data().votes : null;

    const votersSnap = await adminDb.collection(`users/${ELECTION_OWNER}/elections/${ELECTION_ID}/voters`).get();
    const auditSnap = await adminDb.collection(`users/${ELECTION_OWNER}/elections/${ELECTION_ID}/auditLog`).get();
    const invitesSnap = await adminDb.collection(`publicElections/${PUBLIC_CODE}/invites`).get();

    const summary = {
        invited: invites.length,
        successful: results.filter((r) => r.res.success).length,
        failed: results.filter((r) => !r.res.success).length,
        votesRecorded: votes,
        voters: votersSnap.size,
        audits: auditSnap.size,
        invitesUsed: invitesSnap.docs.filter((d) => d.data().used === true).length,
        details: results.slice(0, 200),
    };

    console.log('Summary:', summary);
    await fs.promises.mkdir('tools/output', { recursive: true });
    await fs.promises.writeFile(`tools/output/stress-summary-${Date.now()}.json`, JSON.stringify(summary, null, 2));
    console.log('Wrote tools/output summary file.');
    process.exit(0);
};

run().catch((e) => {
    console.error('Stress test failed', e);
    process.exit(2);
});
