import fs from 'fs';
const fetch = globalThis.fetch;

if (!fetch) throw new Error('Global fetch is not available in this Node runtime.');

const env = fs.existsSync('.env.production') ? fs.readFileSync('.env.production', 'utf8') : '';
const parseEnv = (text) => {
  const out = {};
  text.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  });
  return out;
};

const config = parseEnv(env);
const API_KEY = config.VITE_FIREBASE_API_KEY;
const PROJECT_ID = config.VITE_FIREBASE_PROJECT_ID || 'evotepro-7deff';
if (!API_KEY) {
  console.error('Missing API key in .env.production');
  process.exit(1);
}

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const random = (prefix) => `${prefix}${Date.now().toString(36).slice(-6)}`;

async function signup(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const body = await res.json();
  if (!res.ok) throw body;
  return body;
}

async function createDoc(path, docId, fields, idToken) {
  const url = `${FIRESTORE_BASE}/${path}${docId ? `?documentId=${docId}` : ''}`;
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ fields }) });
  const body = await res.text();
  try { return { status: res.status, body: JSON.parse(body) }; } catch { return { status: res.status, body }; }
}

(async () => {
  try {
    const email = `${random('smoke-')}@example.com`;
    const password = 'Password123!';
    const signupRes = await signup(email, password);
    const idToken = signupRes.idToken;
    const uid = signupRes.localId;

    const electionId = random('elect');
    const publicCode = random('PUB');

    const electionFields = {
      title: { stringValue: 'Smoke Test Election' },
      isActive: { booleanValue: true },
      creatorId: { stringValue: uid },
      publicCode: { stringValue: publicCode },
      publicLink: { stringValue: publicCode },
      verification: { mapValue: { fields: { method: { stringValue: 'CNIC' } } } },
      createdAt: { timestampValue: new Date().toISOString() },
    };

    let r = await createDoc(`users/${uid}/elections`, electionId, electionFields, idToken);
    console.log('Create election:', r.status);

    const candFields = { name: { stringValue: 'Alice' }, votes: { integerValue: '0' }, createdAt: { timestampValue: new Date().toISOString() } };
    r = await createDoc(`users/${uid}/elections/${electionId}/candidates`, '1', candFields, idToken);
    console.log('Create candidate:', r.status);

    const publicFields = { creatorId: { stringValue: uid }, electionId: { stringValue: electionId }, isActive: { booleanValue: true }, ballotCandidates: { arrayValue: { values: [] } } };
    r = await createDoc('publicElections', publicCode, publicFields, idToken);
    console.log('Create public mirror:', r.status);

    // Print machine-readable output
    console.log(JSON.stringify({ publicCode, electionId, uid }));
  } catch (err) {
    console.error('Resource creation failed:', err);
    process.exit(1);
  }
})();
