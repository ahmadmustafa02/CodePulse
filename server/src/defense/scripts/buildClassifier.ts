/**
 * Offline: embed labeled dataset examples and write mean centroids per class.
 *
 * Usage (from server/): npm run defense:build-classifier
 * Requires OPENAI_API_KEY. Does not load the full app env schema.
 */

import { config as loadEnv } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

loadEnv();

const EMBEDDING_MODEL = 'text-embedding-3-small';
const DATASET_DIR = path.join(__dirname, '..', 'dataset');
const ARTIFACT_PATH = path.join(__dirname, '..', 'artifacts', 'centroids.json');

type Label = 'malicious' | 'safe';

type Example = {
  text: string;
  label: Label;
};

function readJsonl(filePath: string): Example[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const examples: Example[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as { text?: string; label?: string };
    if (!parsed.text || (parsed.label !== 'malicious' && parsed.label !== 'safe')) {
      throw new Error(`Invalid JSONL row in ${filePath}: ${trimmed.slice(0, 120)}`);
    }
    examples.push({ text: parsed.text, label: parsed.label });
  }
  return examples;
}

function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error('Cannot compute mean of empty vector list');
  }
  const dim = vectors[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const vec of vectors) {
    if (vec.length !== dim) {
      throw new Error('Inconsistent embedding dimensions');
    }
    for (let i = 0; i < dim; i += 1) {
      out[i] += vec[i];
    }
  }
  for (let i = 0; i < dim; i += 1) {
    out[i] /= vectors.length;
  }
  return out;
}

async function embedAll(client: OpenAI, texts: string[]): Promise<number[][]> {
  const batchSize = 64;
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    const byIndex = new Map(response.data.map((row) => [row.index, row.embedding]));
    for (let j = 0; j < batch.length; j += 1) {
      const embedding = byIndex.get(j);
      if (!embedding) {
        throw new Error(`Missing embedding at batch offset ${i + j}`);
      }
      all.push(embedding);
    }
  }
  return all;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to build centroids');
  }

  const files = [
    'seed-malicious.jsonl',
    'seed-safe.jsonl',
    'custom-malicious.jsonl',
    'custom-safe.jsonl',
  ];
  const examples = files.flatMap((name) => readJsonl(path.join(DATASET_DIR, name)));
  const malicious = examples.filter((e) => e.label === 'malicious');
  const safe = examples.filter((e) => e.label === 'safe');

  if (malicious.length === 0 || safe.length === 0) {
    throw new Error(
      `Need both classes; got malicious=${malicious.length} safe=${safe.length}`,
    );
  }

  const client = new OpenAI({ apiKey });
  process.stdout.write(
    `Embedding ${malicious.length} malicious + ${safe.length} safe examples…\n`,
  );

  const maliciousVectors = await embedAll(
    client,
    malicious.map((e) => e.text),
  );
  const safeVectors = await embedAll(
    client,
    safe.map((e) => e.text),
  );

  const artifact = {
    version: 1 as const,
    model: EMBEDDING_MODEL,
    dimensions: maliciousVectors[0].length,
    builtAt: new Date().toISOString(),
    exampleCounts: { malicious: malicious.length, safe: safe.length },
    centroids: {
      malicious: meanVector(maliciousVectors),
      safe: meanVector(safeVectors),
    },
    recommendedThresholds: {
      // Conservative defaults; tune after dry-run against real PRs.
      block: 0.55,
      flag: 0.42,
    },
  };

  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${ARTIFACT_PATH}\n`);
  process.stdout.write(
    `dims=${artifact.dimensions} recommended block=${artifact.recommendedThresholds.block} flag=${artifact.recommendedThresholds.flag}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
