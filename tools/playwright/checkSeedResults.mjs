import admin from 'firebase-admin';
import fs from 'fs';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'evotepro-7deff';

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

const seed = JSON.parse(fs.readFileSync('tools/playwright/results/seed.json', 'utf8'));
const PUBLIC_CODE = seed.PUBLIC_CODE;
const OWNER = seed.ELECTION_OWNER;
const ELECTION_ID = seed.ELECTION_ID;
const CANDIDATE_ID = seed.CANDIDATE_ID;

(async () => {
  const invitesSnap = await db.collection(`publicElections/${PUBLIC_CODE}/invites`).get();
  const invitesUsed = invitesSnap.docs.filter((d) => d.data().used === true).length;
  const votersSnap = await db.collection(`users/${OWNER}/elections/${ELECTION_ID}/voters`).get();
  const auditsSnap = await db.collection(`users/${OWNER}/elections/${ELECTION_ID}/auditLog`).get();
  const candDoc = await db.doc(`users/${OWNER}/elections/${ELECTION_ID}/candidates/${String(CANDIDATE_ID)}`).get();

  console.log(JSON.stringify({ PUBLIC_CODE, invitesTotal: invitesSnap.size, invitesUsed, voters: votersSnap.size, audits: auditsSnap.size, candidateVotes: candDoc.exists ? candDoc.data().votes : null }, null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
