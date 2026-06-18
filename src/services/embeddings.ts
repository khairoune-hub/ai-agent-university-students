import OpenAI from 'openai';
import { env, EMBEDDING_DIM } from '../config/env';

// Optional embeddings client. Semantic RAG is an enhancement: if no embeddings
// key is configured (or the provider errors / has no credits), we return null
// and callers fall back to keyword search. The app must never depend on this.
const client = env.embeddingsApiKey
  ? new OpenAI({
      apiKey: env.embeddingsApiKey,
      baseURL: env.embeddingsBaseUrl,
      timeout: 30_000,
      maxRetries: 1,
    })
  : null;

export function embeddingsConfigured(): boolean {
  return client !== null;
}

export const EMBEDDINGS_DIM = EMBEDDING_DIM;

/**
 * Embed a batch of texts. Returns an array of vectors aligned with the input,
 * or `null` if embeddings are unavailable (no key, provider error, no credits).
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!client || texts.length === 0) return null;
  try {
    const res = await client.embeddings.create({
      model: env.embeddingsModel,
      input: texts,
    });
    // Preserve input order (OpenAI returns an index on each item).
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding as number[]);
  } catch (err: any) {
    const detail = err?.error?.message ?? err?.message ?? String(err);
    console.warn(`[embeddings] failed (model "${env.embeddingsModel}"):`, detail);
    return null;
  }
}

export async function embedOne(text: string): Promise<number[] | null> {
  const out = await embedTexts([text]);
  return out ? out[0] : null;
}

// pgvector accepts a vector literal like '[0.1,0.2,...]'.
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
