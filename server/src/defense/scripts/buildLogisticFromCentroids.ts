/**
 * Offline Phase 1.5 fallback: derive a linear/logistic separator from committed
 * centroids without calling OpenAI. Prefer `npm run defense:build-classifier`
 * when OPENAI_API_KEY works (fits on all labeled embeddings).
 *
 * Usage: npx ts-node src/defense/scripts/buildLogisticFromCentroids.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { l2Normalize } from '../logistic';
import type { CentroidArtifact, LogisticArtifact } from '../types';

const CENTROIDS_PATH = path.join(__dirname, '..', 'artifacts', 'centroids.json');
const LOGISTIC_PATH = path.join(__dirname, '..', 'artifacts', 'logistic.json');

function main(): void {
  const centroids = JSON.parse(fs.readFileSync(CENTROIDS_PATH, 'utf8')) as CentroidArtifact;
  if (!centroids.centroids?.malicious || !centroids.centroids?.safe) {
    throw new Error('centroids.json missing class means');
  }

  const m = l2Normalize(centroids.centroids.malicious);
  const s = l2Normalize(centroids.centroids.safe);
  const weights = m.map((v, i) => v - s[i]);
  const mid = m.map((v, i) => (v + s[i]) / 2);
  let bias = 0;
  for (let i = 0; i < weights.length; i += 1) {
    bias -= weights[i] * mid[i];
  }

  const artifact: LogisticArtifact = {
    version: 1,
    kind: 'logistic',
    model: centroids.model,
    dimensions: centroids.dimensions,
    builtAt: new Date().toISOString(),
    exampleCounts: centroids.exampleCounts,
    weights,
    bias,
    trainMetrics: {
      accuracy: 0,
      loss: 0,
    },
    recommendedThresholds: {
      // Probability space for sigmoid(w·x+b); conservative defaults.
      block: 0.75,
      flag: 0.45,
    },
  };

  fs.writeFileSync(LOGISTIC_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `Wrote ${LOGISTIC_PATH} (derived from centroids; re-run defense:build-classifier with a valid OPENAI_API_KEY for full fit)\n`,
  );
}

main();
