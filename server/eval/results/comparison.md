# CodePulse model comparison

- Dataset: v2.0.0 (50 cases)
- Production prompt: evidence-based refined
- Fair harness: empty-intent tool recovery; 429 never scored as `analysis_failed`
- Run date: **2026-08-21** (same-day `--fresh` for both models)

## Locked production comparison

| Model | Precision | Recall | F1 | TP | FP | FN | Clean any-FP |
|---|---:|---:|---:|---:|---:|---:|---:|
| **openai/gpt-oss-20b (production)** | **56.5%** | 86.7% | **68.4%** | 26 | 20 | 4 | **40% (8/20)** |
| openai/gpt-oss-120b (comparison) | 48.2% | **90.0%** | 62.8% | 27 | 29 | 3 | 60% (12/20) |

**Lock:** `GROQ_MODEL = openai/gpt-oss-20b` — lower clean-FP (40% vs 60%) preferred over a 3-point recall edge, because reviewer trust in flagged findings matters more than marginal recall for a production review tool.

## Historical — drifted baseline prompt (pre-restore)

| Model | Precision | Recall | F1 | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| openai/gpt-oss-120b (baseline) | 31.5% | 93.3% | 47.1% | 28 | 61 | 2 |
| openai/gpt-oss-20b (baseline) | 50.0% | 76.7% | 60.5% | 23 | 23 | 7 |

## Notes

- Earlier “50% / 64.3% / 12–20 clean” 120b figures were not reproducible from a rate-limit–contaminated artifact; superseded by the 2026-08-21 fair run.
- A 40% clean-FP rate remains high; further prompt refinement is the main follow-on lever.
