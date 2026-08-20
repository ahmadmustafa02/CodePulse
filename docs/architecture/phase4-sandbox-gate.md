# Phase 4 gate — Refactor-PR verification sandbox

**Status:** implemented; **IMDS host DROP pending confirmation on Linux Azure worker** via Log stream / Kudu (no SSH): Portal → `thecodepulse-worker` → Monitoring → Log stream, or `https://thecodepulse-worker.scm.azurewebsites.net`.

## Goal

When CodePulse proposes a maintainability/refactor fix, **never open a GitHub PR** until the generated patch has been verified inside an isolated sandbox. Verification runs typecheck → tests → build. Any failure is logged/traced; nothing is pushed.

## Isolation mechanism (plain terms)

### One ephemeral Docker container per verification run
- Each candidate fix gets a **fresh container** created for that run only, then destroyed.
- The worker does **not** apply the patch in a temp folder on the worker host and run `npm install` / `npm test` there.
- The container image is a minimal Node/TypeScript toolchain image we control (pinned tag), not “whatever is on the worker VM.”

### What goes into the container
- A **copy of the target repo** at the relevant commit/head (fetched into a workspace the container mounts or that is copied in at start).
- The **generated patch** applied inside the container.
- Only the package manager cache / registry access needed to install dependencies.

### Network: deny-by-default, registry only, metadata blocked
- Container network policy: **no general egress**.
- Explicit allowlist for package registry hosts only (e.g. `registry.npmjs.org` and any mirror we document). No access to:
  - the public internet at large
  - GitHub (except optionally a pre-staged clone performed by the worker *outside* the verify container, then copied in)
  - Redis, Neon/Postgres, or any CodePulse API
- **Cloud metadata endpoints are explicitly blocked**, not merely omitted from an allowlist:
  - IPv4 link-local metadata: `169.254.169.254` (and the full `169.254.0.0/16` link-local range used by cloud IMDS)
  - Common aliases redirected to an unusable address: `metadata.google.internal`, `metadata.azure.com` (and equivalent hostnames)
  - IPv6 IMDS where applicable (e.g. AWS `fd00:ec2::254`)
- Rationale: registry-only egress is not enough — a container that can still reach the instance metadata service can steal cloud credentials / identity tokens even when “the internet” looks locked down. Blocking IMDS is a hard requirement of this gate.

### Secrets: none
- The verify container receives **no** worker environment variables.
- Specifically excluded: `DATABASE_URL`, `REDIS_URL`, `GROQ_API_KEY`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `AUTH_SECRET`, OAuth secrets, Resend keys, digest secrets.
- GitHub App credentials stay on the worker; the worker only opens a PR **after** the container exits 0.

### Timeouts and resource limits
- Hard **CPU / memory** caps on the container (cgroup limits via Docker `--memory` / `--cpus`).
- Hard **wall-clock timeout** (e.g. install + typecheck + test + build must finish within N minutes); on timeout the container is killed and the attempt is recorded as `rejected-by-gate`.
- Disk quota / working directory cleanup after every run (success or failure).

### Verification sequence (inside the container)
1. Apply patch  
2. Detect package scripts (TypeScript/Node v1 only)  
3. `typecheck`  
4. existing test suite  
5. `build`  
6. Exit non-zero on any step → worker logs + TraceEvent → **no PR**

### Rate limits (unchanged from approved plan)
- One attempt per finding per headSha  
- Org-level per-PR cap + daily cap  
- Org feature flag **default OFF**

## What this is not
- Not a temp directory on the worker process  
- Not trusting postinstall scripts on the host  
- Not giving the LLM-generated code access to production credentials  
- Not “registry allowlist alone” without an IMDS/metadata deny

## Implementation touchpoints
- `server/src/services/refactorSandboxService.ts` (docker run/exec/cleanup + metadata deny)
- `server/src/services/refactorPrService.ts` (Groq patch + gate + optional PR open)
- Org config flag + caps in DB  
- ADR `004-refactor-pr-verification-gate.md`
