# Release Summary

## Migration Overview

This release candidate completes the migration from the older hybrid deployment shape to a Firebase-only production model. The live vote path now runs through Firebase Hosting, Firebase Auth, Firestore, and Firestore transactions only.

## Hardening Milestones

- Removed production dependence on the previous hosted vote path
- Removed the production demo fallback
- Stabilized public vote readiness markers for browser automation
- Enforced uppercase invite-token handling in the seed and client flow
- Switched vote submission to transaction-safe Firestore writes that satisfy emulator rules
- Added deterministic Playwright diagnostics retention for failures
- Verified emulator-backed concurrency and duplicate-prevention behavior

## Voting Integrity Model

- Invite eligibility is represented by a single-use invite document
- Anonymous Firebase Auth provides the voter identity UID
- The transaction consumes the invite, writes the voter record, writes the audit log, and increments the selected candidate atomically
- Duplicate voting is blocked by the `used` invite state and transaction preconditions

## Validation Results

- Playwright: 12/12 passing across desktop and mobile projects
- Emulator integrity: invite redemption, voter count, audit count, and candidate votes all matched after the successful run
- Concurrency: multi-session voting completed without duplicate acceptance
- Offline/retry: the UI now surfaces retryable failures and succeeds after reconnect

## Residual Risks

- Firebase Analytics still emits API-key warnings in local development if analytics is initialized with a non-production key
- Spark quota limits remain the main scaling boundary for larger elections
- Any future schema drift between seeded documents and Firestore rules could block vote commits, so seed shape and rules should stay aligned

## Rollback Steps

```powershell
git checkout <previous-tag>
npm run build
npm run deploy:firebase
```

If the rollback is rule-only, deploy Firestore rules first and then redeploy Hosting.

## Production Confidence

Confidence score: 9/10

The current Firebase-only production flow is stable and ready for small-to-medium election workloads.
