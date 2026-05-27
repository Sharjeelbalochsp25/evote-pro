import { initializeApp, getApps } from 'firebase/app';
import { getAnalytics, isSupported, logEvent } from 'firebase/analytics';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { recordClientEvent } from './utils/clientObservability';

const REQUIRED_FIREBASE_KEYS = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
];

export const firebaseClientConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const hasFirebaseConfig = Object.values(firebaseClientConfig).every(
    (value) => typeof value === 'string' && value.length > 0,
);

export const validateFirebaseConfig = (env = import.meta.env) => {
    const missing = REQUIRED_FIREBASE_KEYS.filter((key) => !String(env[key] || '').trim());
    const demoMode = Boolean(env.DEV) && String(env.VITE_ENABLE_DEMO_MODE || '').toLowerCase() === 'true';

    return {
        valid: missing.length === 0,
        missing,
        demoMode,
        isProduction: Boolean(env.PROD),
    };
};

export const firebaseDiagnostics = validateFirebaseConfig();
export const hasDemoMode = firebaseDiagnostics.demoMode;
export const deploymentDiagnostics = {
    mode: import.meta.env.MODE,
    isDev: Boolean(import.meta.env.DEV),
    isProd: Boolean(import.meta.env.PROD),
    deploymentEnv: import.meta.env.VITE_DEPLOYMENT_ENV || (import.meta.env.DEV ? 'local-dev' : 'production'),
    host: typeof window !== 'undefined' ? window.location.host : 'server',
    projectId: firebaseClientConfig.projectId || 'unknown',
};

let analyticsInstance = null;
let analyticsInitPromise = null;

export const ensureFirebaseAnalytics = async () => {
    if (!app || typeof window === 'undefined') return null;
    if (analyticsInstance) return analyticsInstance;

    if (!analyticsInitPromise) {
        analyticsInitPromise = isSupported()
            .then((supported) => {
                if (!supported) return null;
                analyticsInstance = getAnalytics(app);
                return analyticsInstance;
            })
            .catch(() => null);
    }

    return analyticsInitPromise;
};

export const trackAnalyticsEvent = async (eventName, params = {}) => {
    const analytics = await ensureFirebaseAnalytics();
    if (!analytics) return false;

    try {
        logEvent(analytics, eventName, params);
        return true;
    } catch {
        return false;
    }
};

const logStartupDiagnostics = () => {
    // eslint-disable-next-line no-console
    console.info('[Startup] Deployment diagnostics', deploymentDiagnostics);

    if (deploymentDiagnostics.deploymentEnv === 'preview') {
        // eslint-disable-next-line no-console
        console.info('[Startup] Preview deployment detected. Production Firebase credentials must still be present.');
    }

    if (firebaseDiagnostics.valid) {
        // eslint-disable-next-line no-console
        console.info('[Startup] Firebase config validated for project', deploymentDiagnostics.projectId);
    } else {
        // eslint-disable-next-line no-console
        console.warn('[Startup] Firebase validation failed', { missing: firebaseDiagnostics.missing, demoMode: firebaseDiagnostics.demoMode });
    }

    recordClientEvent('startup', 'Deployment diagnostics loaded', {
        deploymentEnv: deploymentDiagnostics.deploymentEnv,
        host: deploymentDiagnostics.host,
        projectId: deploymentDiagnostics.projectId,
        firebaseConfigValid: firebaseDiagnostics.valid,
        demoMode: firebaseDiagnostics.demoMode,
    });
};

logStartupDiagnostics();

export const app = hasFirebaseConfig
    ? getApps().length
        ? getApps()[0]
        : initializeApp(firebaseClientConfig)
    : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

const useFirebaseEmulator = String(import.meta.env.VITE_USE_FIREBASE_EMULATOR || '').toLowerCase() === 'true';
const emulatorBridge = typeof window !== 'undefined' ? window : globalThis;

if (app && auth && db && useFirebaseEmulator && !emulatorBridge.__EVOTEPRO_FIREBASE_EMULATORS_CONNECTED__) {
    try {
        connectAuthEmulator(auth, 'http://127.0.0.1:9100', { disableWarnings: true });
        connectFirestoreEmulator(db, '127.0.0.1', 8180);
        emulatorBridge.__EVOTEPRO_FIREBASE_EMULATORS_CONNECTED__ = true;
        // eslint-disable-next-line no-console
        console.info('[Startup] Firebase emulators connected for auth and firestore.');
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[Startup] Failed to connect Firebase emulators', error);
    }
}

if (!hasFirebaseConfig) {
    const missingKeys = firebaseDiagnostics.missing.join(', ');
    const message = `[Firebase] Missing required env vars: ${missingKeys}`;
    if (firebaseDiagnostics.demoMode && !firebaseDiagnostics.isProduction) {
        // eslint-disable-next-line no-console
        console.warn(`${message}. Demo mode is explicitly enabled via VITE_ENABLE_DEMO_MODE=true.`);
    } else {
        // eslint-disable-next-line no-console
        console.error(`${message}. Demo mode is disabled, so the app must not silently degrade.`);
    }
}
