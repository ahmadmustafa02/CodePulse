/** Orchestrates chunking, scoring, and optional persistence for untrusted PR content. */

import { env } from '../config/env';
import { prisma } from '../services/prismaService';
import logger from '../utils/logger';
import { embedTexts } from './embedder';
import { maxOutcome, scoreEmbedding } from './scorer';
import { EMBEDDING_CHUNK_CHARS, EMBEDDING_MODEL } from './thresholds';
import type {
  ChunkScore,
  InjectionChunkSource,
  InjectionGateResult,
  InjectionOutcome,
  ScanUntrustedContentInput,
} from './types';

function chunkText(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += maxChars) {
    chunks.push(trimmed.slice(i, i + maxChars));
  }
  return chunks;
}

function buildScanUnits(input: ScanUntrustedContentInput): Array<{
  source: InjectionChunkSource;
  text: string;
}> {
  const units: Array<{ source: InjectionChunkSource; text: string }> = [];

  const titleBody = [`Title: ${input.title || ''}`, `Body: ${input.body || ''}`].join('\n');
  for (const chunk of chunkText(titleBody, EMBEDDING_CHUNK_CHARS)) {
    units.push({ source: 'pr_title_body', text: chunk });
  }

  const filenames = input.filenames.filter(Boolean).join('\n');
  for (const chunk of chunkText(filenames, EMBEDDING_CHUNK_CHARS)) {
    units.push({ source: 'filenames', text: chunk });
  }

  for (const chunk of chunkText(input.formattedDiffPreview || '', EMBEDDING_CHUNK_CHARS)) {
    units.push({ source: 'formatted_diff', text: chunk });
  }

  return units;
}

async function persistDecision(params: {
  organizationId: string;
  reviewJobId: string;
  outcome: InjectionOutcome;
  scoreMalicious: number;
  scoreSafe: number;
  sources: ChunkScore[];
  model: string;
}): Promise<string> {
  const row = await prisma.injectionDecision.create({
    data: {
      organizationId: params.organizationId,
      reviewJobId: params.reviewJobId,
      outcome: params.outcome,
      scoreMalicious: params.scoreMalicious,
      scoreSafe: params.scoreSafe,
      sources: params.sources,
      model: params.model,
    },
  });
  return row.id;
}

export async function findDecisionForJob(reviewJobId: string): Promise<{
  outcome: InjectionOutcome;
  id: string;
} | null> {
  const row = await prisma.injectionDecision.findFirst({
    where: { reviewJobId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, outcome: true },
  });
  if (!row) {
    return null;
  }
  return { id: row.id, outcome: row.outcome as InjectionOutcome };
}

function isInstallationAllowed(installationId: number | undefined): boolean {
  const allowlist = env.INJECTION_DEFENSE_INSTALLATION_ALLOWLIST;
  if (allowlist.length === 0) {
    return true;
  }
  if (installationId === undefined) {
    return false;
  }
  return allowlist.includes(installationId);
}

/**
 * Scan untrusted PR content. When `INJECTION_DEFENSE_ENABLED` is false, returns
 * allow with `skipped: true` and does not call OpenAI or write to Postgres.
 * When an installation allowlist is set, non-listed installs also no-op (no OpenAI).
 */
export async function scanUntrustedContent(
  input: ScanUntrustedContentInput,
): Promise<InjectionGateResult> {
  if (!env.INJECTION_DEFENSE_ENABLED || !isInstallationAllowed(input.installationId)) {
    return {
      outcome: 'allow',
      scoreMalicious: 0,
      scoreSafe: 0,
      sources: [],
      model: EMBEDDING_MODEL,
      skipped: true,
    };
  }

  const units = buildScanUnits(input);
  if (units.length === 0) {
    const empty: InjectionGateResult = {
      outcome: 'allow',
      scoreMalicious: 0,
      scoreSafe: 1,
      sources: [],
      model: EMBEDDING_MODEL,
      skipped: false,
    };
    empty.decisionId = await persistDecision({
      organizationId: input.organizationId,
      reviewJobId: input.jobId,
      outcome: empty.outcome,
      scoreMalicious: empty.scoreMalicious,
      scoreSafe: empty.scoreSafe,
      sources: empty.sources,
      model: empty.model,
    });
    return empty;
  }

  const embeddings = await embedTexts(units.map((u) => u.text));
  const sources: ChunkScore[] = embeddings.map((embedding, index) => {
    const scored = scoreEmbedding(embedding);
    return {
      source: units[index].source,
      chunkIndex: index,
      scoreMalicious: scored.scoreMalicious,
      scoreSafe: scored.scoreSafe,
      outcome: scored.outcome,
    };
  });

  let outcome: InjectionOutcome = 'allow';
  let scoreMalicious = 0;
  let scoreSafe = 0;
  for (const chunk of sources) {
    outcome = maxOutcome(outcome, chunk.outcome);
    if (chunk.scoreMalicious >= scoreMalicious) {
      scoreMalicious = chunk.scoreMalicious;
      scoreSafe = chunk.scoreSafe;
    }
  }

  const model = EMBEDDING_MODEL;
  const decisionId = await persistDecision({
    organizationId: input.organizationId,
    reviewJobId: input.jobId,
    outcome,
    scoreMalicious,
    scoreSafe,
    sources,
    model,
  });

  logger.info('Injection defense scan complete', {
    jobId: input.jobId,
    outcome,
    scoreMalicious,
    scoreSafe,
    chunkCount: sources.length,
    decisionId,
  });

  return {
    outcome,
    scoreMalicious,
    scoreSafe,
    sources,
    model,
    skipped: false,
    decisionId,
  };
}
