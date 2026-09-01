# Classifier artifacts

`centroids.json` is produced by:

```bash
cd server
npm run defense:build-classifier
```

Requires a valid `OPENAI_API_KEY`. Commit the generated `centroids.json` after a successful build. Do not invent placeholder vectors — they are not compatible with OpenAI embedding space.

Injection defense defaults to **off** (`INJECTION_DEFENSE_ENABLED=false`), so production can ship without this file until you enable the gate.
