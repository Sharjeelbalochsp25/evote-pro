# Release Notes

## Summary

This release stabilizes the app on a Firebase-first deployment path and records the current production-ready vote flow.

## What Changed

- Migrated the live deployment away from the mixed Vercel/Firebase shape and aligned Hosting with the current Firebase build output.
- Removed the demo fallback from the live voting flow so production users go through the Firestore-backed path.
- Standardized public voting on Firestore-only transactions instead of the deprecated Cloud Function vote submission path.
- Preserved token-bound voting by tying each vote to an invite token and the anonymous Firebase Auth UID used during submission.
- Kept the creator-side election management and live vote ledger on the Firebase stack.

## Production Readiness

- Hosting now serves the current `dist` bundle from Firebase Hosting.
- The live vote page uses the Firestore transaction flow and no longer references `castPublicVoteSecure` or `httpsCallable` in the deployed asset.
- Anonymous Firebase Auth remains the public voter identity layer.
- Invite token consumption, voter recording, audit logging, and candidate incrementing were verified on the live deployment.

## Notes for Operators

- Firebase project: `evotepro-7deff`
- Hosting URL: `https://evotepro-7deff.web.app`
- Current deployed asset: `index-DNSy6DtH.js`

## Rollback

If the release must be reverted, check out the release tag, rebuild, and redeploy Hosting.

```bash
git checkout <release-tag>
npm run build
npx firebase-tools deploy --only hosting --project evotepro-7deff
```