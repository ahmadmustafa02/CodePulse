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

Install once on GitHub, pick your repos, and open a pull request. CodePulse reviews the diff inline like a senior engineer would — pinned to exact lines, with severity labels — then quietly remembers every issue against the developer who wrote it.

Every Sunday, each developer gets a personalized digest: *"You introduced 3 SQL injection patterns this week. Here's how to stop."*

The learning loop is the product. The PR review is just the input.

<div align="center">

**[→ Try the live app](https://getcodepulse.vercel.app)**

</div>

---

## ✨ What it does

| | |
|---|---|
| 🤖 **Automatic PR reviews** | Triggered on `opened`, `synchronize`, and `reopened`. Inline comments pinned to exact lines with **Critical / High / Medium / Low** severity labels. |
| 🧠 **Two-pass AI analysis** | File triage first, then chunked deep review. Groq + Llama 3.3 70B with structured tool-calling returns typed JSON per issue. |
| 📊 **Per-developer pattern tracking** | Every issue is stored against the developer who wrote it, across every PR, forever. The longer you use it, the sharper it gets. |
| 📬 **Weekly personalized digests** | Sunday emails surface recurring mistakes per developer with concrete fixes. Powered by Resend. |
| 📈 **Team dashboard** | PR volume, review latency, connected repos, severity trends, category breakdown, file-level hotspots. |
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
                       │  Express · Fetch diff        │
                       │  Parse unified diff format   │
                       └──────────────┬───────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │  Groq · Llama 3.3 70B        │
                       │  Structured tool-calling     │
                       │  → typed JSON per issue      │
                       └──────────────┬───────────────┘
                                      │
                  ┌───────────────────┴───────────────────┐
                  ▼                                       ▼
   ┌──────────────────────────┐          ┌──────────────────────────┐
   │  GitHub REST API         │          │  PostgreSQL (Neon)       │
   │  Inline review comments  │          │  Per dev · per repo · PR │
   └──────────────────────────┘          └──────────────┬───────────┘
                                                        │
                                                        ▼
                                         ┌──────────────────────────┐
                                         │ GitHub Actions (schedule)│
                                         │ Weekly trigger           │
                                         └─────────────┬────────────┘
                                                       │
                                                       ▼
                                         ┌──────────────────────────┐
                                         │ Digest API endpoint       │
                                         │ Aggregate → Build digest  │
                                         └─────────────┬────────────┘
                                                       │
                                                       ▼
                                         ┌──────────────────────────┐
                                         │ Email pipeline (Resend)  │
                                         │                          │
                                         └──────────────────────────┘
```

Webhooks hit the API on Azure directly. The Vercel frontend proxies `/api/v1/*` to the backend, keeping session cookies same-origin so sign-in works without third-party cookie headaches.

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
- React · TypeScript
- Tailwind CSS
- Recharts
- Vercel

</td>
<td valign="top" width="33%">

**Infrastructure**
- GitHub App (webhook + bot)
- GitHub OAuth (sign-in)
- Scheduled digest trigger via GitHub Actions
- HMAC-SHA256 signature verify

</td>
</tr>
</table>

---

## 🚀 Getting started

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** — [Neon](https://neon.tech) free tier works great
- **GitHub App + OAuth App** — [setup docs](https://docs.github.com/en/apps/creating-github-apps)
- **Groq API key** — [console.groq.com](https://console.groq.com)
- **Resend API key** — [resend.com](https://resend.com)

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

> Server runs at `http://localhost:3001`

### 3 · Configure the web app

```bash
cd web
cp .env.example .env.local
npm run dev
```

> Dashboard runs at `http://localhost:3000`

### 4 · GitHub setup

|  | Local | Production |
|---|---|---|
| **OAuth callback** | `http://localhost:3001/api/v1/auth/github/callback` | `https://your-api-host/api/v1/auth/github/callback` |
| **Webhook URL** | ngrok → `/api/v1/webhooks/github` | `https://your-api-host/api/v1/webhooks/github` |
| **Webhook events** | Pull request | Pull request |

**Minimum GitHub App permissions**

| Permission | Access |
|---|---|
| Repository metadata | Read |
| Contents | Read |
| Pull requests | **Read & write** |

### 5 · Verify the full pipeline

1. Sign in with GitHub at `localhost:3000`
2. Install the GitHub App on a test repository
3. Confirm the repo appears under **Connected Repositories**
4. Open a PR with a real code change (not just lockfiles)
5. Watch for inline review comments within **1–3 minutes**
6. Refresh the dashboard — the PR appears under **Recent Reviews**

> 💡 **Debugging tip:** Check **GitHub → App → Advanced → Recent Deliveries** for `202` responses to confirm webhooks are reaching the server.

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
| `WEB_APP_URL` | Frontend origin for CORS and redirects |
| `RESEND_API_KEY` | Resend API key |
| `DIGEST_FROM_EMAIL` | Sender address for digest emails |
| `DIGEST_CRON_SECRET` | Protects the digest trigger endpoint |

</details>

<details>
<summary><b>Web</b> · <code>web/.env.local</code></summary>

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Must match server `AUTH_SECRET` |
| `AUTH_GITHUB_ID` | OAuth App client ID |
| `AUTH_GITHUB_SECRET` | OAuth App client secret |
| `VITE` | API base URL (`http://localhost:3001/api/v1` locally) |

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
npm run dev         # react dev server
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
| Cron | **Github Actions** |

> ⚠️ Webhooks must point to the **API host directly** — never the Vercel frontend URL.

---

<div align="center">

### Built for teams who want code review that compounds.

*Not another noisy bot.*

---

⭐ **If CodePulse is useful to you, star the repo — it helps a lot.**

[Live App](https://getcodepulse.vercel.app) · [Report a bug](https://github.com/ahmadmustafa02/CodePulse/issues) · [Request a feature](https://github.com/ahmadmustafa02/CodePulse/issues)

</div>
