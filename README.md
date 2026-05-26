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

## Deployment Overview

Use these docs for the exact release flow:

- [Environment Setup](ENVIRONMENT_SETUP.md)
- [Firebase Setup](FIREBASE_SETUP.md)
- [Deploy Checklist](DEPLOY_CHECKLIST.md)
- [Troubleshooting](TROUBLESHOOTING.md)

Deployment flow summary:

1. Configure Firebase Auth, Firestore, and service credentials.
2. Set all required `VITE_FIREBASE_*` variables in Firebase Hosting environment config or your local `.env` files for development.
3. Run `npm run validate:firebase` and `npm run build` before any release.
4. Deploy Firestore rules and indexes.
5. Deploy Firebase Hosting.
6. Run the Firestore smoke test in the target environment.
7. Promote only after the smoke test passes.

## Security Notes

- Firestore rules restrict writes to the authenticated owner.
- Candidate and voter data are stored under each user’s election document.
- Public voting uses the election link, but ownership checks still protect private actions.

## Deployment Guide

See [HOSTING.md](HOSTING.md) for the full step-by-step deployment guide.

For the hardened deployment checklist and environment matrix, see [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md) and [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md).

## Smoke tests & Verification (Playwright browser flow)

This repository uses a browser-based verification flow for public voting so you can exercise the deployed app in the same way a real voter does.

Quick commands (PowerShell):

1) Create resources (test user, election, candidate, public mirror). Prints JSON with `publicCode`, `electionId`, `uid`:

```powershell
node tools/smokeCreateResources.mjs
```

2) Verify candidate votes after using the live public vote page:

```powershell
node tools/checkCandidate.cjs users/<uid>/elections/<electionId>/candidates/<candidateId> "C:\path\to\service-account.json"
```

3) (Optional) Cleanup the test election:

```powershell
node tools/cleanupPublicElection.cjs <publicCodeOrElectionId>
```

For a service-account-backed Firestore connectivity check, run:

```powershell
npm run smoke:firebase
```

Notes:
- Playwright is a devDependency and may require `npx playwright install --with-deps` on CI or new machines.

## Troubleshooting

- If `firebase-admin` fails to initialize in Firebase runtimes or smoke tests, confirm `FIREBASE_SERVICE_ACCOUNT` contains the full JSON string and `FIREBASE_PROJECT_ID` is correct.
- If the build fails, confirm every `VITE_FIREBASE_*` env var is present and that demo mode is not enabled in production.

## Files of interest
- `backend/firebaseAdmin.js` — `firebase-admin` initialization (reads `FIREBASE_SERVICE_ACCOUNT`)
- `tools/smokeCreateResources.mjs` — creates test resources
- `tools/checkCandidate.cjs` — fetch a candidate document for verification
- `tools/cleanupPublicElection.cjs` — delete public election and related docs

