const admin = require('../backend/firebaseAdmin');

async function main() {
  try {
    const db = admin.firestore();
    const docPath = process.argv[2] || 'users/p5Ssq5iSJSMEcHRElpyFpyeYuFB2/elections/electh4jn0x/candidates/1';
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
