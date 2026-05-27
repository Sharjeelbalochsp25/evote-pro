# Operations

## Deployment Flow

1. Set the required `VITE_FIREBASE_*` environment variables
2. Run `npm run validate:firebase`
3. Run `npm run build`
4. Deploy Firebase Hosting and Firestore rules with `npm run deploy:firebase`
5. Verify the live vote page, creator dashboard, and public election route

## Emulator Testing Flow

```powershell
npm run emulators:start
npm run dev:emulator
npm run test:e2e
```

Use the emulator flow when validating the vote path locally or when running browser-based regression tests.

## Smoke Test Flow

```powershell
npm run smoke:firebase
```

Use the smoke test to verify that the app can read and write against the configured Firestore environment before a release.

## Production Verification

- Confirm the public vote route loads with the live Firebase project
- Confirm token validation enables the candidate selection and cast button
- Confirm a successful vote renders the receipt screen
- Confirm the invite document changes to `used=true`
- Confirm the voter and audit documents are written

## Verifying Invite Redemption

- Open the invite document in Firestore and confirm `used`, `usedBy`, and `usedAt`
- Confirm the public vote screen shows the receipt and no longer allows a second ballot

## Verifying Audit Records

- Check `users/{creatorId}/elections/{electionId}/auditLog/{voterUid}`
- Confirm the audit entry matches the candidate selected and the invite token redeemed

## Monitoring Failures

- Watch Firestore emulator or production logs for `permission-denied`, quota warnings, or retry spikes
- Watch Playwright traces and screenshots for selector regressions or transaction failures
- Monitor Firebase quota usage if daily voting volume grows beyond the conservative Spark-tier planning envelope

## Rollback Commands

```powershell
git checkout <previous-tag>
npm run build
npm run deploy:firebase
```

If the issue is only Firestore rules, deploy the previous ruleset first and then redeploy Hosting.
