const fs = require('fs');

// Usage: node tools/scanPublicElections.cjs [serviceAccountFile]
async function main() {
  try {
    const serviceAccountFile = process.argv[2];
    if (serviceAccountFile && !process.env.FIREBASE_SERVICE_ACCOUNT) {
      const content = fs.readFileSync(serviceAccountFile, 'utf8');
      process.env.FIREBASE_SERVICE_ACCOUNT = content;
      console.log('Loaded service account from', serviceAccountFile);
    }

    const admin = require('../backend/firebaseAdmin');
    const db = admin.firestore();

    const peSnap = await db.collection('publicElections').get();
    if (peSnap.empty) {
      console.log('No publicElections found');
      return;
    }
    for (const doc of peSnap.docs) {
      const data = doc.data();
      const publicCode = doc.id;
      const electionId = data.electionId;
      const creatorId = data.creatorId;
      console.log(`Public ${publicCode} -> election ${electionId} by ${creatorId}`);

      const candSnap = await db.collection(`users/${creatorId}/elections/${electionId}/candidates`).get();
      if (candSnap.empty) {
        console.log('  No candidates');
        continue;
      }
      for (const c of candSnap.docs) {
        const cdata = c.data();
        console.log(`  Candidate ${c.id}: votes=${cdata.votes || 0}`);
      }
    }
  } catch (err) {
    console.error('Error scanning public elections:', err);
    process.exit(1);
  }
}

main();
