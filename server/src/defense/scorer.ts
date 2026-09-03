/**
 * Injection scorer: Phase 1.5 logistic regression on embeddings when
 * artifacts/logistic.json is present; otherwise nearest-centroid fallback.
 */

import * as fs from 'fs';
import * as path from 'path';
import { predictProbability } from './logistic';
import type { CentroidArtifact, InjectionOutcome, LogisticArtifact } from './types';
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

let cachedLogistic: LogisticArtifact | null | undefined;
let cachedCentroids: CentroidArtifact | null = null;

function candidatePaths(fileName: string): string[] {
  return [
    path.join(__dirname, 'artifacts', fileName),
    path.join(process.cwd(), 'src', 'defense', 'artifacts', fileName),
    path.join(process.cwd(), 'dist', 'defense', 'artifacts', fileName),
  ];
}

function resolveExisting(fileName: string): string | null {
  for (const candidate of candidatePaths(fileName)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function loadLogistic(): LogisticArtifact | null {
  if (cachedLogistic !== undefined) {
    return cachedLogistic;
  }
  const filePath = resolveExisting('logistic.json');
  if (!filePath) {
    cachedLogistic = null;
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as LogisticArtifact;
  if (
    parsed.version !== 1 ||
    parsed.kind !== 'logistic' ||
    !Array.isArray(parsed.weights) ||
    typeof parsed.bias !== 'number'
  ) {
    throw new Error(`Invalid logistic artifact at ${filePath}`);
  }
  cachedLogistic = parsed;
  return parsed;
}

export function loadCentroids(): CentroidArtifact {
  if (cachedCentroids) {
    return cachedCentroids;
  }
  const filePath = resolveExisting('centroids.json');
  if (!filePath) {
    throw new Error(
      `Missing centroids artifact (looked in ${candidatePaths('centroids.json').join(', ')}). Run: npm run defense:build-classifier`,
    );
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CentroidArtifact;
  if (parsed.version !== 1 || !parsed.centroids?.malicious || !parsed.centroids?.safe) {
    throw new Error(`Invalid centroids artifact at ${filePath}`);
  }
  cachedCentroids = parsed;
  return parsed;
}

/** Test helper: inject artifacts without reading disk. */
export function setArtifactsForTests(params: {
  logistic?: LogisticArtifact | null;
  centroids?: CentroidArtifact | null;
}): void {
  if ('logistic' in params) {
    cachedLogistic = params.logistic;
  }
  if ('centroids' in params) {
    cachedCentroids = params.centroids ?? null;
  }
}

/** @deprecated Prefer setArtifactsForTests — kept for older smoke helpers. */
export function setCentroidsForTests(artifact: CentroidArtifact | null): void {
  cachedCentroids = artifact;
  if (artifact === null) {
    cachedLogistic = null;
  }
}

export type ScoreResult = {
  scoreMalicious: number;
  scoreSafe: number;
  outcome: InjectionOutcome;
  model: string;
  classifier: 'logistic' | 'centroid';
};

function outcomeFromMaliciousScore(scoreMalicious: number): InjectionOutcome {
  const blockThreshold = getBlockThreshold();
  const flagThreshold = getFlagThreshold();
  if (scoreMalicious >= blockThreshold) {
    return 'block';
  }
  if (scoreMalicious >= flagThreshold) {
    return 'flag';
  }
  return 'allow';
}

export function scoreEmbedding(embedding: number[]): ScoreResult {
  const logistic = loadLogistic();
  if (logistic) {
    const scoreMalicious = predictProbability(embedding, {
      weights: logistic.weights,
      bias: logistic.bias,
    });
    return {
      scoreMalicious,
      scoreSafe: 1 - scoreMalicious,
      outcome: outcomeFromMaliciousScore(scoreMalicious),
      model: `${logistic.model}+logistic`,
      classifier: 'logistic',
    };
  }

  const artifact = loadCentroids();
  const scoreMalicious = cosineSimilarity(embedding, artifact.centroids.malicious);
  const scoreSafe = cosineSimilarity(embedding, artifact.centroids.safe);
  return {
    scoreMalicious,
    scoreSafe,
    outcome: outcomeFromMaliciousScore(scoreMalicious),
    model: artifact.model || EMBEDDING_MODEL,
    classifier: 'centroid',
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
