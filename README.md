<div align="center">

# ⚡ CodePulse

### AI-powered GitHub code review with structured findings, developer analytics, and empirical evaluation.

[![Live App](https://img.shields.io/badge/Live_App-getcodepulse.vercel.app-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://getcodepulse.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-CodePulse-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ahmadmustafa02/CodePulse)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-GPT--OSS--120B-F55036?style=flat-square)
![Azure](https://img.shields.io/badge/Azure-0078D4?style=flat-square&logo=microsoftazure&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

</div>

---

**CodePulse** is an end-to-end AI code-review system for GitHub pull requests. It verifies webhooks, analyzes diffs with structured LLM tool-calling, posts exact-line review comments, persists findings for analytics, and ships an offline evaluation harness for prompt/model regression checks. It is designed as a production-style research system—not a thin chatbot wrapper around a model API.

<div align="center">

**[→ Live app](https://getcodepulse.vercel.app)** · **[GitHub](https://github.com/ahmadmustafa02/CodePulse)**

</div>

---

<img width="1346" height="832" alt="CodePulse product overview" src="https://github.com/user-attachments/assets/90b10f63-399c-4855-a402-863a86b9f4c4" />
<img width="1474" height="896" alt="CodePulse dashboard" src="https://github.com/user-attachments/assets/15b137d5-b2fe-43bb-80ae-049112fd7492" />
<img width="1357" height="882" alt="CodePulse weekly digest" src="https://github.com/user-attachments/assets/3658ee11-fc66-463c-9dee-d247a321ce85" />

---

## Why CodePulse

| Capability | What it provides |
|---|---|
| Automated PR reviews | Reviews on `opened`, `synchronize`, and `reopened` |
| Structured LLM analysis | Two-pass triage + chunked review via `GroqAnalysisService.analyzeDiff()` |
| Exact-line GitHub comments | Inline findings with category, severity, explanation, and suggestion |
| Multi-tenant isolation | Data scoped to each GitHub App installation |
| Installation authorization | Users can link only installations they can access on GitHub |
| HMAC webhook verification | Every delivery verified with HMAC-SHA256 |
| PR-head idempotency | Same repository + PR + head SHA is not reviewed twice |
| Lifecycle tracking | Persists `open`, `closed`, and `merged` from GitHub payloads |
| Developer / repo analytics | Findings stored for dashboard charts and history |
| Weekly digest | Opt-in Resend email summarizing recent issue categories and file hotspots |
| Offline evaluation | Labeled TypeScript benchmark for prompt/model regression |
| Production deployment | Vercel frontend, Azure API, Neon PostgreSQL, GitHub Actions digest cron |

Analytics reflect historical findings per developer and repository. CodePulse does **not** fine-tune or retrain a model from team data.

---

## How it works

1. A GitHub App webhook delivers a pull-request event.
2. The API verifies the HMAC signature, inserts a `ReviewJob` (unique on repo + PR + head SHA), enqueues it on BullMQ/Redis, and returns **202 Accepted**.
3. A separate **worker** process consumes the queue: fetch/parse diff → Groq triage + chunked analysis → GitHub comments → Postgres.
4. Failed jobs retry with exponential backoff (3 attempts) then land in a dead-letter (`dead`) status, visible on the **Jobs** dashboard.
5. Each pipeline step emits a `TraceEvent` for later Trace Viewer work.
6. The dashboard surfaces installation-scoped analytics; opt-in weekly digests are emailed via Resend.

The production analysis prompt is the **first evidence-based refinement** (higher precision at 100% recall on the offline v1 suite). A second experimental prompt was evaluated and **reverted**; it is not the production configuration. See Evaluation for a v2 precision-gap diagnosis (prompt drift on `main` was found and restored).

---

## Architecture

```
GitHub PR event
        │
        ▼
GitHub webhook + HMAC-SHA256 verification
        │
        ▼
API (enqueue only)
  • action routing (review vs lifecycle-only)
  • ReviewJob insert + @@unique(repoId, prNumber, headSha)
  • BullMQ enqueue → 202 Accepted
        │
        ▼
Worker process (BullMQ consumer)
  • fetch/parse diff
  • Groq triage → chunked review → Zod-validated findings
  • GitHub review comments + PostgreSQL persistence
  • TraceEvent per step · retries → dead letter
        │
        ▼
Dashboard / Jobs / Digest APIs
        │
        ▼
Resend weekly email (opt-in)
```

Webhooks target the **Azure API host** directly. The **Vercel** frontend proxies `/api/v1/*` to the backend so session cookies remain same-origin.

**Processes:** API App Service (`thecodepulse`) + Worker App Service (`thecodepulse-worker`, startup `npm run worker`) + Redis + Neon Postgres.

### Optional refactor PRs (Phase 4, org flag OFF by default)
For maintainability findings (`code-quality`, `best-practices`) only, an org may opt in to a **second** verified PR:
1. Caps checked (one attempt per finding per `headSha`, per-PR + daily org caps) **before** any Groq patch call or sandbox start.
2. Patch verified in an **ephemeral Docker** container (no worker secrets; registry-oriented egress; **cloud metadata `169.254.169.254` / link-local IMDS explicitly blocked**).
3. On gate failure → TraceEvent + `RefactorAttempt` row; **no GitHub PR**.
4. On success → separate `codepulse/refactor-*` branch/PR with rationale linking the source finding.

See [`docs/architecture/adr/004-refactor-pr-verification-gate.md`](docs/architecture/adr/004-refactor-pr-verification-gate.md).

---

## Engineering & reliability

### Installation authorization
- Client-supplied `installation_id` values are not trusted alone.
- The installation must belong to this GitHub App.
- Personal installations must match the authenticated GitHub user.
- Organization installations require active org membership, verified with a short OAuth flow (`read:org`) and signed OAuth `state`.

### Webhook security & processing
- HMAC-SHA256 signature verification on every delivery.
- Review pipeline actions: `opened`, `synchronize`, `reopened`.
- `closed` (including merges) updates lifecycle state without running another AI review.
- Response code: **202 Accepted** after enqueue (or idempotent duplicate).
- Idempotency: Postgres `UNIQUE (repoId, prNumber, headSha)` on `ReviewJob` — not check-then-insert.
- Worker retries 3× with exponential backoff; permanent failures → `dead` (visible on `/jobs`).

### Local Redis (BullMQ)
```bash
docker compose up -d   # Redis on localhost:6380 (LabCrew-consistent)
```
Set `REDIS_URL=redis://127.0.0.1:6380` in `server/.env`.

Run API + worker:
```bash
cd server
npm run dev          # API :3001
npm run worker:dev   # BullMQ consumer
```

### Review idempotency
- Uses existing `PullRequest.headSha` as the success marker (written only after a successful review pipeline).
- Logical key: **repository + PR number + head SHA**.
- Duplicate delivery of an already processed SHA skips Groq, GitHub comments, and Issue inserts.
- A new head SHA triggers a new review.
- Failed runs do not mark the SHA as processed.

### PR lifecycle
- State is derived from the GitHub payload (`open` / `closed` / `merged` via `state`, `merged`, and `merged_at`).
- Lifecycle updates are persisted for dashboard accuracy.

### Digest email HTML safety
- Dynamic string values in digest HTML (`weekRange`, severity, category, file path) are escaped at the render boundary.
- Attacker- or LLM-influenced file names cannot break out of HTML elements in the generated email.
- This describes the implemented escaping for those interpolated strings—not a claim that every email path is broadly sanitized.

### Multi-tenant isolation
- **Tenant** = GitHub App installation → `Organization` (`organizationId`).
- **Enforcement** = `tenantRepository(organizationId)` — every dashboard/job query for repositories, PRs, issues, developers, review jobs, and traces must go through this wrapper. Empty `organizationId` throws.
- **Coverage:** `npm run test:isolation` seeds two installations and asserts A cannot read B’s rows for each tenant-scoped model.
- See [`docs/architecture/adr/003-tenant-isolation-model.md`](docs/architecture/adr/003-tenant-isolation-model.md).

### Multi-Tenancy & Data Isolation

| Concern | Detail |
|---|---|
| Tenant definition | GitHub App installation → Organization |
| Enforcement point | `server/src/services/tenantRepository.ts` |
| Scoped models | Repository, PullRequest, Issue, Developer, ReviewJob, TraceEvent |
| Test coverage | `npm run test:isolation` (2 seeded installations, cross-tenant null/empty assertions) |
| Acceptance fixtures | `npm run cleanup:acceptance` removes Phase 1 fake-install test rows |

---

## Evaluation

Offline benchmark under `server/eval/` (dataset + runner). Production analysis model: **`openai/gpt-oss-120b`**. Comparison runs use `EVAL_COMPARE_MODEL` (default `openai/gpt-oss-20b`).

### Dataset

| Property | v1 (historical) | v2 (current) |
|---|---|---|
| Labeled TypeScript diffs | 20 | **50** |
| Known defects (positive) | 12 | **30** |
| Clean cases | 8 | **20** |

### Historical results (v1 dataset, 20 cases) — kept for honest iteration

Reported **production** configuration on v1 = baseline + **first** evidence-based prompt refinement (model reported at the time: `openai/gpt-oss-120b`):

| Stage | Recall | Precision | F1 | FP findings |
|---|---:|---:|---:|---:|
| Baseline | 100% | 30.0% | 46.2% | 28 |
| Evidence-based prompt refinement | 100% | 46.2% | 63.2% | 14 |

On that refined configuration: **TP = 12**, **FN = 0**. False-positive findings fell from **28 → 14** while recall stayed at **100%**.

A second experimental prompt was tried and **reverted**; it is not the production system result.

### v2 precision gap — diagnosis (do not treat early v2 numbers as final)

Early v2 runs on 2026-08-19 showed production `openai/gpt-oss-120b` at **31.5% precision / F1 47.1**, below the README’s v1 refined claim (**46.2% / 63.2%**), while `openai/gpt-oss-20b` beat it on precision and F1. That needed an explanation before calling Phase 5 done.

**1. Prompt drift (real regression, now fixed):**  
`main` was still on the **May baseline** SYSTEM_PROMPT (`git blame` → `47df2e7`). The evidence-based refined prompt lived only on divergent commit `fab2cbf` and was **never an ancestor of HEAD**. README claimed refined-as-production; the code did not. Early v2 precision (**31.5%**) sits next to v1 **baseline** precision (**30.0%**), not refined (**46.2%**) — consistent with measuring the broad prompt. Refined prompt text is restored in `groqAnalysisService.ts`; re-run `eval:offline` / `eval:compare` before treating any v2 row as the production baseline.

**2. Why the smaller model looked better (plausibly real, not just noise):**  
v1 had **8** clean cases; v2 has **20**. More negatives are exactly where an eager FP-prone model loses precision. Under the drifted baseline prompt, 120b logged **61 FP** vs **30** positives (clean-case any-finding rate **55%**); 20b had **23 FP** and higher precision / F1 at the cost of recall. That shape matches a genuine “larger model over-flags under a loose prompt” finding — similar in spirit to the clustering artifact called out honestly in Paper 1 — not proof that 20b should replace production until the **same suite is re-run with the restored refined prompt**. If 20b still wins on precision/F1 after that, consider switching production or tightening further; do not decide on drifted-prompt numbers.

**3. Eval-methodology change (also real, not a bug):**  
v2 is larger and harder; aggregate P/F1 are **not** directly comparable to v1’s 46.2%. Report v1 and v2 separately; only compare models **within** the same suite + same prompt.

### v2 results after prompt restore (50 cases, refined prompt = production)

Re-run 2026-08-19 after restoring the evidence-based SYSTEM_PROMPT on `main`:

| Model | Precision | Recall | F1 | TP | FP | FN | Clean any-FP rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| openai/gpt-oss-120b (production) | 50.0% | **90.0%** | 64.3% | 27 | 27 | 3 | 60% (12/20) |
| openai/gpt-oss-20b | **66.7%** | 80.0% | **72.7%** | 24 | 12 | 6 | **20% (4/20)** |

FP findings for 120b dropped **61 → 27** vs the drifted-baseline run; precision **31.5% → 50.0%**. With the **same** refined prompt, **20b still wins on precision/F1** and clean-case FP rate — that part looks like a real model trade-off (recall vs precision), similar in honesty to the Paper 1 clustering note — not only an eval-size artifact. Caveat: 20b had more Groq `tool_use_failed` / parse errors that collapse to zero findings (helpful on cleans, harmful on positives as FN); treat the gap as directional, re-run before switching production.

**Product fork (not decided):** keep 120b for recall, switch to 20b for precision, or tighten the prompt further and re-measure both.

### v2 results under drifted baseline prompt (historical only)

Captured **before** prompt restore:

| Model | Precision | Recall | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| openai/gpt-oss-120b (baseline prompt) | 31.5% | 93.3% | 47.1% | 28 | 61 | 2 |
| openai/gpt-oss-20b (baseline prompt) | 50.0% | 76.7% | 60.5% | 23 | 23 | 7 |

Full tables: `server/eval/results/`. Re-run with `npm run eval:offline` / `npm run eval:compare`.

Reproduce dataset plumbing (no Groq):

```bash
cd server && npm run eval:smoke
```

Full offline LLM eval (requires configured Groq API credentials):

```bash
cd server && npm run eval:offline
cd server && npm run eval:compare
```

Generated reports under `server/eval/results/` (`latest.json`, `latest-<model>.md`, `comparison.md`) are gitignored except examples. See [`server/eval/README.md`](server/eval/README.md) for matching rules.

**Limitation:** Even at 50 cases this remains a focused TypeScript detection suite—useful for regression and prompt/model iteration, not statistically conclusive production proof.

### Database migrations (Neon)

Never `prisma db push` against shared/prod Neon. Generate reviewable SQL (`migrate dev --create-only` or hand-authored files), read for unexpected DROPs, then `migrate deploy`. See [`docs/architecture/neon-migration-process.md`](docs/architecture/neon-migration-process.md) — same rule for LabCrew.

---

## Tech stack

| Layer | Technologies |
|---|---|
| Backend | TypeScript, Node.js, Express, Prisma, PostgreSQL (Neon), Groq, Octokit, Resend |
| Frontend | TypeScript, React, TanStack Router, Tailwind CSS, Recharts |
| Platform | GitHub App, GitHub OAuth, GitHub Actions, Azure App Service, Vercel |

---

## Product views

| View | Scope |
|---|---|
| **Dashboard** (`/dashboard`) | Installation-wide stats, recent reviews, connected repositories |
| **Repositories** (`/repos/{owner}/{repo}`) | Single-repo health, severity trends, PR list |
| **Developers** | Per-developer issue trends (recent window) |
| **Weekly digest** (`/digest`) | Digest preview and email opt-in |

---

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL ([Neon](https://neon.tech) works well)
- GitHub App + OAuth App ([GitHub Apps docs](https://docs.github.com/en/apps/creating-github-apps))
- Groq API key ([console.groq.com](https://console.groq.com))
- Resend API key ([resend.com](https://resend.com)) for weekly digests

### 1. Clone & install

```bash
git clone https://github.com/ahmadmustafa02/CodePulse
cd CodePulse

cd server && npm install
cd ../web && npm install
```

### 2. Configure & run the server

```bash
cd server
cp .env.example .env
# Fill in values from the environment tables below
npx prisma migrate deploy
npm run dev
```

API: `http://localhost:3001`

### 3. Configure & run the web app

```bash
cd web
cp .env.example .env.local
npm run dev
```

Dashboard: `http://localhost:8080`

### 4. GitHub App / OAuth setup

| Setting | Local | Production |
|---|---|---|
| OAuth callback | `http://localhost:3001/api/v1/auth/github/callback` | `https://getcodepulse.vercel.app/api/v1/auth/github/callback` (Vercel proxy) or your API host |
| Webhook URL | ngrok → `/api/v1/webhooks/github` | `https://your-api-host/api/v1/webhooks/github` |
| Webhook events | Pull request | Pull request |

Minimum GitHub App permissions:

| Permission | Access |
|---|---|
| Repository metadata | Read |
| Contents | Read |
| Pull requests | Read & write |

Post-install callback (production example):  
`https://getcodepulse.vercel.app/api/v1/auth/installation/callback`

### 5. Verify PR review locally

1. Sign in at `http://localhost:8080`.
2. Install the GitHub App on a test repository.
3. Confirm repositories appear on the dashboard.
4. Open a PR with a real code change (not only lockfiles).
5. Expect inline review comments within a few minutes.
6. Refresh the dashboard — the PR should appear under recent reviews.

Debug deliveries: GitHub → App → Advanced → Recent Deliveries (look for accepted responses).

### 6. Weekly digest

1. Set server env: `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, `DIGEST_CRON_SECRET`.
2. Set repository secrets:
   - `CODEPULSE_API_URL` — Azure API base URL, no trailing slash
   - `DIGEST_CRON_SECRET` — same value as the server
3. Workflow [`.github/workflows/weekly-digest.yml`](.github/workflows/weekly-digest.yml) runs Sundays **09:00 UTC** (manual trigger available).
4. Users opt in on `/digest` after signing in (GitHub email required).

Manual trigger:

```bash
curl -X POST https://your-api-host/api/v1/digest/trigger \
  -H "Content-Type: application/json" \
  -H "x-digest-secret: YOUR_DIGEST_CRON_SECRET" \
  -d "{}"
```

### 7. Evaluation

```bash
cd server && npm run eval:offline
```

---

## Environment variables

<details>
<summary><b>Server</b> · <code>server/.env</code></summary>

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon / PostgreSQL connection string |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | App private key (PEM; `\n` escaped in `.env`) |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret (min 20 chars) |
| `GITHUB_OAUTH_CLIENT_ID` | OAuth App client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App client secret |
| `GITHUB_OAUTH_CALLBACK_URL` | Must match OAuth app callback exactly |
| `GROQ_API_KEY` | Groq API key |
| `REDIS_URL` | BullMQ Redis URL (local default `redis://127.0.0.1:6380`) |
| `AUTH_SECRET` | Session JWT signing secret (min 32 chars) |
| `WEB_APP_URL` | Frontend origin for CORS and redirects |
| `RESEND_API_KEY` | Resend API key |
| `DIGEST_FROM_EMAIL` | Sender address for digest emails |
| `DIGEST_CRON_SECRET` | Protects `POST /api/v1/digest/trigger` (min 20 chars) |

</details>

<details>
<summary><b>Web</b> · <code>web/.env.local</code></summary>

| Variable | Description |
|---|---|
| `VITE_API_URL` | Local API base (`http://localhost:3001/api/v1`). Leave unset in production; the app uses same-origin `/api/v1` via Vercel rewrites. |

</details>

<details>
<summary><b>GitHub Actions</b> · repository secrets</summary>

| Secret | Description |
|---|---|
| `CODEPULSE_API_URL` | Production API host (no trailing slash) |
| `DIGEST_CRON_SECRET` | Same as server `DIGEST_CRON_SECRET` |

</details>

---

## Scripts

```bash
# Server (from server/)
npm run dev         # nodemon + ts-node (API)
npm run worker:dev  # BullMQ worker
npm run worker      # production worker (dist/)
npm run build       # compile TypeScript
npm run start       # node dist/index.js
npm run typecheck
npm run lint
npm run eval:smoke     # dataset + diff parse (no Groq)
npm run eval:offline   # offline review benchmark
npm run eval:compare   # production model vs EVAL_COMPARE_MODEL

# Root
docker compose up -d   # Redis :6380

# Web (from web/)
npm run dev         # Vite (port 8080)
npm run build
npm run lint
```

---

## Deployment

| Layer | Host |
|---|---|
| Frontend | Vercel |
| API | Azure App Service (`thecodepulse`) |
| Worker | Azure App Service (`thecodepulse-worker`, startup `npm run worker`) |
| Queue | Redis (`REDIS_URL`) |
| Database | Neon PostgreSQL |
| Weekly digest cron | GitHub Actions ([`weekly-digest.yml`](.github/workflows/weekly-digest.yml)) |

See ADRs: [`docs/architecture/adr/001-why-bullmq-over-sync.md`](docs/architecture/adr/001-why-bullmq-over-sync.md), [`docs/architecture/adr/002-headsha-idempotency.md`](docs/architecture/adr/002-headsha-idempotency.md).

GitHub webhooks must point to the **API host**, not the Vercel frontend URL.

---

## Limitations & future work

- The offline evaluation set is **50** labeled TypeScript diffs (v2; was 20 in v1).
- The benchmark focuses on TypeScript and issue *detection*, not large-scale developer acceptance of suggested fixes.
- Broader real-world PR corpora, additional model comparisons, and fix-acceptance metrics are natural next research/engineering extensions.

These are scope boundaries for the current system, not blockers for the production review pipeline described above.

---

<div align="center">

**CodePulse** — structured AI review for GitHub, with persistence, security controls, and measurable evaluation.

[Live App](https://getcodepulse.vercel.app) · [Issues](https://github.com/ahmadmustafa02/CodePulse/issues) · [Repository](https://github.com/ahmadmustafa02/CodePulse)

</div>
