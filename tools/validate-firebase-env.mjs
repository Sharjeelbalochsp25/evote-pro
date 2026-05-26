import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const requiredKeys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
];

const envFiles = ['.env', '.env.local', '.env.production']
    .map((fileName) => path.resolve(process.cwd(), fileName))
    .filter((filePath) => fs.existsSync(filePath));

const mergedEnv = { ...process.env };

for (const filePath of envFiles) {
    const parsed = dotenv.parse(fs.readFileSync(filePath));
    Object.assign(mergedEnv, parsed);
}

const missing = requiredKeys.filter((key) => !String(mergedEnv[key] || '').trim());

if (missing.length > 0) {
    console.error('[env:validate] Missing Firebase env vars:');
    for (const key of missing) {
        console.error(`- ${key}`);
    }
    process.exit(1);
}

console.log('[env:validate] Firebase env vars present.');