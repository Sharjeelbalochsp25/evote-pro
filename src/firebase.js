import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const productionFirebaseConfig = {
    apiKey: 'AIzaSyDZDUX4JpmYfGefLgsCkQlXRT5LgiVdzUg',
    authDomain: 'evotepro-7deff.firebaseapp.com',
    projectId: 'evotepro-7deff',
    storageBucket: 'evotepro-7deff.firebasestorage.app',
    messagingSenderId: '1046166648846',
    appId: '1:1046166648846:web:c3b4d19514190150ce645f',
};

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || productionFirebaseConfig.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || productionFirebaseConfig.authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || productionFirebaseConfig.projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || productionFirebaseConfig.storageBucket,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || productionFirebaseConfig.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || productionFirebaseConfig.appId,
};

export const hasFirebaseConfig = Object.values(firebaseConfig).every(
    (value) => typeof value === 'string' && value.length > 0,
);

export const app = hasFirebaseConfig
    ? getApps().length
        ? getApps()[0]
        : initializeApp(firebaseConfig)
    : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

if (!hasFirebaseConfig) {
    // eslint-disable-next-line no-console
    console.warn('[Firebase] Missing VITE_FIREBASE_* env vars; running in local-only mode.');
}
