const fs = require('fs');

// Usage: node tools/findVotedCandidates.cjs [serviceAccountFile]
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

    console.log('Querying for candidates with votes > 0...');
    const snaps = await db.collectionGroup('candidates').where('votes', '>', 0).get();
    if (snaps.empty) {
      console.log('No voted candidates found.');
      return;
    }
    for (const doc of snaps.docs) {
      console.log('Found:', doc.ref.path, JSON.stringify(doc.data(), null, 2));
    }
  } catch (err) {
    console.error('Error during query:', err);
    process.exit(1);
  }
}

main();
