const fs = require('fs');

// Usage: node tools/cleanupPublicElection.cjs <publicCode> [serviceAccountFile]
async function deleteDocRecursively(docRef) {
  const subcols = await docRef.listCollections();
  for (const col of subcols) {
    const snaps = await col.get();
    for (const d of snaps.docs) {
      await deleteDocRecursively(d.ref);
    }
  }
  await docRef.delete();
}

async function main() {
  try {
    const publicCode = process.argv[2];
    const serviceAccountFile = process.argv[3];
    if (!publicCode) {
      console.error('Usage: node tools/cleanupPublicElection.cjs <publicCode> [serviceAccountFile]');
      process.exit(1);
    }
    if (serviceAccountFile && !process.env.FIREBASE_SERVICE_ACCOUNT) {
      const content = fs.readFileSync(serviceAccountFile, 'utf8');
      process.env.FIREBASE_SERVICE_ACCOUNT = content;
      console.log('Loaded service account from', serviceAccountFile);
    }

    const admin = require('../backend/firebaseAdmin');
    const db = admin.firestore();

    const pubRef = db.collection('publicElections').doc(publicCode);
    const pubSnap = await pubRef.get();
    if (!pubSnap.exists) {
      console.log('No publicElection with code', publicCode);
      return;
    }
    const pub = pubSnap.data();
    const electionId = pub.electionId;
    const creatorId = pub.creatorId;

    console.log('Deleting candidates for election', electionId, 'by', creatorId);
    const candCol = db.collection(`users/${creatorId}/elections/${electionId}/candidates`);
    const candSnap = await candCol.get();
    for (const c of candSnap.docs) {
      await deleteDocRecursively(c.ref);
      console.log('Deleted candidate', c.ref.path);
    }

    // Delete voters or other subcollections under election
    const electionRef = db.doc(`users/${creatorId}/elections/${electionId}`);
    console.log('Deleting election document and its subcollections...');
    await deleteDocRecursively(electionRef);

    console.log('Deleting publicElection document', publicCode);
    await pubRef.delete();

    console.log('Cleanup completed for', publicCode);
  } catch (err) {
    console.error('Cleanup failed:', err);
    process.exit(1);
  }
}

main();
