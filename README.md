# E-VotePro

Repository: https://github.com/Sharjeelbalochsp25/evote-pro

Version: 0.0.0

E-VotePro is a multi-election voting platform built with React, Vite, Firebase, and Firestore. It supports per-election candidate management, voter verification methods, public election links, and Firebase-backed deployment.

## Features

- Multi-election support per user
- Public election links for voting
- Dynamic voter verification fields
- Owner-only candidate management
- Firestore-backed vote storage and audit logs
- Firebase Auth + Firestore security rules

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Node.js, Express, Firebase Admin, Firebase Functions
- **Database:** Firestore
- **Auth:** Firebase Authentication

## Project Structure

- `src/` — React app, pages, contexts, and Firebase client setup
- `backend/` — Express API wrapped for Firebase Functions deployment
- `firestore.rules` — Firestore security rules
- `firebase.json` — Firebase Hosting / Functions / Firestore config
- `HOSTING.md` — Deployment guide

## Prerequisites

- Node.js 18+
- Firebase project
- Firebase CLI

## Local Setup

Install dependencies:

```bash
npm install
cd backend
npm install
```

Run the frontend:

```bash
npm run dev
```

Run the backend locally:

```bash
cd backend
node server.js
```

Build for production:

```bash
npm run build
```

## Environment Variables

Set these in your local `.env` file and in your hosting provider:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT=
```

## Firebase Deployment

1. Replace the placeholder project id in [`.firebaserc`](.firebaserc).
2. Deploy on free tier (recommended default):

```bash
npm run deploy:firebase
```

3. Optional full stack deploy with backend Functions (requires Blaze billing plan):

```bash
npm run deploy:firebase:full
```

4. Build manually when needed:

```bash
npm run build
```

## Security Notes

- Firestore rules restrict writes to the authenticated owner.
- Candidate and voter data are stored under each user’s election document.
- Public voting uses the election link, but ownership checks still protect private actions.

## Deployment Guide

See [HOSTING.md](HOSTING.md) for the full step-by-step deployment guide.

## Vercel Deployment (recommended)

- The project is hosted on Vercel and uses serverless API wrappers in `api/*.cjs` to avoid ESM/CommonJS mismatches when the repository root uses `"type":"module"`.
- `vercel.json` routes `/api/(.*)` to `/api/$1.cjs` so API handlers run as CommonJS functions.
- Make sure the following environment variables are set in the Vercel project settings (Dashboard → Settings → Environment Variables):
	- **FIREBASE_SERVICE_ACCOUNT**: full JSON contents of the Firebase service account (string). This is required by `firebase-admin` at runtime.
	- **FIREBASE_PROJECT_ID** / **VITE_FIREBASE_PROJECT_ID**: your Firebase project id.
	- Any `VITE_...` client keys your app needs.

## Smoke tests & Verification (Playwright browser flow)

To work around Vercel's bot security checkpoint for automated HTTP clients, this repository includes a Playwright-based browser flow that performs a real browser POST to the serverless API (same flow a real user would take).

Quick commands (PowerShell):

1) Create resources (test user, election, candidate, public mirror). Prints JSON with `publicCode`, `electionId`, `uid`:

```powershell
node tools/smokeCreateResources.mjs
```

2) Cast a browser vote (replace `PUBLIC` and `CANDIDATE` with values from step 1):

```powershell
node tools/browserVote.cjs <PUBLIC_CODE> <CANDIDATE_ID>
```

3) Verify candidate votes (use a local service account file if you don't rely on Vercel secrets):

```powershell
node tools/checkCandidate.cjs users/<uid>/elections/<electionId>/candidates/<candidateId> "C:\path\to\service-account.json"
```

4) (Optional) Cleanup the test election:

```powershell
node tools/cleanupPublicElection.cjs <publicCodeOrElectionId>
```

Notes:
- Playwright is a devDependency and may require `npx playwright install --with-deps` on CI or new machines.
- If you prefer fully automated API calls (no browser), you will need to disable or adjust the Vercel Security Checkpoint in your Vercel project settings; otherwise use the browser-flow above.

## Troubleshooting

- If you see `require is not defined` or ESM-related errors on Vercel, ensure serverless handlers are `.cjs` and `vercel.json` routing is intact.
- If `firebase-admin` fails to initialize in Vercel, confirm `FIREBASE_SERVICE_ACCOUNT` contains the full JSON string and `FIREBASE_PROJECT_ID` is correct.
- To inspect runtime logs for the Vercel deployment:

```powershell
npx vercel logs <project-or-deployment> --prod --since 1h
```

## Files of interest
- `api/*.cjs` — Vercel serverless wrappers
- `backend/firebaseAdmin.js` — `firebase-admin` initialization (reads `FIREBASE_SERVICE_ACCOUNT`)
- `tools/smokeCreateResources.mjs` — creates test resources
- `tools/browserVote.cjs` — Playwright browser-based vote
- `tools/checkCandidate.cjs` — fetch a candidate document for verification
- `tools/cleanupPublicElection.cjs` — delete public election and related docs

