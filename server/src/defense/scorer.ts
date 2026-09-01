/** Nearest-centroid scorer: cosine similarity to malicious vs safe class means. */

import * as fs from 'fs';
import * as path from 'path';
import type { CentroidArtifact, InjectionOutcome } from './types';
import { EMBEDDING_MODEL, getBlockThreshold, getFlagThreshold } from './thresholds';

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) {
    return 0;
  }
  return dot / denom;
}

let cachedArtifact: CentroidArtifact | null = null;

function resolveCentroidsPath(): string {
  const candidates = [
    path.join(__dirname, 'artifacts', 'centroids.json'),
    path.join(process.cwd(), 'src', 'defense', 'artifacts', 'centroids.json'),
    path.join(process.cwd(), 'dist', 'defense', 'artifacts', 'centroids.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Missing centroids artifact (looked in ${candidates.join(', ')}). Run: npm run defense:build-classifier`,
  );
}

export function loadCentroids(): CentroidArtifact {
  if (cachedArtifact) {
    return cachedArtifact;
  }
  const filePath = resolveCentroidsPath();
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing centroids artifact at ${filePath}. Run: npm run defense:build-classifier`,
    );
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CentroidArtifact;
  if (parsed.version !== 1 || !parsed.centroids?.malicious || !parsed.centroids?.safe) {
    throw new Error(`Invalid centroids artifact at ${filePath}`);
  }
  cachedArtifact = parsed;
  return parsed;
}

/** Test helper: inject centroids without reading disk. */
export function setCentroidsForTests(artifact: CentroidArtifact | null): void {
  cachedArtifact = artifact;
}

export type ScoreResult = {
  scoreMalicious: number;
  scoreSafe: number;
  outcome: InjectionOutcome;
  model: string;
};

export function scoreEmbedding(embedding: number[]): ScoreResult {
  const artifact = loadCentroids();
  const scoreMalicious = cosineSimilarity(embedding, artifact.centroids.malicious);
  const scoreSafe = cosineSimilarity(embedding, artifact.centroids.safe);

  const blockThreshold = getBlockThreshold();
  const flagThreshold = getFlagThreshold();

  let outcome: InjectionOutcome = 'allow';
  if (scoreMalicious >= blockThreshold) {
    outcome = 'block';
  } else if (scoreMalicious >= flagThreshold) {
    outcome = 'flag';
  }

  return {
    scoreMalicious,
    scoreSafe,
    outcome,
    model: artifact.model || EMBEDDING_MODEL,
  };
}

export function outcomeRank(outcome: InjectionOutcome): number {
  if (outcome === 'block') return 2;
  if (outcome === 'flag') return 1;
  return 0;
}

export function maxOutcome(a: InjectionOutcome, b: InjectionOutcome): InjectionOutcome {
  return outcomeRank(a) >= outcomeRank(b) ? a : b;
}
