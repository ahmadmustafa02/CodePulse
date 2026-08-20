# CodePulse Offline Evaluation (v2)

Independent harness that reuses the production review core:

```ts
groqAnalysisService.analyzeDiff(parsedDiff, undefined, { model })
```

It does **not** call GitHub webhooks, post PR comments, or write to Prisma.

## Run

From `server/` (requires a full valid `.env`, including `GROQ_API_KEY`):

```bash
npm run eval:smoke      # dataset load + diff parse only (no Groq)
npm run eval:offline   # full LLM eval (resumes from checkpoint)
npm run eval:offline -- --model openai/gpt-oss-20b
npm run eval:offline -- --model openai/gpt-oss-20b --fresh   # ignore checkpoint
EVAL_MAX_COMPLETION_TOKENS=2048 npm run eval:offline         # eval-only token knobs (default 2048)
npm run eval:compare
```

### Checkpoint / free-tier resume
- After each scored case, results are written to `eval/results/checkpoint-<model>.json`.
- On restart, already-scored cases (`ok` / `analysis_failed`) are **skipped**.
- On Groq **rate limit**: exit immediately with code **3** and message **RESUME TOMORROW** — no long backoff. Re-run the same command after the daily TPD window recovers.
- Do **not** pay for Groq Dev tier for occasional evals; spread the suite across days.

`EVAL_MAX_COMPLETION_TOKENS` only affects the offline harness (not production `GROQ_MAX_COMPLETION_TOKENS`).


## Dataset

- Manifest: `dataset/cases.json`
- Unified diffs: `dataset/diffs/*.diff`
- **v2.0.0 size: 50 cases** (30 positive, 20 clean/negative) — expanded from v1’s 20

Positive gold labels include `file`, `line`, `lineTolerance`, `category`, optional `severityMin`, and `keywords`.

## Matching rules (deterministic)

For each case, predicted findings from `analyzeDiff` are matched 1:1 to expected findings.

### Analysis failures (tool parse / chunk errors)
`analyzeDiff` may soft-fail a chunk (Groq tool parse errors) and previously returned **empty issues with status ok**, which looked identical to “clean code.” That inflated clean-case scores and hid misses.

The harness now:
1. Surfaces `analysisIncomplete` from the analysis service when any chunk fails.
2. Marks the case `analysis_failed`.
3. Scores **all expected findings as FN** (findings-missed).
4. Does **not** count those cases as successful clean negatives.

Positive cases with silent empty results were already FN via matching; the fix makes failures explicit and stops cleans from looking like true negatives for the wrong reason.


1. **Primary gate:** same `file` **and** `|predicted.line - expected.line| <= lineTolerance`.
2. **Score** (higher wins):
   - `+100` if category matches
   - `+20` per keyword hit in `title + explanation + suggestion + codeSnippet` (case-insensitive substring)
   - `+(10 - lineDistance)` (clamped at 0)
   - `+10` if `severityMin` is set and predicted severity is at least that severe
3. Candidates sorted by score desc, then closer line, then expected id.
4. Greedy assignment: each predicted finding and each expected finding used at most once.
5. If `keywords` is non-empty, a pair is accepted only when **category matches OR at least one keyword hits** (reduces accidental nearby matches).
6. Unmatched predictions → **FP**. Unmatched expected → **FN**.
7. Clean/negative cases have `expected: []`; every prediction is an **FP**.

Finding-level metrics **do not invent TN**.

## Metrics

- TP / FP / FN
- Precision / Recall / F1
- **Per-category precision / recall / F1** (gold category for TP/FN; predicted category for FP)
- Category detection rate (`detected TP / expected` for that category)
- Clean-case FP finding count and case-level FP rate
- Average / total latency and tokens

## Layout

```text
eval/
  README.md
  runEval.ts
  compareModels.ts
  smoke.ts
  scripts/expandDataset.ts
  lib/
    loadDataset.ts
    diffToParsedDiff.ts
    matchFindings.ts
    metrics.ts
  dataset/
    cases.json
    diffs/
  results/
```

## Safety

This folder must not modify production prompts, tool schema, webhook handling, or comment posting. Diff→`ParsedDiff` mapping is duplicated here so `GitHubDiffService` stays untouched.
