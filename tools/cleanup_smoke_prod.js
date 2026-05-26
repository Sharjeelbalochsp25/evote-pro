const admin = require('../backend/firebaseAdmin.js');
(async () => {
  const uid = '3vqMcJxcGZg9mmFFX67FhrzpEsN2';
  const electionId = 'electi7r3w1';
  const publicCode = 'PUBi7r3w1';
  const db = admin.firestore();
  try {
    const ref = db.doc(`users/${uid}/elections/${electionId}`);
    const subs = ['candidates', 'voters', 'auditLog'];
    for (const s of subs) {
      const docs = await ref.collection(s).listDocuments();
      for (const d of docs) {
        console.log('Deleting', d.path);
        await d.delete();
      }
    }
    await ref.delete();
    console.log('Deleted election doc');
    const pubRef = db.doc(`publicElections/${publicCode}`);
    await pubRef.delete();
    console.log('Deleted publicElections mirror');
    try {
      await admin.auth().deleteUser(uid);
      console.log('Deleted auth user', uid);
    } catch (e) {
      console.log('Failed to delete auth user:', e.message || e);
    }
    console.log('Cleanup complete');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
  process.exit(0);
})();
