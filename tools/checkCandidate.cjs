const fs = require('fs');

// Usage: node tools/checkCandidate.cjs [candidateDocPath] [serviceAccountFile]
async function main() {
  try {
    const docPath = process.argv[2] || 'users/p5Ssq5iSJSMEcHRElpyFpyeYuFB2/elections/electh4jn0x/candidates/1';
    const serviceAccountFile = process.argv[3];
    if (serviceAccountFile && !process.env.FIREBASE_SERVICE_ACCOUNT) {
      const content = fs.readFileSync(serviceAccountFile, 'utf8');
      process.env.FIREBASE_SERVICE_ACCOUNT = content;
      console.log('Loaded service account from', serviceAccountFile);
    }

    const admin = require('../backend/firebaseAdmin');
    const db = admin.firestore();
    const docRef = db.doc(docPath);
    const snap = await docRef.get();
    if (!snap.exists) {
      console.log('Document not found:', docPath);
      return;
    }
    console.log('Candidate doc:', JSON.stringify(snap.data(), null, 2));
  } catch (err) {
    console.error('Error fetching candidate:', err);
    process.exit(1);
  }
}

main();
