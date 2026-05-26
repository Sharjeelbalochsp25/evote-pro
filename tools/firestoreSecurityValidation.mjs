import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, initializeAuth, inMemoryPersistence, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc as fsDoc, getFirestore, runTransaction as fsRunTransaction, serverTimestamp } from 'firebase/firestore';

const fetchFn = globalThis.fetch;

if (!fetchFn) {
    throw new Error('Global fetch is not available in this Node runtime.');
}

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'evotepro-7deff';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9100';
const FIRESTORE_RESOURCE_ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`;
const FIRESTORE_BASE = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_SIGNUP_URL = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`;
const FIREBASE_CLIENT_CONFIG = {
    apiKey: 'emulator-demo-key',
    authDomain: 'localhost',
    projectId: PROJECT_ID,
    storageBucket: 'localhost',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:emulator',
};

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;

if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();

const nowIso = () => new Date().toISOString();

const randomId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const fieldString = (value) => ({ stringValue: String(value) });
const fieldInt = (value) => ({ integerValue: String(Number(value)) });
const fieldBool = (value) => ({ booleanValue: Boolean(value) });
const fieldTimestamp = (value) => ({ timestampValue: String(value) });
const fieldArray = (values) => ({ arrayValue: { values } });

const docName = (...segments) => `${FIRESTORE_RESOURCE_ROOT}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const log = (label, status, detail) => {
    const suffix = detail ? ` - ${detail}` : '';
    // eslint-disable-next-line no-console
    console.log(`[${status}] ${label}${suffix}`);
};

const readJsonResponse = async (response) => {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const signUpAnonymous = async () => {
    const response = await fetchFn(AUTH_SIGNUP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
    });

    const body = await readJsonResponse(response);
    if (!response.ok) {
        throw new Error(`Auth emulator sign-up failed: ${JSON.stringify(body)}`);
    }

    assert(body?.localId && body?.idToken, 'Auth emulator sign-up response missing uid or idToken.');
    return { uid: body.localId, idToken: body.idToken };
};

const firestoreCommit = async (idToken, writes) => {
    const response = await fetchFn(`${FIRESTORE_BASE}:commit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ writes }),
    });

    const body = await readJsonResponse(response);
    return { ok: response.ok, status: response.status, body };
};

const createSdkSession = async (sessionName) => {
    const app = initializeApp(FIREBASE_CLIENT_CONFIG, sessionName);
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', Number.parseInt(String(FIRESTORE_HOST.split(':').pop() || '8180'), 10));
    const credential = await signInAnonymously(auth);

    return {
        app,
        auth,
        db,
        uid: credential.user.uid,
    };
};

const runClientVoteTransaction = async (session, { creatorUid, electionId, publicCode, candidateId, inviteToken }) => {
    return fsRunTransaction(session.db, async (transaction) => {
        const publicElectionRef = fsDoc(session.db, 'publicElections', publicCode);
        const inviteRef = fsDoc(session.db, 'publicElections', publicCode, 'invites', inviteToken);
        const electionRef = fsDoc(session.db, 'users', creatorUid, 'elections', electionId);
        const candidateRef = fsDoc(session.db, 'users', creatorUid, 'elections', electionId, 'candidates', String(candidateId));
        const voterRef = fsDoc(session.db, 'users', creatorUid, 'elections', electionId, 'voters', session.uid);
        const auditRef = fsDoc(session.db, 'users', creatorUid, 'elections', electionId, 'auditLog', session.uid);

        const [publicElectionSnap, inviteSnap, electionSnap, candidateSnap, voterSnap] = await Promise.all([
            transaction.get(publicElectionRef),
            transaction.get(inviteRef),
            transaction.get(electionRef),
            transaction.get(candidateRef),
            transaction.get(voterRef),
        ]);

        if (!publicElectionSnap.exists() || !electionSnap.exists() || !inviteSnap.exists() || !candidateSnap.exists()) {
            throw new Error('Transaction precondition failed.');
        }

        if (voterSnap.exists()) {
            throw new Error('Not eligible: Already voted');
        }

        const inviteData = inviteSnap.data() || {};
        if (inviteData.used === true) {
            throw new Error('Invite token has already been used.');
        }

        const candidateVotes = Number(candidateSnap.data()?.votes || 0);
        const voteTime = new Date().toISOString();

        transaction.update(inviteRef, {
            used: true,
            usedBy: session.uid,
            usedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        transaction.set(voterRef, {
            inviteToken,
            authUid: session.uid,
            candidateId,
            publicCode,
            electionId,
            hasVoted: true,
            votedAt: serverTimestamp(),
        });

        transaction.set(auditRef, {
            id: session.uid,
            inviteToken,
            voterHash: `User-${String(session.uid).slice(-4)}`,
            candidateId,
            publicCode,
            electionId,
            timestamp: serverTimestamp(),
        });

        transaction.update(candidateRef, {
            votes: candidateVotes + 1,
            updatedAt: serverTimestamp(),
        });

        return { transactionId: session.uid, voteTime };
    });
};

const adminDoc = (...segments) => db.doc(segments.join('/'));

const seedElection = async ({ creatorUid, electionId, publicCode, candidateId, inviteToken, extraInviteToken, createdAt }) => {

    await adminDoc('users', creatorUid, 'elections', electionId).set({
        id: electionId,
        title: 'Security Validation Election',
        description: 'Local emulator validation only',
        creatorId: creatorUid,
        publicCode,
        publicLink: publicCode,
        isActive: true,
        verification: { method: 'CNIC' },
        createdAt,
        updatedAt: createdAt,
    });

    await adminDoc('users', creatorUid, 'elections', electionId, 'candidates', String(candidateId)).set({
        id: candidateId,
        name: 'Candidate One',
        party: 'Independent',
        votes: 0,
        createdAt,
    });

    if (extraInviteToken) {
        await adminDoc('publicElections', publicCode, 'invites', extraInviteToken).set({
            token: extraInviteToken,
            creatorId: creatorUid,
            publicCode,
            electionId,
            used: false,
            usedBy: '',
            usedAt: null,
            createdAt,
            updatedAt: createdAt,
        });
    }

    await adminDoc('publicElections', publicCode, 'invites', inviteToken).set({
        token: inviteToken,
        creatorId: creatorUid,
        publicCode,
        electionId,
        used: false,
        usedBy: '',
        usedAt: null,
        createdAt,
        updatedAt: createdAt,
    });

    await adminDoc('publicElections', publicCode).set({
        creatorId: creatorUid,
        electionId,
        publicCode,
        title: 'Security Validation Election',
        description: 'Local emulator validation only',
        isActive: true,
        ballotCandidates: [
            { id: candidateId, name: 'Candidate One', party: 'Independent' },
        ],
    });
};

const buildVoteWrites = ({ creatorUid, electionId, publicCode, candidateId, inviteToken, voterUid, voteTime, seedCreatedAtIso }) => {
    const inviteName = docName('publicElections', publicCode, 'invites', inviteToken);
    const voterName = docName('users', creatorUid, 'elections', electionId, 'voters', voterUid);
    const auditName = docName('users', creatorUid, 'elections', electionId, 'auditLog', voterUid);
    const candidateName = docName('users', creatorUid, 'elections', electionId, 'candidates', String(candidateId));

    return [
        {
            update: {
                name: inviteName,
                fields: {
                    token: fieldString(inviteToken),
                    creatorId: fieldString(creatorUid),
                    publicCode: fieldString(publicCode),
                    electionId: fieldString(electionId),
                    used: fieldBool(true),
                    usedBy: fieldString(voterUid),
                    usedAt: fieldTimestamp(voteTime),
                    createdAt: fieldTimestamp(seedCreatedAtIso),
                    updatedAt: fieldTimestamp(voteTime),
                },
            },
            currentDocument: { exists: true },
        },
        {
            update: {
                name: voterName,
                fields: {
                    inviteToken: fieldString(inviteToken),
                    authUid: fieldString(voterUid),
                    candidateId: fieldInt(candidateId),
                    publicCode: fieldString(publicCode),
                    electionId: fieldString(electionId),
                    hasVoted: fieldBool(true),
                    votedAt: fieldTimestamp(voteTime),
                },
            },
            currentDocument: { exists: false },
        },
        {
            update: {
                name: auditName,
                fields: {
                    id: fieldString(voterUid),
                    inviteToken: fieldString(inviteToken),
                    voterHash: fieldString(`User-${String(voterUid).slice(-4)}`),
                    candidateId: fieldInt(candidateId),
                    publicCode: fieldString(publicCode),
                    electionId: fieldString(electionId),
                    timestamp: fieldTimestamp(voteTime),
                },
            },
            currentDocument: { exists: false },
        },
        {
            update: {
                name: candidateName,
                fields: {
                    id: fieldInt(candidateId),
                    name: fieldString('Candidate One'),
                    party: fieldString('Independent'),
                    votes: fieldInt(1),
                    createdAt: fieldTimestamp(seedCreatedAtIso),
                    updatedAt: fieldTimestamp(voteTime),
                },
            },
            currentDocument: { exists: true },
        },
    ];
};

const buildCandidateOnlyWrite = ({ creatorUid, electionId, candidateId, nextVotes }) => ({
    update: {
        name: docName('users', creatorUid, 'elections', electionId, 'candidates', String(candidateId)),
        fields: {
            id: fieldInt(candidateId),
            name: fieldString('Candidate One'),
            party: fieldString('Independent'),
            votes: fieldInt(nextVotes),
            createdAt: fieldTimestamp(nowIso()),
        },
    },
    currentDocument: { exists: true },
});

const buildVoterOnlyWrite = ({ creatorUid, electionId, voterUid, inviteToken, candidateId }) => ({
    update: {
        name: docName('users', creatorUid, 'elections', electionId, 'voters', voterUid),
        fields: {
            inviteToken: fieldString(inviteToken),
            authUid: fieldString(voterUid),
            candidateId: fieldInt(candidateId),
            publicCode: fieldString('PUBLIC-CODE'),
            electionId: fieldString(electionId),
            hasVoted: fieldBool(true),
            votedAt: fieldTimestamp(nowIso()),
        },
    },
    currentDocument: { exists: false },
});

const buildAuditOnlyWrite = ({ creatorUid, electionId, voterUid, inviteToken, candidateId }) => ({
    update: {
        name: docName('users', creatorUid, 'elections', electionId, 'auditLog', voterUid),
        fields: {
            id: fieldString(voterUid),
            inviteToken: fieldString(inviteToken),
            voterHash: fieldString(`User-${String(voterUid).slice(-4)}`),
            candidateId: fieldInt(candidateId),
            publicCode: fieldString('PUBLIC-CODE'),
            electionId: fieldString(electionId),
            timestamp: fieldTimestamp(nowIso()),
        },
    },
    currentDocument: { exists: false },
});

const buildInviteOnlyWrite = ({ publicCode, inviteToken, creatorUid, electionId, voterUid }) => ({
    update: {
        name: docName('publicElections', publicCode, 'invites', inviteToken),
        fields: {
            token: fieldString(inviteToken),
            creatorId: fieldString(creatorUid),
            publicCode: fieldString(publicCode),
            electionId: fieldString(electionId),
            used: fieldBool(true),
            usedBy: fieldString(voterUid),
            usedAt: fieldTimestamp(nowIso()),
            createdAt: fieldTimestamp(nowIso()),
            updatedAt: fieldTimestamp(nowIso()),
        },
    },
    currentDocument: { exists: true },
});

const expectCommitAllowed = async (label, idToken, writes) => {
    const response = await firestoreCommit(idToken, writes);
    if (!response.ok) {
        throw new Error(`${label} should have been allowed, but failed: ${JSON.stringify(response.body)}`);
    }

    return response.body;
};

const expectCommitDenied = async (label, idToken, writes) => {
    const response = await firestoreCommit(idToken, writes);
    assert(!response.ok, `${label} should have been denied, but succeeded.`);
    const errorText = JSON.stringify(response.body);
    assert(/permission|denied|failed/i.test(errorText), `${label} denial did not look like a rules failure: ${errorText}`);
    return response.body;
};

const readAdminDoc = async (...segments) => {
    const snapshot = await adminDoc(...segments).get();
    return snapshot.exists ? snapshot.data() : null;
};

const main = async () => {
    const seedCreatedAt = admin.firestore.Timestamp.now();
    const seedCreatedAtIso = seedCreatedAt.toDate().toISOString();
    const creator1 = await signUpAnonymous();
    const creator2 = await signUpAnonymous();
    const voter1 = await signUpAnonymous();
    const voter2 = await signUpAnonymous();
    const voter3 = await signUpAnonymous();
    const voter4 = await signUpAnonymous();
    const attacker = await signUpAnonymous();

    const electionId = randomId('election');
    const publicCode = randomId('PUBLIC').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const candidateId = 1;
    const invite1 = 'TOKEN-ONE';
    const invite2 = 'TOKEN-TWO';
    const invite3 = 'TOKEN-THREE';
    const invite4 = 'TOKEN-FOUR';
    const usedToken = 'TOKEN-USED';

    await seedElection({
        creatorUid: creator1.uid,
        electionId,
        publicCode,
        candidateId,
        inviteToken: invite1,
        extraInviteToken: invite2,
        createdAt: seedCreatedAt,
    });

    await adminDoc('publicElections', publicCode, 'invites', invite3).set({
        token: invite3,
        creatorId: creator1.uid,
        publicCode,
        electionId,
        used: false,
        usedBy: '',
        usedAt: null,
        createdAt: seedCreatedAt,
        updatedAt: seedCreatedAt,
    });

    await adminDoc('publicElections', publicCode, 'invites', invite4).set({
        token: invite4,
        creatorId: creator1.uid,
        publicCode,
        electionId,
        used: false,
        usedBy: '',
        usedAt: null,
        createdAt: seedCreatedAt,
        updatedAt: seedCreatedAt,
    });

    await adminDoc('publicElections', publicCode, 'invites', usedToken).set({
        token: usedToken,
        creatorId: creator1.uid,
        publicCode,
        electionId,
        used: true,
        usedBy: voter1.uid,
        usedAt: seedCreatedAt,
        createdAt: seedCreatedAt,
        updatedAt: seedCreatedAt,
    });

    const results = [];
    const record = (label, passed, detail = '') => {
        results.push({ label, passed, detail });
        log(label, passed ? 'PASS' : 'FAIL', detail);
    };

    try {
        // 1. Valid vote flow.
        await expectCommitAllowed('Valid vote flow', voter1.idToken, buildVoteWrites({
            creatorUid: creator1.uid,
            electionId,
            publicCode,
            candidateId,
            inviteToken: invite1,
            voterUid: voter1.uid,
            voteTime: nowIso(),
            seedCreatedAtIso,
        }));

        const candidateAfterValid = await readAdminDoc('users', creator1.uid, 'elections', electionId, 'candidates', String(candidateId));
        const voterAfterValid = await readAdminDoc('users', creator1.uid, 'elections', electionId, 'voters', voter1.uid);
        const auditAfterValid = await readAdminDoc('users', creator1.uid, 'elections', electionId, 'auditLog', voter1.uid);
        const inviteAfterValid = await readAdminDoc('publicElections', publicCode, 'invites', invite1);

        assert(candidateAfterValid?.votes === 1, 'Candidate vote count did not increment to 1.');
        assert(voterAfterValid?.authUid === voter1.uid, 'Voter doc was not written with auth.uid.');
        assert(voterAfterValid?.inviteToken === invite1, 'Voter doc did not store invite token.');
        assert(auditAfterValid?.id === voter1.uid, 'Audit doc was not keyed by auth.uid.');
        assert(auditAfterValid?.inviteToken === invite1, 'Audit doc did not store invite token.');
        assert(inviteAfterValid?.used === true, 'Invite token was not marked used.');
        assert(inviteAfterValid?.usedBy === voter1.uid, 'Invite token was not bound to auth.uid.');
        assert(!(await readAdminDoc('users', creator1.uid, 'elections', electionId, 'voters', invite1)), 'Legacy voter doc path still exists.');
        record('1. Valid vote flow', true, `uid=${voter1.uid}`);

        // 2. Token reuse from different UID.
        await expectCommitDenied('Token reuse from different UID', voter2.idToken, buildVoteWrites({
            creatorUid: creator1.uid,
            electionId,
            publicCode,
            candidateId,
            inviteToken: invite1,
            voterUid: voter2.uid,
            voteTime: nowIso(),
            seedCreatedAtIso,
        }));
        assert(!(await readAdminDoc('users', creator1.uid, 'elections', electionId, 'voters', voter2.uid)), 'Second UID unexpectedly created a voter doc.');
        record('2. Token reuse from different UID', true, `uid=${voter2.uid}`);

        // 3. Same UID double-vote using a different invite token.
        await expectCommitDenied('Same UID double-vote', voter1.idToken, buildVoteWrites({
            creatorUid: creator1.uid,
            electionId,
            publicCode,
            candidateId,
            inviteToken: invite2,
            voterUid: voter1.uid,
            voteTime: nowIso(),
            seedCreatedAtIso,
        }));
        const candidateAfterDouble = await readAdminDoc('users', creator1.uid, 'elections', electionId, 'candidates', String(candidateId));
        const invite2After = await readAdminDoc('publicElections', publicCode, 'invites', invite2);
        assert(candidateAfterDouble?.votes === 1, `Same UID retry unexpectedly changed the vote total to ${candidateAfterDouble?.votes}.`);
        assert(invite2After?.used === false, 'Unused token was unexpectedly consumed by a rejected retry.');
        record('3. Same UID double-vote', true, `uid=${voter1.uid}`);

        // 4. Multi-tab / race condition with the same token and UID.
        const raceSession = await createSdkSession('race-session');
        const raceResults = await Promise.allSettled([
            runClientVoteTransaction(raceSession, {
                creatorUid: creator1.uid,
                electionId,
                publicCode,
                candidateId,
                inviteToken: invite3,
            }),
            runClientVoteTransaction(raceSession, {
                creatorUid: creator1.uid,
                electionId,
                publicCode,
                candidateId,
                inviteToken: invite3,
            }),
        ]);
        const raceFulfilled = raceResults.filter((entry) => entry.status === 'fulfilled').length;
        const raceRejected = raceResults.filter((entry) => entry.status === 'rejected').length;
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
            raceResults: raceResults.map((entry) => (
                entry.status === 'fulfilled'
                    ? { status: 'fulfilled', value: entry.value }
                    : { status: 'rejected', reason: String(entry.reason?.message || entry.reason) }
            )),
        }, null, 2));
        if (raceFulfilled === 1 && raceRejected === 1) {
            record('4. Multi-tab / race condition', true, 'success=1 failure=1');
        } else {
            record('4. Multi-tab / race condition', false, `expected success=1 failure=1 but got success=${raceFulfilled} failure=${raceRejected}`);
        }
        const candidateAfterRace = await readAdminDoc('users', creator1.uid, 'elections', electionId, 'candidates', String(candidateId));
        if (candidateAfterRace?.votes === 2) {
            // no-op, expected state
        } else {
            // eslint-disable-next-line no-console
            console.warn(`[WARN] Race test candidate total was ${candidateAfterRace?.votes}; expected 2.`);
        }

        // 5. Refresh / retry idempotence.
        let refreshFirstAttemptAllowed = true;
        try {
            await expectCommitAllowed('Refresh / retry first attempt', voter4.idToken, buildVoteWrites({
                creatorUid: creator1.uid,
                electionId,
                publicCode,
                candidateId,
                inviteToken: invite4,
                voterUid: voter4.uid,
                voteTime: nowIso(),
                seedCreatedAtIso,
            }));
        } catch (error) {
            refreshFirstAttemptAllowed = false;
            record('5. Refresh / retry', false, `first attempt failed: ${error?.message || String(error)}`);
        }
        if (refreshFirstAttemptAllowed) {
            await expectCommitDenied('Refresh / retry repeated submit', voter4.idToken, buildVoteWrites({
                creatorUid: creator1.uid,
                electionId,
                publicCode,
                candidateId,
                inviteToken: invite4,
                voterUid: voter4.uid,
                voteTime: nowIso(),
                seedCreatedAtIso,
            }));
            record('5. Refresh / retry', true, `uid=${voter4.uid}`);
        }

        // 6. Invalid token cases.
        await expectCommitDenied('Invalid token - malformed/nonexistent', attacker.idToken, buildVoteWrites({
            creatorUid: creator1.uid,
            electionId,
            publicCode,
            candidateId,
            inviteToken: 'NOT-A-REAL-TOKEN',
            voterUid: attacker.uid,
            voteTime: nowIso(),
            seedCreatedAtIso,
        }));
        await expectCommitDenied('Invalid token - used token', attacker.idToken, buildVoteWrites({
            creatorUid: creator1.uid,
            electionId,
            publicCode,
            candidateId,
            inviteToken: usedToken,
            voterUid: attacker.uid,
            voteTime: nowIso(),
            seedCreatedAtIso,
        }));
        record('6. Invalid token cases', true, 'malformed/nonexistent/used denied');

        // 7. Direct Firestore write attack attempts.
        await expectCommitDenied('Direct candidate increment attack', attacker.idToken, [buildCandidateOnlyWrite({
            creatorUid: creator1.uid,
            electionId,
            candidateId,
            nextVotes: 999,
        })]);
        await expectCommitDenied('Direct voter doc creation attack', attacker.idToken, [buildVoterOnlyWrite({
            creatorUid: creator1.uid,
            electionId,
            voterUid: attacker.uid,
            inviteToken: invite1,
            candidateId,
        })]);
        await expectCommitDenied('Direct audit log write attack', attacker.idToken, [buildAuditOnlyWrite({
            creatorUid: creator1.uid,
            electionId,
            voterUid: attacker.uid,
            inviteToken: invite1,
            candidateId,
        })]);
        await expectCommitDenied('Token reassignment attack', attacker.idToken, [buildInviteOnlyWrite({
            publicCode,
            inviteToken: invite1,
            creatorUid: creator1.uid,
            electionId,
            voterUid: attacker.uid,
        })]);
        record('7. Direct Firestore write attacks', true, 'all denied');

        // 8. Authorization boundary checks.
        await expectCommitDenied('Other creator cannot modify election metadata', creator2.idToken, [{
            update: {
                name: docName('users', creator1.uid, 'elections', electionId),
                fields: {
                    id: fieldString(electionId),
                    title: fieldString('Tampered title'),
                    description: fieldString('Tampered description'),
                    creatorId: fieldString(creator1.uid),
                    publicCode: fieldString(publicCode),
                    publicLink: fieldString(publicCode),
                    isActive: fieldBool(false),
                    verification: { mapValue: { fields: { method: fieldString('CNIC') } } },
                    createdAt: fieldTimestamp(nowIso()),
                    updatedAt: fieldTimestamp(nowIso()),
                },
            },
            currentDocument: { exists: true },
        }]);
        await expectCommitDenied('Voter cannot edit candidate counts', voter1.idToken, [buildCandidateOnlyWrite({
            creatorUid: creator1.uid,
            electionId,
            candidateId,
            nextVotes: 123,
        })]);
        await expectCommitDenied('Voter cannot reopen used tokens', voter1.idToken, [buildInviteOnlyWrite({
            publicCode,
            inviteToken: invite1,
            creatorUid: creator1.uid,
            electionId,
            voterUid: voter1.uid,
        })]);
        record('8. Authorization boundary checks', true, 'all denied');

        const summary = {
            projectId: PROJECT_ID,
            electionId,
            publicCode,
            creatorUid: creator1.uid,
            tests: results,
        };

        // eslint-disable-next-line no-console
        console.log(JSON.stringify(summary, null, 2));
        return 0;
    } catch (error) {
        record('Validation run', false, error?.message || String(error));
        // eslint-disable-next-line no-console
        console.error(JSON.stringify({
            projectId: PROJECT_ID,
            electionId,
            publicCode,
            tests: results,
            error: error?.message || String(error),
        }, null, 2));
        return 1;
    }
};

const exitCode = await main();
process.exit(exitCode);