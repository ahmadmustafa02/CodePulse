# C4 Level 2 - Containers

**Status:** Finalized  
**Scope:** Deployable/runtime containers. Matches ADR 001 (API enqueue-only + separate BullMQ worker), ADR 002 (`ReviewJob` uniqueness in Postgres). Trace Viewer is a **web** feature calling the API.  
**Note:** Standard Mermaid `flowchart` (GitHub-native), not `C4Container`. Verified with `mmdc`.

```mermaid
flowchart TB
  developer["Developer / reviewer"]

  subgraph externals["External systems"]
    direction LR
    github["GitHub"]
    groq["Groq API"]
    resend["Resend"]
  end

  subgraph cp["CodePulse"]
    direction TB
    web["Web dashboard<br/>TanStack Start / React - Vercel<br/>Jobs, Trace Viewer, stats, OAuth UI"]
    api["API<br/>Express - Azure App Service<br/>HMAC webhooks, enqueue, session APIs,<br/>GET /jobs/:id/trace"]
    worker["Review worker<br/>BullMQ consumer - Azure App Service<br/>fetch_diff -> analyze -> comment -> persist<br/>-> optional refactor_prs"]
    postgres[("Postgres - Neon<br/>Organization, Repository, ReviewJob,<br/>TraceEvent, reviews, RefactorAttempt")]
    redis[("Redis - BullMQ broker<br/>Queue: codepulse-review<br/>attempts=3, exponential backoff")]
  end

  developer -->|HTTPS| web
  web -->|/api/v1 rewrite to Azure| api

  github -->|POST /webhooks/github| api
  api -->|OAuth / installation linking| github
  api -->|Enqueue producer| redis
  api --> postgres
  api -->|Weekly digest send| resend

  redis -->|Consume concurrency=2| worker
  worker --> postgres
  worker -->|Fetch diffs, comments, refactor PRs| github
  worker -->|Triage + chunk analysis| groq
```

## Queue relationship (explicit)

```mermaid
flowchart LR
  WH["Webhook HMAC + process"] --> RJ[("ReviewJob<br/>status=queued")]
  RJ --> ENQ["BullMQ add<br/>jobId = ReviewJob.id"]
  ENQ --> Q[("codepulse-review")]
  Q --> CON["Worker consume<br/>concurrency=2"]
  CON --> PIPE["reviewPipelineService"]
```

## Notes

- **Trace Viewer** is in the **web** container; data from `GET /jobs` and `GET /jobs/:id/trace` (alias `/traces`).
- **Local Redis:** host port **6380**; production via `REDIS_URL`.
- **Two App Services:** `thecodepulse` (API) and `thecodepulse-worker` (`npm run worker`) - ADR 001.
- **Resend** is used by the API for scheduled digests (not on the webhook->review hot path).
- **Dead jobs:** no separate DLQ container - terminal state is Postgres `ReviewJob.status=dead` on the same BullMQ queue (see sequence doc).
