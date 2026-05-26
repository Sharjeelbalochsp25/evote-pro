import admin from 'firebase-admin';

const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;

if (!serviceAccountRaw) {
    console.error('[smoke:firebase] FIREBASE_SERVICE_ACCOUNT is required.');
    process.exit(1);
}

if (!projectId) {
    console.error('[smoke:firebase] FIREBASE_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required.');
    process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountRaw);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId,
    });
}

const db = admin.firestore();
const collectionName = '_healthchecks';
const docRef = db.collection(collectionName).doc(`smoke-${Date.now()}`);

try {
    await docRef.set({
        status: 'ok',
        projectId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const snapshot = await docRef.get();
    if (!snapshot.exists) {
        throw new Error('Smoke test write succeeded but read failed.');
    }

    await docRef.delete();
    console.log('[smoke:firebase] Firestore read/write/delete check passed for project', projectId);
} catch (error) {
    console.error('[smoke:firebase] Firestore smoke test failed:', error?.message || error);
    process.exit(1);
}