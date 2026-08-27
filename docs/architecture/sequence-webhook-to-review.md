# Sequence - webhook to review (current pipeline)

**Status:** Finalized  
**Scope:** Shipped path after BullMQ + TraceEvent + Phase 4 refactor gate. Source of truth: `webhooks.ts`, `webhookProcessor`, `queue.ts`, `worker.ts`, `reviewPipelineService.ts`, ADR 001-004.

Constants: queue `codepulse-review`, `REVIEW_JOB_MAX_ATTEMPTS = 3`, backoff 5s exponential, worker concurrency 2. Org flag `refactorPrEnabled` defaults **OFF**.

## Happy path - review enqueue + ACK

```mermaid
sequenceDiagram
    autonumber
    actor GH as GitHub
    participant API as API Express
    participant DB as Postgres Neon
    participant Redis as Redis BullMQ
    participant W as Worker
    participant Groq as Groq
    actor Dev as Developer

    GH->>API: POST /api/v1/webhooks/github
    Note over GH,API: raw body + x-hub-signature-256
    alt HMAC invalid
        API-->>GH: 401 Unauthorized
    else HMAC valid
        API->>API: webhookProcessor.process
        Note over API,DB: opened synchronize reopened enqueue review
        alt Duplicate UNIQUE repoId prNumber headSha
            API->>DB: find existing ReviewJob
            opt status still queued
                API->>Redis: re-enqueue same jobId
            end
        else New head
            API->>DB: INSERT ReviewJob queued
            API->>Redis: enqueue codepulse-review
        end
        API-->>GH: 202 Accepted
        Redis->>W: deliver job
        W->>DB: markProcessing
        opt attempts greater than 1
            W->>DB: TraceEvent step retry
        end
        W->>GH: fetch_diff
        W->>DB: TraceEvent fetch_diff completed
        W->>Groq: analyze_diff triage and chunks
        W->>DB: TraceEvent analyze chunks
        W->>GH: comment_post
        W->>DB: TraceEvent comment_post
        W->>DB: persist review
        opt organization.refactorPrEnabled
            W->>W: refactor_prs gate
        end
        W->>DB: markCompleted
        Dev->>API: GET /jobs/:id/trace
        API->>DB: tenant-scoped TraceEvent list
        API-->>Dev: timeline likelyRootCause attempt
    end
```

## Closed / merged - lifecycle only (no review)

`pull_request` + `action=closed` updates stored PR lifecycle state and **never** enqueues AI review (`webhookProcessor`: “Closed/merged events update lifecycle state only”).

```mermaid
sequenceDiagram
    autonumber
    actor GH as GitHub
    participant API as API Express
    participant DB as Postgres Neon

    GH->>API: POST /webhooks/github action=closed
    Note over GH,API: HMAC verified first same as review path
    alt HMAC invalid
        API-->>GH: 401
    else HMAC valid
        API->>API: syncPullRequestLifecycleState
        API->>DB: update PR open/closed/merged state
        alt PR row not in database
            Note over DB: lifecycle sync skipped no insert
        else updated
            Note over DB: state only no ReviewJob enqueue
        end
        API-->>GH: 202 Accepted
    end
```

## Retry / failure / dead (intentional - no separate DLQ queue)

**Design choice (not a cut corner):** Product “dead letter” is Postgres `ReviewJob.status = dead` after the 3rd failed attempt. There is **no** separate BullMQ DLQ queue name. BullMQ retries on the same queue `codepulse-review` (`attempts: 3`, `removeOnFail: 200` retains failed Redis job records for ops). Terminal failure is visible on `/jobs` + Trace Viewer via the `dead` row.

```mermaid
sequenceDiagram
    autonumber
    participant Redis as Redis BullMQ
    participant W as Worker
    participant DB as Postgres

    Redis->>W: job attempt N
    W->>DB: markProcessing attempts=N
    opt N greater than 1
        W->>DB: TraceEvent retry
    end
    W->>W: pipeline step fails
    W->>DB: TraceEvent step failed
    alt N less than 3
        W->>DB: markFailed terminal false status=failed
        W-->>Redis: throw BullMQ retry backoff
    else N is 3
        W->>DB: markFailed terminal true status=dead
        W-->>Redis: throw removeOnFail retention
        Note over DB: Same queue no separate DLQ name
    end
    Note over W,DB: Completed steps skipped on retry via hasCompletedStep
```

## Phase 4 - refactor-PR verification gate (opt-in)

Runs only as pipeline step `refactor_prs` **after** `persist`, when `Organization.refactorPrEnabled` is true. Eligible findings: `code-quality`, `best-practices`. Caps enforced **before** Groq and **before** sandbox (ADR 004).

```mermaid
sequenceDiagram
    autonumber
    participant W as Worker
    participant DB as Postgres
    participant Groq as Groq
    participant Sandbox as Docker sandbox
    participant GH as GitHub

    W->>DB: load org and eligible findings
    alt flag off or caps hit
        W->>DB: TraceEvent refactor_prs no-op
    else attempt allowed
        W->>Groq: propose maintainability patch
        W->>Sandbox: apply install typecheck test build
        alt gate fails
            W->>DB: RefactorAttempt rejected-by-gate or failed
            Note over GH: No PR opened
        else gate passes
            W->>GH: push codepulse/refactor branch open PR
            W->>DB: RefactorAttempt recorded
        end
        W->>DB: TraceEvent refactor_prs completed
    end
```

## Cross-checks

| Claim in diagrams | Code / ADR |
|---|---|
| HMAC fail -> 401; success path -> 202 after process | `verifyGitHubSignature`, `webhooks.ts` |
| `closed` -> lifecycle only, no enqueue | `webhookProcessor` comment + early return |
| API does not run Groq synchronously | ADR 001 |
| Idempotency `UNIQUE(repoId, prNumber, headSha)` | ADR 002 |
| Terminal failure = `ReviewJob.status=dead`, same queue | `markFailed(terminal)`, `REVIEW_JOB_MAX_ATTEMPTS` - intentional |
| Refactor only after sandbox; flag default OFF | ADR 004 |
| Trace Viewer tenant-scoped | ADR 003, `GET /jobs/:id/trace` |
