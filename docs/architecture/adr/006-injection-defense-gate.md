# ADR 006: Pre-Groq injection-defense gate

## Status
Accepted (2026-09-01)

## Context
PR title, body, filenames, and diffs are untrusted and are interpolated into Groq prompts. Prompt injection against the reviewer can waste quota, skew findings, or attempt instruction override. A prompt-only defense is insufficient as the primary control.

## Decision
- Add a dedicated module `server/src/defense/` that runs **after** `fetch_diff` and **before** `analyze_diff` as traced step `injection_scan`.
- Classify with OpenAI `text-embedding-3-small` and a nearest-centroid scorer (mean embedding per class + cosine similarity) built offline into `artifacts/centroids.json`.
- Outcomes: `allow` (continue), `flag` (continue + TraceEvent/InjectionDecision for observation), `block` (skip Groq, review comments, and refactor PRs; post a short security skip comment; mark job completed via the normal worker path).
- Feature flag `INJECTION_DEFENSE_ENABLED` defaults to **false** so production behavior is unchanged until a dry-run.
- Persist decisions in `InjectionDecision` for later analytics / Phase 2 eval harness.
- Eval harness (`server/src/eval-harness/`) is explicitly **out of scope** for this ADR’s implementation pass.

## Consequences
- New optional dependency on `OPENAI_API_KEY` when the flag is on.
- False-positive blocks skip useful reviews until thresholds are tuned or the PR text is rephrased.
- Centroid classifier is intentionally simple (Phase 1); a logistic regression on the same embeddings is a natural Phase 1.5 upgrade without schema/pipeline changes.
