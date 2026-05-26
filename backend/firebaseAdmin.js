const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

if (!admin.apps.length) {
    try {
        const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'evotepro-7deff';
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId });
            console.log('Firebase Admin initialized using FIREBASE_SERVICE_ACCOUNT');
        } else {
            admin.initializeApp({ projectId });
            console.log('Firebase Admin initialized using application default credentials');
        }
    } catch (err) {
        console.error('Failed to initialize Firebase Admin:', err.message || err);
        throw err;
    }
}

module.exports = admin;