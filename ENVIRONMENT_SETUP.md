# Environment Setup

This project is production-first. Missing Firebase config should fail the build or block startup.

## Required client env vars

Set these in `.env.local` for local development and in your hosting provider for preview and production:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Optional client env vars

- `VITE_ENABLE_DEMO_MODE=true` for local demo-only testing.
- `VITE_DEPLOYMENT_ENV=preview` for preview deployments.

## Backend env vars

- `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_PROJECT_ID`
- `GOOGLE_CLOUD_PROJECT` as a fallback project identifier

## Local files

- `.env.example` shows the required client keys.
- `.env.production` is ignored by git and should not be trusted for hosted builds.
- `.env.emulator` is only for local emulator development.

## Validation commands

```powershell
npm run validate:firebase
npm run build
```
