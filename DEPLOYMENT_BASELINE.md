# Deployment Baseline

- Firebase project ID: `evotepro-7deff`
- Hosting URL: `https://evotepro-7deff.web.app`
- Active deployment architecture: Firebase Hosting serves the React/Vite frontend, Firebase Auth provides anonymous public voting identity, and Firestore stores elections, invites, voters, and audit data. The live vote flow is a client-side Firestore transaction.

## Current Collections

- `publicElections/{publicCode}` for the public mirror of an election
- `publicElections/{publicCode}/invites/{inviteToken}` for vote-token state
- `users/{creatorId}/elections/{electionId}` for the creator-owned canonical election record
- `users/{creatorId}/elections/{electionId}/candidates/{candidateId}` for candidate tallies
- `users/{creatorId}/elections/{electionId}/voters/{voterUid}` for voter records
- `users/{creatorId}/elections/{electionId}/auditLog/{voterUid}` for vote audit entries

## Vote Integrity

- Vote submission uses `runTransaction` on the public election mirror
- The invite token is validated and consumed atomically
- The candidate vote count is incremented in the creator-owned canonical election
- A voter document and audit document are written in the same logical transaction path
- Reuse is blocked because the invite document is marked `used` with `usedBy` and `usedAt`

## Notes

- Production should be redeployed from the current source before any public release
- The repository retains legacy backend code, but the production vote path is Firebase-only
