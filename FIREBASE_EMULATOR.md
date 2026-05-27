# Firebase Emulator Flow

Use this when you want to validate the Firebase-only vote path locally without touching production.

## Run the emulators

```powershell
Set-Location C:\Users\Talha\Desktop\evotepro
npm run emulators:start
```

## Run the app against the emulators

Open a second terminal:

```powershell
Set-Location C:\Users\Talha\Desktop\evotepro
npm run dev:emulator
```

Vite will load `.env.emulator`, which points the web app at the local Auth and Firestore emulators.

## What this gives you

- creator signup/login without touching production billing
- local Firestore writes and rules checks
- local public-vote validation against the emulator-backed transaction path
- no Blaze requirement while developing or running Playwright

## Notes

- The emulator path is for local development and QA only.
- Production deploys still use Firebase Hosting, Firestore, and Firebase Auth only.
