# ADR 005: Why Groq over OpenAI (production analysis)

## Status
Accepted (model pin updated 2026-08-21)

## Context
README and early docs referred to multiple candidate models. Production analysis must pin one provider/model for cost, latency, and eval reproducibility. Eval comparison remains possible via `EVAL_MODEL` / `eval:compare`.

Fair same-day v2 suite (2026-08-21, 50 cases, fixed harness): `openai/gpt-oss-20b` beat `openai/gpt-oss-120b` on precision (56.5% vs 48.2%), F1 (68.4% vs 62.8%), and clean-case any-FP rate (40% vs 60%), while trailing slightly on recall (86.7% vs 90.0%).

## Decision
- Production deep analysis and triage use **Groq** with model constant `GROQ_MODEL = openai/gpt-oss-20b` in `server/src/config/constants.ts`.
- Offline eval may override with `--model` / `EVAL_MODEL` (e.g. `openai/gpt-oss-120b`) without changing production.
- Prompt configuration is the **evidence-based refined** SYSTEM_PROMPT in `groqAnalysisService.ts` (restored after drift from divergent commit `fab2cbf` that never landed on `main`).
- **Why 20b:** lower false-positive rate on clean code (40% vs 60%), accepting a ~3-point recall tradeoff, because reviewer trust in flagged findings matters more than marginal recall for a production review tool.

## Consequences
- Provider lock-in to Groq availability and model catalog.
- Model/prompt changes require an offline eval run and README Evaluation update; do not treat eval numbers as final until prompt + model match production.
- Clean-FP at 40% remains high; further prompt refinement is the main follow-on lever (not a model re-lock by default).
