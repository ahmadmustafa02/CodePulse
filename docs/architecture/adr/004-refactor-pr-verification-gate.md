# ADR 004: Refactor-PR verification gate (Docker sandbox)

## Status
Accepted

## Context
CodePulse may optionally open a *separate* PR that applies an LLM-generated maintainability fix. Generated code must not run with worker credentials, reach the cloud instance metadata service, or push to GitHub before typecheck/tests/build succeed.

## Decision
- Verification runs in an **ephemeral Docker container** per attempt (`refactorSandboxService`), not a temp directory on the worker host.
- Container receives **no worker secrets** (`DATABASE_URL`, `REDIS_URL`, `GROQ_API_KEY`, GitHub private key, OAuth/auth secrets, etc.).
- Network: dedicated bridge `codepulse-sandbox`; **cloud metadata is explicitly denied**:
  - Host `iptables`/`ip6tables` `DOCKER-USER` DROP for `169.254.0.0/16` and `fd00:ec2::/32` when available (required on Linux production workers).
  - In-container probe fails the gate (exit 99) if `http://169.254.169.254/` (or IPv6 IMDS) responds.
  - Metadata hostnames blackholed in `/etc/hosts`.
  - Intended egress is package registry only (`registry.npmjs.org`); clone uses the worker *outside* the container.
- Resource caps: memory/CPU/pids + wall-clock timeout; container always removed.
- Sequence: apply patch → install → typecheck → test → build; any failure → TraceEvent + `RefactorAttempt` status `rejected-by-gate` / `failed` → **no PR**.
- Org feature flag `refactorPrEnabled` defaults **OFF**. Caps: one attempt per finding per `headSha`, plus org per-PR and daily caps, enforced **before** Groq and **before** sandbox start.
- Eligible categories (v1): `code-quality`, `best-practices` only.

## Consequences
- Requires Docker on the worker host.
- Docker Desktop without iptables cannot fully enforce host-level IMDS DROP; production workers must be Linux with `DOCKER-USER` rules. The in-container probe still fails closed if metadata is reachable.
- **Phase 4 is not production-closed until** `thecodepulse-worker` (Linux) logs `Sandbox IMDS host DROP active` at boot, or `npm run test:imds-host` exits 0 on that host. Local Desktop runs are probe/blackhole only.
- **Verify without SSH (free):** after deploy, Azure Portal → App Service `thecodepulse-worker` → **Monitoring → Log stream**, or Kudu at `https://thecodepulse-worker.scm.azurewebsites.net` (Debug Console). Look for `Sandbox IMDS host DROP active (DOCKER-USER)`.
- Refactor PRs are never opened against the original head branch; they use a `codepulse/refactor-*` branch and link back to the source finding.
