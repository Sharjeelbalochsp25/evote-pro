# Firebase Emulator Flow

Use this when you want to test vote casting without Blaze billing.

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

Vite will load `.env.emulator`, which points the web app at the local Auth, Firestore, and Functions emulators.

## What this gives you

- creator signup/login without touching production billing
- local Firestore writes and rules checks
- local callable vote tests against `castVoteSecure` and `castPublicVoteSecure`
- no Blaze requirement while developing the secure vote flow

## Notes

- The hosted Firebase site still needs Blaze for deployed Functions.
- The emulator path is for local development and QA only.