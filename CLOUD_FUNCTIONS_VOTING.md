# Cloud Functions Voting Architecture

This document describes how secure voting is implemented with Firebase Cloud Functions, Firestore transactions, and strict Firestore rules.

## 1) Callable Function Entry Point

- Function name: `castVoteSecure`
- File: `backend/functions/voting.js`
- Exported in: `backend/index.js`
- Type: callable (`onCall`)

## 2) Secure Vote Casting Flow

1. Frontend validates basic input for UX.
2. Frontend calls `castVoteSecure` with `electionId`, `candidateId`, and `voter` payload.
3. Cloud Function validates auth and input.
4. Cloud Function uses one Firestore transaction:
   - reads election, candidate, voter documents
   - rejects closed elections
   - rejects invalid voter eligibility
   - rejects duplicate votes
   - increments candidate votes
   - writes voter record
   - writes audit log record
5. Function returns a structured response with `transactionId`.

## 3) Free-Tier Optimized Read/Write Strategy

- Transaction reads: 3 docs (`election`, `candidate`, `voter`)
- Transaction writes: 3 docs (`candidate`, `voter`, `auditLog`)
- No extra query scans during vote casting.
- No paid services used in vote logic.

## 4) Security Model

- Client is blocked from modifying:
  - `votes` values
  - `voters` collection writes
  - `auditLog` collection writes
- Trusted backend writes happen via Admin SDK inside Cloud Functions.
- Election owner can still manage election/candidate metadata.

## 5) Firestore Rules Summary

- `users/{uid}/elections/{electionId}/candidates`:
  - create allowed with `votes == 0`
  - update allowed only if `votes` remains unchanged
- `users/{uid}/elections/{electionId}/voters`:
  - read allowed for owner
  - create/update/delete denied for client
- `users/{uid}/elections/{electionId}/auditLog`:
  - read allowed for owner
  - create/update/delete denied for client

## 6) Frontend Integration Pattern

- `src/firebase.js` exports `functions` client.
- `src/context/ElectionContext.jsx` uses:
  - `httpsCallable(functions, 'castVoteSecure')`

## 7) Recommended Indexes

- File: `firestore.indexes.json`
- Included index:
  - collection group: `elections`
  - fields: `publicLink ASC`, `isActive ASC`
  - supports efficient public-link lookup for active elections

## 8) Deployment Commands

Free-tier-friendly (no functions deploy):

```bash
npm run deploy:firebase -- --project evotepro-7deff
```

Full backend deploy (requires Blaze for Cloud Functions build step):

```bash
npm run deploy:firebase:full -- --project evotepro-7deff
```

## 9) Testing Strategy

### Unit / logic tests (recommended)

- Test payload validation:
  - missing fields
  - underage voter
  - malformed identifier for election verification type
- Test transaction guards:
  - closed election rejects vote
  - duplicate voter rejects vote
  - unknown candidate rejects vote

### Integration tests (Firebase Emulator)

1. Seed one user/election/candidate.
2. Call `castVoteSecure` once: expect success and vote increment.
3. Call again with same identifier: expect duplicate rejection.
4. Set `isActive = false`, call again: expect closed-election rejection.

### Rule tests

- Assert client cannot directly:
  - increment candidate votes
  - write voter doc
  - write audit doc

## 10) Scaling Tips on Free Plan

- Keep transaction document count minimal (already 3 reads, 3 writes).
- Prefer deterministic document paths over collection scans.
- Avoid broad listeners in high-volume collections.
- Paginate audit log reads if collection grows.
- Use short, selective queries and avoid unnecessary re-fetching.