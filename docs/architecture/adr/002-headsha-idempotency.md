# ADR 002: Head SHA idempotency via Postgres unique constraint

## Status
Accepted

## Context
GitHub occasionally delivers near-duplicate webhook events for the same PR head. A check-then-insert in application code races: two concurrent requests can both pass an existence check before either inserts.

## Decision
- Persist every review attempt as a `ReviewJob` row.
- Enforce idempotency with a **hard Postgres unique constraint** on `(repoId, prNumber, headSha)`.
- Enqueue path: **insert first**; on unique violation (`P2002`), treat as idempotent success and **do not** enqueue again.
- Application-level “already processed” checks may remain as fast paths, but the **DB constraint is the source of truth**.

## Consequences
- Concurrent duplicate deliveries cannot create two active jobs for the same head.
- Re-processing the same head after a `dead` job requires an explicit future mechanism (manual retry / new row strategy); v1 keeps the unique key forever for that triple.
