# ADR 001: Why BullMQ over in-process async

## Status
Accepted

## Context
CodePulse previously verified GitHub webhooks, returned `202`, then ran the full review pipeline (`fetch diff → Groq → comments → DB`) via `void webhookProcessor.process(...)` inside the API process. Failures were logged and dropped. There was no durable queue, retry/backoff, or dead-letter visibility.

## Decision
- Use **BullMQ + Redis** as the durable job queue.
- Keep the **API** as an enqueue-only HTTP process.
- Run a **separate worker process** (`npm run worker` → `src/worker.ts`) that consumes the queue.
- **Production hosting:** a **second Azure App Service** instance (same build artifact as the API, different startup command: `npm run worker`). Chosen over Container Apps / WebJobs to stay close to the existing Azure App Service deploy path (`.github/workflows/main_thecodepulse.yml`) with a sibling app for the worker.
- **Local Redis:** `docker compose up -d` publishes Redis on host port **6380** (LabCrew-consistent), `REDIS_URL=redis://127.0.0.1:6380`.

## Consequences
- API process stays responsive; AI work cannot block webhook ACKs beyond enqueue latency.
- Requires Redis in every environment and a second Azure App Service for the worker.
- Failed jobs retry with exponential backoff (3 attempts) then land in `dead` status, visible on `/jobs`.
