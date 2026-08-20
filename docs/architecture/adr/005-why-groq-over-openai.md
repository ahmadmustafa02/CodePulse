# ADR 005: Why Groq over OpenAI (production analysis)

## Status
Accepted

## Context
README and early docs referred to multiple candidate models. Production analysis must pin one provider/model for cost, latency, and eval reproducibility. Eval comparison remains possible via `EVAL_MODEL` / `eval:compare`.

## Decision
- Production deep analysis and triage use **Groq** with model constant `GROQ_MODEL = openai/gpt-oss-120b` in `server/src/config/constants.ts`.
- Offline eval may override with `--model` / `EVAL_MODEL` (e.g. `openai/gpt-oss-20b`) without changing production.
- Prompt configuration is the **evidence-based refined** SYSTEM_PROMPT in `groqAnalysisService.ts` (restored after drift from divergent commit `fab2cbf` that never landed on `main`).

## Consequences
- Provider lock-in to Groq availability and model catalog (several llama/gemma IDs were unavailable on the project key during Phase 5).
- Model/prompt changes require an offline eval run and README Evaluation update; do not treat eval numbers as final until prompt + model match production.
