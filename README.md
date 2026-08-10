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
2. The API verifies the HMAC signature and accepts the delivery.
3. The webhook processor skips duplicate heads (same repo + PR + SHA already processed successfully).
4. The PR diff is fetched and parsed.
5. `GroqAnalysisService.analyzeDiff()` runs optional file triage, then chunked deep analysis with structured tool calling and Zod validation.
6. Findings (category, severity, file, line, title, explanation, suggestion, code snippet) are posted as GitHub review comments and stored in PostgreSQL.
7. The dashboard surfaces installation-scoped analytics; opt-in weekly digests are emailed via Resend.

The production analysis prompt is the **first evidence-based refinement** (higher precision at 100% recall on the offline suite). A second experimental prompt was evaluated and **reverted**; it is not the production configuration.

---

## Architecture

```
GitHub PR event
        │
        ▼
GitHub webhook + HMAC-SHA256 verification
        │
        ▼
Webhook processor
  • action routing (review vs lifecycle-only)
  • PR-head idempotency (repo + PR + headSha)
        │
        ▼
Diff retrieval / parsing
        │
        ▼
Groq structured analysis
  (triage → chunked review → Zod-validated findings)
        │
        ├──────────────────────┐
        ▼                      ▼
GitHub review comments    PostgreSQL persistence
                               │
                               ▼
                     Dashboard / Digest APIs
                               │
                               ▼
                     Resend weekly email (opt-in)
```

Webhooks target the **Azure API host** directly. The **Vercel** frontend proxies `/api/v1/*` to the backend so session cookies remain same-origin.

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
- Organizations, repositories, pull requests, and issues are scoped to the GitHub App installation associated with the signed-in user.

---

## Evaluation

Offline benchmark under `server/eval/` (dataset + runner). Model used for reported results: **`openai/gpt-oss-120b`**.

| Dataset property | Value |
|---|---|
| Labeled TypeScript diffs | 20 |
| Known defects | 12 |
| Clean cases | 8 |

Reported **production** configuration = baseline + **first** evidence-based prompt refinement:

| Stage | Recall | Precision | F1 | FP findings |
|---|---:|---:|---:|---:|
| Baseline | 100% | 30.0% | 46.2% | 28 |
| Evidence-based prompt refinement | 100% | 46.2% | 63.2% | 14 |

On that refined configuration: **TP = 12**, **FN = 0**. False-positive findings fell from **28 → 14** while recall stayed at **100%**.

A second experimental prompt was tried and **reverted**; it is not the production system result and is not reported here as the final configuration.

**Limitation:** This is a small labeled/synthetic TypeScript suite. It is useful for regression and prompt iteration, not statistically conclusive evidence of large-scale production performance.

Reproduce (requires configured Groq API credentials):

```bash
cd server && npm run eval:offline
```

Generated reports `server/eval/results/latest.json` and `latest.md` are gitignored. See [`server/eval/README.md`](server/eval/README.md) for matching rules when the eval package is present.

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
npm run dev         # nodemon + ts-node
npm run build       # compile TypeScript
npm run start       # node dist/index.js
npm run typecheck
npm run lint
npm run eval:offline   # offline review benchmark

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
| API | Azure App Service |
| Database | Neon PostgreSQL |
| Weekly digest cron | GitHub Actions ([`weekly-digest.yml`](.github/workflows/weekly-digest.yml)) |

GitHub webhooks must point to the **API host**, not the Vercel frontend URL.

---

## Limitations & future work

- The offline evaluation set is small (20 labeled TypeScript diffs).
- The benchmark focuses on TypeScript and issue *detection*, not large-scale developer acceptance of suggested fixes.
- Broader real-world PR corpora, additional model comparisons, and fix-acceptance metrics are natural next research/engineering extensions.

These are scope boundaries for the current system, not blockers for the production review pipeline described above.

---

<div align="center">

**CodePulse** — structured AI review for GitHub, with persistence, security controls, and measurable evaluation.

[Live App](https://getcodepulse.vercel.app) · [Issues](https://github.com/ahmadmustafa02/CodePulse/issues) · [Repository](https://github.com/ahmadmustafa02/CodePulse)

</div>
