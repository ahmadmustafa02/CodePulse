<div align="center">

# ⚡ CodePulse

### AI code review that learns your team's mistakes — and helps them stop repeating them.

[![Live App](https://img.shields.io/badge/Live_App-getcodepulse.vercel.app-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://getcodepulse.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-CodePulse-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ahmadmustafa02/CodePulse)
[![License](https://img.shields.io/badge/License-MIT-3DA639?style=for-the-badge)](LICENSE)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-Llama_3.3_70B-F55036?style=flat-square)
![Azure](https://img.shields.io/badge/Azure-0078D4?style=flat-square&logo=microsoftazure&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

</div>

---

<img width="1346" height="832" alt="codepulse2" src="https://github.com/user-attachments/assets/90b10f63-399c-4855-a402-863a86b9f4c4" />
<img width="1474" height="896" alt="codepulsedashboard" src="https://github.com/user-attachments/assets/15b137d5-b2fe-43bb-80ae-049112fd7492" />
<img width="1357" height="882" alt="digest" src="https://github.com/user-attachments/assets/3658ee11-fc66-463c-9dee-d247a321ce85" />

---

## 🎯 The pitch

> **CodeRabbit reviews your PR. CodePulse reviews your habits.**

Install once on GitHub, pick your repos, and open a pull request. CodePulse reviews the diff inline like a senior engineer would — pinned to exact lines, with severity labels — then stores every finding against the developer who wrote it.

Each **Sunday**, developers who opt in receive a personalized email digest summarizing their recurring issue categories from the past week.

<div align="center">

**[→ Try the live app](https://getcodepulse.vercel.app)**

</div>

---

## ✨ What it does

| | |
|---|---|
| 🤖 **Automatic PR reviews** | Triggered on `opened`, `synchronize`, and `reopened`. Inline comments on exact lines with **Critical / High / Medium / Low** severity. |
| 🧠 **Two-pass AI analysis** | File triage first, then chunked deep review. Groq + Llama 3.3 70B with structured tool-calling returns typed JSON per issue. |
| 📊 **Per-developer issue tracking** | Every finding is stored per developer, repo, and PR in Neon — powers dashboard charts and digests. |
| 📬 **Weekly digest emails** | Opt-in via the dashboard. Aggregated by category, sent through Resend. Triggered by GitHub Actions every **Sunday 09:00 UTC**. |
| 📈 **Team dashboard** | Org-wide metrics: open PRs, critical findings, PR volume vs reviews (all connected repos combined). |
| 📂 **Per-repository view** | Severity over time, health score, PR list, and top files — **one repo at a time** with a repo selector when multiple are connected. |
| 🔒 **Multi-tenant isolation** | Scoped per GitHub App installation — each org's data is fully isolated. |
| 🛡️ **Signed webhooks** | HMAC-SHA256 verification on every event. Lockfiles, minified assets, and generated files are skipped automatically. |

---

## 🏗️ Architecture

```
                       ┌──────────────────────────────┐
                       │      GitHub PR opened        │
                       └──────────────┬───────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │  Webhook (HMAC-SHA256 ✓)     │
                       └──────────────┬───────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │  Express · Fetch diff          │
                       │  Parse unified diff format     │
                       └──────────────┬───────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │  Groq · Llama 3.3 70B          │
                       │  Structured tool-calling       │
                       │  → typed JSON per issue        │
                       └──────────────┬───────────────┘
                                      │
                  ┌───────────────────┴───────────────────┐
                  ▼                                       ▼
   ┌──────────────────────────┐          ┌──────────────────────────┐
   │  GitHub REST API         │          │  PostgreSQL (Neon)       │
   │  Inline review comments  │          │  Org · repo · dev · PR   │
   └──────────────────────────┘          └──────────────┬───────────┘
                                                        │
                                                        ▼
                                         ┌──────────────────────────┐
                                         │  GitHub Actions (Sunday) │
                                         │  POST /digest/trigger    │
                                         └──────────────┬───────────┘
                                                        │
                                                        ▼
                                         ┌──────────────────────────┐
                                         │  Aggregate issues (7d)   │
                                         │  → HTML email (Resend)   │
                                         │  (opt-in users only)     │
                                         └──────────────────────────┘
```

Webhooks hit the **API on Azure** directly. The **Vercel** frontend proxies `/api/v1/*` to the backend so session cookies stay same-origin.

---

## 🛠️ Tech stack

<table>
<tr>
<td valign="top" width="33%">

**Backend**
- Node.js · Express · TypeScript
- Prisma ORM
- PostgreSQL (Neon serverless)
- Groq API (Llama 3.3 70B)
- Octokit
- Resend
- Azure App Service

</td>
<td valign="top" width="33%">

**Frontend**
- React · TanStack Router · TypeScript
- Tailwind CSS
- Recharts
- Vercel

</td>
<td valign="top" width="33%">

**Infrastructure**
- GitHub App (webhook + bot)
- GitHub OAuth (sign-in + `user:email`)
- GitHub Actions (weekly digest cron)
- HMAC-SHA256 webhook verify

</td>
</tr>
</table>

---

## 📊 Dashboard vs repository views

| View | Scope |
|------|--------|
| **Dashboard** (`/dashboard`) | All repos under your GitHub App installation — combined stats and charts |
| **Repositories** (`/repos/{owner}/{repo}`) | Single repo only — use the **Repository** dropdown to switch between connected repos |
| **Developers** | Per-developer issue trends across all repos (28-day window) |
| **Weekly digest** (`/digest`) | Email preview + **Get weekly email** opt-in toggle |

---

## 🚀 Getting started

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** — [Neon](https://neon.tech) free tier works great
- **GitHub App + OAuth App** — [setup docs](https://docs.github.com/en/apps/creating-github-apps)
- **Groq API key** — [console.groq.com](https://console.groq.com)
- **Resend API key** — [resend.com](https://resend.com) (for weekly digests)

### 1 · Clone & install

```bash
git clone https://github.com/ahmadmustafa02/CodePulse
cd CodePulse

cd server && npm install
cd ../web && npm install
```

### 2 · Configure the server

```bash
cd server
cp .env.example .env
# Fill in your values (see env vars table below)
npx prisma migrate deploy
npm run dev
```

> API runs at `http://localhost:3001`

### 3 · Configure the web app

```bash
cd web
cp .env.example .env.local
npm run dev
```

> Dashboard runs at `http://localhost:8080`

### 4 · GitHub setup

|  | Local | Production |
|---|---|---|
| **OAuth callback** | `http://localhost:3001/api/v1/auth/github/callback` | `https://getcodepulse.vercel.app/api/v1/auth/github/callback` (via Vercel proxy) or your API host |
| **Webhook URL** | ngrok → `/api/v1/webhooks/github` | `https://your-api-host/api/v1/webhooks/github` |
| **Webhook events** | Pull request | Pull request |

**Minimum GitHub App permissions**

| Permission | Access |
|---|---|
| Repository metadata | Read |
| Contents | Read |
| Pull requests | **Read & write** |

### 5 · Verify the PR review pipeline

1. Sign in with GitHub at `http://localhost:8080`
2. Install the GitHub App on a test repository
3. Confirm repos appear under **Connected repositories** on the dashboard
4. Open a PR with a real code change (not just lockfiles)
5. Watch for inline review comments within **1–3 minutes**
6. Refresh the dashboard — the PR appears under **Recent reviews**

> 💡 **Debugging:** GitHub → App → Advanced → Recent Deliveries — confirm `202` responses.

### 6 · Weekly digest (production)

1. Set server env: `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, `DIGEST_CRON_SECRET`
2. Add GitHub repo secrets:
   - `CODEPULSE_API_URL` — Azure API base URL, no trailing slash (e.g. `https://thecodepulse.azurewebsites.net`)
   - `DIGEST_CRON_SECRET` — same value as server
3. Workflow [`.github/workflows/weekly-digest.yml`](.github/workflows/weekly-digest.yml) runs **Sundays 09:00 UTC** (manual trigger available)
4. Users enable email on **Weekly digest** page (`/digest`) — must be signed in so CodePulse has their GitHub email

**Manual trigger (local or debug):**

```bash
curl -X POST https://your-api-host/api/v1/digest/trigger \
  -H "Content-Type: application/json" \
  -H "x-digest-secret: YOUR_DIGEST_CRON_SECRET" \
  -d "{}"
```

---

## 🔐 Environment variables

<details>
<summary><b>Server</b> · <code>server/.env</code></summary>

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon / PostgreSQL connection string |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | App private key (PEM, `\n` escaped) |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret (min 20 chars) |
| `GITHUB_OAUTH_CLIENT_ID` | OAuth App client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App client secret |
| `GITHUB_OAUTH_CALLBACK_URL` | Must match OAuth app settings exactly |
| `GROQ_API_KEY` | Groq API key |
| `AUTH_SECRET` | Session JWT signing secret (min 32 chars) |
| `WEB_APP_URL` | Frontend origin for CORS and redirects (`http://localhost:8080` locally) |
| `RESEND_API_KEY` | Resend API key |
| `DIGEST_FROM_EMAIL` | Sender address for digest emails |
| `DIGEST_CRON_SECRET` | Protects `POST /api/v1/digest/trigger` (min 20 chars) |

</details>

<details>
<summary><b>Web</b> · <code>web/.env.local</code></summary>

| Variable | Description |
|---|---|
| `VITE_API_URL` | API base URL locally (`http://localhost:3001/api/v1`). Leave unset in production — app uses same-origin `/api/v1` via Vercel rewrites. |

</details>

<details>
<summary><b>GitHub Actions</b> · repository secrets</summary>

| Secret | Description |
|---|---|
| `CODEPULSE_API_URL` | Production API host (no trailing slash) |
| `DIGEST_CRON_SECRET` | Same as server `DIGEST_CRON_SECRET` |

</details>

---

## 📜 Scripts

```bash
# ── Server ────────────────────────────────
npm run dev         # nodemon + ts-node
npm run build       # compile TypeScript
npm run start       # node dist/index.js
npm run lint
npm run typecheck

# ── Web ───────────────────────────────────
npm run dev         # Vite dev server (port 8080)
npm run build       # production build
npm run lint
```

---

## ☁️ Deployment

| Layer | Host |
|---|---|
| Frontend | **Vercel** |
| API | **Azure App Service** |
| Database | **Neon PostgreSQL** |
| Weekly digest cron | **GitHub Actions** ([`weekly-digest.yml`](.github/workflows/weekly-digest.yml)) |

> ⚠️ Webhooks must point to the **API host directly** — never the Vercel frontend URL.

---

<div align="center">

### Built for teams who want code review that compounds.

*Not another noisy bot.*

---

⭐ **If CodePulse is useful to you, star the repo — it helps a lot.**

[Live App](https://getcodepulse.vercel.app) · [Report a bug](https://github.com/ahmadmustafa02/CodePulse/issues) · [Request a feature](https://github.com/ahmadmustafa02/CodePulse/issues)

</div>
