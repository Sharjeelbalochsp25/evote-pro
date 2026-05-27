#!/usr/bin/env node
import admin from 'firebase-admin';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'evotepro-7deff';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9100';
admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

const nowIso = () => new Date().toISOString();

export const seed = async (opts = {}) => {
    const inviteCount = opts.inviteCount || 20;
    const PUBLIC_CODE = `E2E-${Date.now().toString(36).slice(2, 8)}`;
    const ELECTION_OWNER = `e2e-creator-${Date.now().toString(36).slice(2, 6)}`;
    const ELECTION_ID = `e2e-${Date.now().toString(36).slice(2, 8)}`;
    const CANDIDATE_ID = 1;

    await db.doc(`users/${ELECTION_OWNER}/elections/${ELECTION_ID}`).set({
        id: ELECTION_ID,
        title: 'E2E Seeded Election',
        creatorId: ELECTION_OWNER,
        publicCode: PUBLIC_CODE,
        isActive: true,
        createdAt: nowIso(),
    });

    await db.doc(`users/${ELECTION_OWNER}/elections/${ELECTION_ID}/candidates/${String(CANDIDATE_ID)}`).set({
        id: CANDIDATE_ID,
        name: 'E2E Candidate',
        party: 'Independent',
        votes: 0,
        createdAt: nowIso(),
    });

    await db.doc(`publicElections/${PUBLIC_CODE}`).set({
        creatorId: ELECTION_OWNER,
        electionId: ELECTION_ID,
        publicCode: PUBLIC_CODE,
        title: 'E2E Seeded Election',
        isActive: true,
        ballotCandidates: [{ id: CANDIDATE_ID, name: 'E2E Candidate', party: 'Independent' }]
    });

    const invites = [];
    for (let i = 0; i < inviteCount; i++) {
        const token = `TOK-${String(i).padStart(3, '0')}-${Date.now().toString(36).slice(-3)}`.toUpperCase();
        invites.push(token);
        await db.doc(`publicElections/${PUBLIC_CODE}/invites/${token}`).set({
            token,
            creatorId: ELECTION_OWNER,
            publicCode: PUBLIC_CODE,
            electionId: ELECTION_ID,
            used: false,
            createdAt: nowIso(),
        });
    }

    return { PUBLIC_CODE, ELECTION_OWNER, ELECTION_ID, CANDIDATE_ID, invites };
};

if (process.argv[1] && process.argv[1].endsWith('seedPublicElection.mjs')) {
    seed().then((r) => {
        console.log(JSON.stringify(r));
        process.exit(0);
    }).catch((e) => {
        console.error(e);
        process.exit(2);
    });
}
