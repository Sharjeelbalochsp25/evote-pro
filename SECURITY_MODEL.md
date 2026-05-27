# Security Model

## Firestore Collections

- `publicElections/{publicCode}` - public mirror used by the public vote page
- `publicElections/{publicCode}/invites/{inviteToken}` - single-use invite token state
- `users/{creatorId}/elections/{electionId}` - creator-owned canonical election record
- `users/{creatorId}/elections/{electionId}/candidates/{candidateId}` - candidate tallies
- `users/{creatorId}/elections/{electionId}/voters/{voterUid}` - voter record for each accepted ballot
- `users/{creatorId}/elections/{electionId}/auditLog/{voterUid}` - immutable audit entry keyed by voter UID

## Voter Identity Model

- Public voters sign in anonymously with Firebase Auth
- The anonymous Firebase Auth UID is the identity used for the vote transaction
- The invite token is the eligibility credential, not the identity credential

## Invite Lifecycle

1. Creator generates invite tokens for a specific election
2. Public voter enters the token and the client validates it against the public election mirror
3. The transaction marks the invite as used and sets `usedBy` to the anonymous UID
4. Any later attempt to reuse the token is rejected

## Audit Lifecycle

- Each successful vote writes an audit record in the same logical submission path
- Audit data includes the invite token, candidate ID, public code, election ID, and voter hash
- Audit entries are keyed by voter UID to make duplicate submissions idempotent and easy to inspect

## Transaction Invariants

- A vote may only be counted if the invite exists and is unused
- Candidate tally updates must happen in the same transaction as invite consumption
- Voter and audit documents must be written with the same anonymous UID
- The transaction must not produce a counted vote without a redeemed invite

## Authorization Assumptions

- Public election reads are allowed by policy
- Vote writes require a signed-in Firebase Auth session and valid invite eligibility
- Creator writes remain owner-scoped
- Firestore rules are the final enforcement layer for invite redemption and duplicate prevention

## Duplicate-Vote Blocking

Duplicate voting is blocked by three layers:

1. Invite token becomes `used` after the first accepted vote
2. The transaction checks invite state before writing
3. The voter record and audit entry are keyed to the anonymous UID, which makes the accepted ballot path deterministic

## Residual Abuse Vectors

- Invite leakage outside the creator’s distribution channel
- Shared anonymous sessions on the same device if a user intentionally reuses browser state
- Quota exhaustion or listener pressure on very small Spark-tier projects
