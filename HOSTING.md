# Hosting Guide for E-VotePro

This guide covers the current Firebase-only production deployment.

## Build and Deploy

```powershell
npm install
npm run validate:firebase
npm run build
npm run deploy:firebase
```

## Production Expectations

- Firebase Hosting serves the React/Vite build
- Firestore stores the election, invite, voter, and audit data
- Firebase Auth provides the public voter identity layer
- The public vote path uses Firestore transactions only
- There is no legacy hosted vote route in the production vote path
- There is no backend vote function path in the production vote path
- There is no production demo fallback

## Local Development

```powershell
npm run emulators:start
npm run dev:emulator
```

Use the emulator flow for local QA and Playwright validation. Production builds must always be checked with `npm run validate:firebase` before deploy.
