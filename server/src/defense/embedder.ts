/** OpenAI embeddings client for injection defense. */

import OpenAI from 'openai';
import { env } from '../config/env';
import { EMBEDDING_MODEL } from './thresholds';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when injection defense is enabled');
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

/** Embeds one or more texts with text-embedding-3-small. Returns vectors in input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const openai = getClient();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  const byIndex = new Map(response.data.map((row) => [row.index, row.embedding]));
  return texts.map((_, index) => {
    const embedding = byIndex.get(index);
    if (!embedding) {
      throw new Error(`Missing embedding for input index ${index}`);
    }
    return embedding;
  });
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
