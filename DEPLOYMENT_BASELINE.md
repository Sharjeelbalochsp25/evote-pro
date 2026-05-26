# Deployment Baseline

- Firebase project ID: `evotepro-7deff`
- Hosting URL: `https://evotepro-7deff.web.app`
- Current asset hash: `index-DNSy6DtH.js`
- Active deployment architecture: Firebase Hosting serves the React/Vite frontend; Firebase Auth provides anonymous public voting identity; Firestore stores elections, candidates, invite tokens, voters, and audit data. The live vote flow is client-side Firestore transaction based.

## Firestore Collections In Use

- `publicElections/{publicCode}` for the public mirror of an election
- `publicElections/{publicCode}/invites/{inviteToken}` for vote-token state
- `users/{creatorId}/elections/{electionId}` for the creator-owned canonical election record
- `users/{creatorId}/elections/{electionId}/candidates/{candidateId}` for candidate tallies
- `users/{creatorId}/elections/{electionId}/voters/{voterUid}` for voter records
- `users/{creatorId}/elections/{electionId}/auditLog/{voterUid}` for vote audit entries

## Authentication Model

- Public voters sign in anonymously with Firebase Auth before submitting a vote.
- Creator-side management uses the authenticated creator session already established in the dashboard.

## Vote Integrity Model

- Vote submission is a Firestore `runTransaction` on the public election mirror.
- The invite token is validated and consumed atomically.
- The candidate vote count is incremented in the creator-owned canonical election.
- A voter document and audit document are written in the same logical transaction path.
- Reuse is blocked because the invite document is marked `used` with `usedBy` and `usedAt`.

## Residual Risks

- Production dependencies still include backend Cloud Function code, so an old bundle could reintroduce the deprecated path if Hosting is not redeployed from current source.
- Invite tokens are still discoverable only through authenticated creator flows or seeded data; public enumeration is intentionally blocked by rules.
- No automated smoke harness was added in this checkpoint; validation relied on live browser verification and Firestore reads.

## Rollback Commands

```bash
git checkout <release-tag>
npm run build
npx firebase-tools deploy --only hosting --project evotepro-7deff
```

If you need to inspect or compare the deployed artifact before rolling back, use the current live asset URL from the release notes and verify it against the built `dist/assets/*.js` output.