# Injection defense dataset

Labeled examples for the offline centroid builder (`npm run defense:build-classifier`).

| File | Purpose |
|------|---------|
| `seed-malicious.jsonl` | Curated prompt-injection / jailbreak-style strings (public-style patterns) |
| `seed-safe.jsonl` | Benign PR titles, bodies, and diff snippets |
| `custom-malicious.jsonl` | Your additions (malicious) — start empty |
| `custom-safe.jsonl` | Your additions (safe) — start empty |

## Format

One JSON object per line:

```json
{"text":"...","label":"malicious"}
```

`label` must be `malicious` or `safe`.

## Rebuild

```bash
cd server
npm run defense:build-classifier
```

Commits `artifacts/centroids.json`. Do not commit raw embedding dumps.
