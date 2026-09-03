/** Default thresholds and embedding model for injection defense. */

import { env } from '../config/env';

/** OpenAI embedding model used for both offline build and runtime scoring. */
export const EMBEDDING_MODEL = 'text-embedding-3-small' as const;

/** Max characters per embedding chunk (well under 8k-token model limit). */
export const EMBEDDING_CHUNK_CHARS = 6000;

/**
 * Malicious score threshold (Phase 1.5: P(malicious) from logistic; Phase 1 fallback: cosine to malicious centroid).
 * Defaults are conservative; override via env after dry-run / rebuild.
 */
export function getBlockThreshold(): number {
  return env.INJECTION_BLOCK_THRESHOLD;
}

export function getFlagThreshold(): number {
  return env.INJECTION_FLAG_THRESHOLD;
}
