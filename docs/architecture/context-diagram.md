# C4 Level 1 - System context

**Status:** Finalized  
**Scope:** CodePulse as one system and its external actors. Matches ADR 003 (tenant = GitHub installation) and ADR 005 (Groq for analysis).  
**Note:** Drawn as a standard Mermaid `flowchart` (GitHub-native). Semantic C4 L1 layout; avoids `C4Context` which does not render on GitHub.

```mermaid
flowchart TB
  developer["Developer / reviewer<br/>Opens PRs, uses dashboard & Trace Viewer"]

  subgraph boundary["CodePulse system boundary"]
    codepulse["CodePulse<br/>Durable PR review jobs, Groq analysis,<br/>optional gated refactor PRs, Trace Viewer"]
  end

  github["GitHub<br/>App webhooks, diffs, comments,<br/>OAuth, optional refactor branches"]
  groq["Groq API<br/>Triage + chunked analysis<br/>production: openai/gpt-oss-20b"]
  resend["Resend<br/>Weekly digest emails"]

  developer -->|Opens / reviews PRs| github
  developer -->|HTTPS session cookie| codepulse
  github -->|HMAC-signed pull_request webhooks| codepulse
  codepulse -->|Fetch diffs, post comments, refactor PRs| github
  codepulse -->|Analyze prioritized chunks| groq
  codepulse -->|Send digests| resend
```

## Notes

- **Boundary:** Web (Vercel), API + worker (Azure), Neon, and Redis are one product at L1; see [container-diagram.md](./container-diagram.md).
- **Tenant model:** GitHub App installation -> `Organization`; dashboard and `/jobs/:id/trace` are installation-scoped (ADR 003).
- **Resend** is a real external dependency for weekly digests (same footing as other outbound mail providers in sibling projects).
