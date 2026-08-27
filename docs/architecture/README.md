# CodePulse architecture

**Status:** Finalized (C4 L1/L2 + webhook->review sequence diagrams included, 2026-08-27). Diagrams use GitHub-native Mermaid `flowchart` / `sequenceDiagram` (verified with `@mermaid-js/mermaid-cli`). They reflect the **shipped** post-Phase 1-5 state; ADRs 001-005 remain the decision record. If a diagram and an ADR disagree, **code is source of truth**.

## Diagrams

| Doc | C4 / type | Contents |
|---|---|---|
| [context-diagram.md](./context-diagram.md) | C4 Level 1 | System boundary vs GitHub, developer, Groq, Resend |
| [container-diagram.md](./container-diagram.md) | C4 Level 2 | Web, API, worker, Neon, Redis, Resend, queue |
| [sequence-webhook-to-review.md](./sequence-webhook-to-review.md) | Sequence | Review path, closed-PR lifecycle, retry/dead, refactor gate |

## ADRs

| ADR | Decision |
|---|---|
| [001](./adr/001-why-bullmq-over-sync.md) | BullMQ + separate worker (not in-process async) |
| [002](./adr/002-headsha-idempotency.md) | `UNIQUE (repoId, prNumber, headSha)` on `ReviewJob` |
| [003](./adr/003-tenant-isolation-model.md) | Tenant = GitHub installation -> `organizationId` |
| [004](./adr/004-refactor-pr-verification-gate.md) | Docker sandbox gate; `refactorPrEnabled` default OFF |
| [005](./adr/005-why-groq-over-openai.md) | Production model `openai/gpt-oss-20b` |

## Related ops notes

- [phase4-sandbox-gate.md](./phase4-sandbox-gate.md) - IMDS DROP verification on Linux worker
- [neon-migration-process.md](./neon-migration-process.md) - never `db push` to shared Neon
