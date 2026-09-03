# Classifier artifacts

Produced by:

```bash
cd server
npm run defense:build-classifier
```

Requires `OPENAI_API_KEY`. Writes:

- `centroids.json` — Phase 1 nearest-centroid fallback
- `logistic.json` — Phase 1.5 logistic regression weights (preferred at runtime)

Commit both after a successful build. Do not invent placeholder vectors.

Runtime scorer loads `logistic.json` when present; otherwise falls back to centroids.
