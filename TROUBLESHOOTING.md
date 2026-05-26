# Troubleshooting

## Build fails on Firebase validation

- Confirm every required `VITE_FIREBASE_*` variable is set.
- Confirm `VITE_ENABLE_DEMO_MODE` is not enabled in production.

## App shows startup error screen

- The hosted environment is missing Firebase config.
- Check Firebase Hosting build-time env vars and your local `.env` files.

## Login fails or hangs

- Confirm Firebase Auth is enabled.
- Confirm network access to Firebase.
- Check browser console for auth timeout or permission messages.

## Firestore errors

- Permission denied: check rules and owner ID matching.
- Unavailable/offline: retry after network recovery.
- Quota exceeded: check Firebase billing and usage dashboards.

## Public vote failures

- Verify `publicElections/{publicCode}` exists.
- Verify the public election has `creatorId`, `electionId`, and `ballotCandidates`.
- Confirm the browser is signed into the anonymous Firebase session used for the vote transaction.

## Rollback issues

- Re-deploy the previous successful hosting artifact.
- Verify the rollback target still has the same Firebase env variables.
- Run the smoke test again after rollback.
