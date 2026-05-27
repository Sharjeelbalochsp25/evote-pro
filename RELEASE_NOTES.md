# Release Notes

## Release Candidate Status

Current release status: RELEASE CANDIDATE / GO

This release locks the production vote flow to Firebase-only hosting, Firestore, and Firebase Auth. The public ballot path is transaction-based, duplicate-resistant, and validated by Playwright plus emulator checks.

## Highlights

- Firebase-only public voting path is now the production route
- Anonymous Firebase Auth remains the voter identity layer
- Invite token redemption is single-use and transaction-safe
- Receipt rendering, duplicate prevention, and retry handling are covered by E2E tests
- Diagnostics retention is enabled for Playwright failures

## Validation

- 12/12 Playwright tests passed
- Emulator integrity checks confirmed invite redemption, voter writes, audit writes, and candidate tallies

## Operator Notes

- Firebase project: `evotepro-7deff`
- Hosting URL: `https://evotepro-7deff.web.app`
- Production build: `npm run build`
- Deploy: `npm run deploy:firebase`
