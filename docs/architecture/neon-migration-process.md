# Neon schema changes — process (do not skip)

## What went wrong (2026-08-19)
`prisma db push` was run against the **shared Neon** database. Prisma warned it would drop tables not in the current schema (`AgentTrace`, `ProposedCodeFix`, `CustomIntervention`, `DeviceToken`, `RepositorySettings`, and `Repository.deploymentState`). Those tables were **not** in `main`’s Prisma schema — leftovers from the reverted hackathon / antigravity / Capacitor experiments (`AgentTrace` / `ProposedCodeFix` ≈ early trace + proposed-fix ideas later replaced by `TraceEvent` / `RefactorAttempt`).

**Superseded by current CodePulse models:** yes for AgentTrace → TraceEvent, ProposedCodeFix → RefactorAttempt (+ sandbox). Still: silent delete against production Neon is unacceptable process.

## Immediate recovery check (human — Neon Console)
Do this **before the history window expires** (Free ≈ 6 hours; Launch up to 7 days; Scale up to 30 — confirm under **Settings → Instant restore**):

1. Open the Neon project for `ep-cool-tree-aq8wfuy3`.
2. **Branches → Instant restore / Time Travel**: pick a timestamp **before** the accidental `db push` (~2026-08-19 ~06:44 UTC).
3. Prefer: create a **temporary branch** from that point (or use Time Travel Assist read-only queries) and verify row counts:
   - `SELECT COUNT(*) FROM "AgentTrace";`
   - `SELECT COUNT(*) FROM "ProposedCodeFix";`
   - same for `CustomIntervention`, `DeviceToken`, `RepositorySettings`
4. If counts are only old hackathon/sim data and nothing CodePulse production depends on → no restore needed; note that here.
5. If anything live was needed → Instant restore the root branch to that timestamp (Neon keeps a backup branch of the post-restore state) **or** copy rows from the time-travel branch into current.

## Outcome (2026-08-19)
Owner confirmed dropped tables were **old hackathon leftovers** and are **not needed**. No Instant restore performed. Process rule above still applies for all future Neon changes (CodePulse + LabCrew).

**Never** `prisma db push` against shared/prod Neon.

1. `npx prisma migrate dev --name <name> --create-only` (or author SQL under `prisma/migrations/`)
2. **Read the generated `.sql`** — reject unexpected DROP TABLE / DROP COLUMN
3. Apply with `npx prisma migrate deploy` (CI/prod) or `migrate dev` only on disposable local DBs
4. Commit the migration file; do not “fix drift” with push on a shared instance
