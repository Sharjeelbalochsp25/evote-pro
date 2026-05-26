const admin = require('firebase-admin');

async function main() {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT env var is required');
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;

    const credential = admin.credential.cert(serviceAccount);
    admin.initializeApp({ credential, projectId });

    // obtain OAuth2 access token from the cert credential
    const tokenResponse = await credential.getAccessToken();
    const accessToken = tokenResponse && tokenResponse.access_token ? tokenResponse.access_token : tokenResponse;
    if (!accessToken) throw new Error('Failed to obtain access token from service account');

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/elections/indexes`;

    const body = {
      fields: [
        { fieldPath: 'publicLink', order: 'ASCENDING' }
      ],
      queryScope: 'COLLECTION_GROUP'
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('Failed to create index:', res.status, text);
      process.exit(2);
    }

    console.log('Index creation response:', text);
    console.log('Index creation request accepted; index will build asynchronously in the Firebase console.');
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
