import { query } from '../db/pool';
import { Article } from './types';
import { embeddingsConfigured, embedOne, toVectorLiteral } from './embeddings';
import { hasVectorColumn } from './vectorStatus';

/**
 * Keyword search over articles — no vector DB.
 *
 * Strategy:
 *  1. Try Postgres full-text search (websearch_to_tsquery) using the 'simple'
 *     config so Arabic / French / English tokens all match literally.
 *  2. If that yields nothing (e.g. very short query, or punctuation only),
 *     fall back to a simple ILIKE OR-search across the query's words.
 *
 * Returns the top `limit` articles, most relevant first.
 */
export async function searchArticles(rawQuery: string, limit = 4): Promise<Article[]> {
  const q = (rawQuery || '').trim();
  if (!q) return [];

  // 1) Full-text search
  const fts = await query<Article & { rank: number }>(
    `SELECT *,
            ts_rank(
              to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')),
              websearch_to_tsquery('simple', $1)
            ) AS rank
       FROM articles
      WHERE to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,''))
            @@ websearch_to_tsquery('simple', $1)
      ORDER BY rank DESC
      LIMIT $2`,
    [q, limit]
  );
  if (fts.length > 0) return fts;

  // 2) Fallback: ILIKE on individual words (>= 3 chars to avoid noise)
  const words = q
    .split(/\s+/)
    .map((w) => w.replace(/[%_]/g, '').trim())
    .filter((w) => w.length >= 3);
  if (words.length === 0) return [];

  const conditions: string[] = [];
  const params: string[] = [];
  words.forEach((w, i) => {
    params.push(`%${w}%`);
    conditions.push(`(title ILIKE $${i + 1} OR content ILIKE $${i + 1})`);
  });
  params.push(String(limit));

  return query<Article>(
    `SELECT * FROM articles
      WHERE ${conditions.join(' OR ')}
      ORDER BY updated_at DESC
      LIMIT $${params.length}`,
    params
  );
}

/**
 * Builds a compact context block from articles for prompt injection.
 * Truncates each article so a few long articles can't blow up the prompt.
 */
export function buildContext(articles: Article[], maxCharsPerArticle = 1200): string {
  if (articles.length === 0) return '';
  return articles
    .map((a, i) => {
      const body =
        a.content.length > maxCharsPerArticle
          ? a.content.slice(0, maxCharsPerArticle) + '…'
          : a.content;
      return `### [${i + 1}] ${a.title} (${a.category})\n${body}`;
    })
    .join('\n\n');
}

// ── Uploaded-document (PDF) chunk retrieval ─────────────────

export interface DocChunkHit {
  content: string;
  title: string; // source document title
  mode?: 'semantic' | 'keyword-fts' | 'keyword-ilike';
}

// One-line snippet for logging (collapses whitespace, truncates).
function snippet(text: string, n = 90): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, n);
}

/**
 * Retrieve the most relevant uploaded-document chunks for a query.
 * Uses pgvector cosine similarity when embeddings are available, otherwise
 * falls back to Postgres full-text keyword search. Returns [] on any issue.
 */
export async function searchDocumentChunks(rawQuery: string, limit = 4): Promise<DocChunkHit[]> {
  const q = (rawQuery || '').trim();
  if (!q) return [];

  // Semantic path: needs the vector column AND a usable embeddings provider.
  // Only RETURN from here if it actually finds something — otherwise fall
  // through to keyword search (e.g. chunks that aren't embedded yet).
  if ((await hasVectorColumn()) && embeddingsConfigured()) {
    const vec = await embedOne(q);
    if (vec) {
      try {
        const hits = await query<DocChunkHit>(
          `SELECT c.content, d.title
             FROM document_chunks c
             JOIN documents d ON d.id = c.document_id
            WHERE c.embedding IS NOT NULL
            ORDER BY c.embedding <=> $1::vector
            LIMIT $2`,
          [toVectorLiteral(vec), limit]
        );
        if (hits.length > 0) return hits.map((h) => ({ ...h, mode: 'semantic' as const }));
      } catch (err) {
        console.warn('[kb] vector search failed, falling back to keyword:', err);
      }
    }
  }

  // Keyword fallback (full-text, then ILIKE) — also covers not-yet-embedded chunks.
  const fts = await query<DocChunkHit>(
    `SELECT c.content, d.title
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
      WHERE to_tsvector('simple', c.content) @@ websearch_to_tsquery('simple', $1)
      ORDER BY ts_rank(to_tsvector('simple', c.content), websearch_to_tsquery('simple', $1)) DESC
      LIMIT $2`,
    [q, limit]
  );
  if (fts.length > 0) return fts.map((h) => ({ ...h, mode: 'keyword-fts' as const }));

  const words = q.split(/\s+/).map((w) => w.replace(/[%_]/g, '').trim()).filter((w) => w.length >= 3);
  if (words.length === 0) return [];
  const conditions = words.map((_, i) => `c.content ILIKE $${i + 1}`);
  const params: string[] = words.map((w) => `%${w}%`);
  params.push(String(limit));
  const ilike = await query<DocChunkHit>(
    `SELECT c.content, d.title
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
      WHERE ${conditions.join(' OR ')}
      LIMIT $${params.length}`,
    params
  );
  return ilike.map((h) => ({ ...h, mode: 'keyword-ilike' as const }));
}

export interface RetrievedContext {
  context: string;
  articleCount: number;
  chunkCount: number;
}

/**
 * Combined retrieval for the AI: curated articles + uploaded-document chunks.
 * Produces a single context block to inject into the prompt.
 */
export async function retrieveContext(questionText: string): Promise<RetrievedContext> {
  const [articles, chunks] = await Promise.all([
    searchArticles(questionText, 3),
    searchDocumentChunks(questionText, 4),
  ]);

  const parts: string[] = [];
  const articleCtx = buildContext(articles);
  if (articleCtx) parts.push(articleCtx);

  if (chunks.length > 0) {
    const docCtx = chunks
      .map((c, i) => {
        const body = c.content.length > 1200 ? c.content.slice(0, 1200) + '…' : c.content;
        return `### [مستند: ${c.title}] (${i + 1})\n${body}`;
      })
      .join('\n\n');
    parts.push(docCtx);
  }

  // ── RAG retrieval log: show exactly what was pulled into the prompt ──
  const mode = chunks[0]?.mode ?? (chunks.length ? 'keyword' : '—');
  console.log(
    `[rag] q="${snippet(questionText, 80)}" | articles=${articles.length} docChunks=${chunks.length} (${mode})`
  );
  articles.forEach((a, i) => console.log(`[rag]   article#${i + 1}: ${a.title} (${a.category})`));
  chunks.forEach((c, i) =>
    console.log(`[rag]   chunk#${i + 1} «${c.title}»: ${snippet(c.content)}`)
  );
  if (articles.length === 0 && chunks.length === 0) {
    console.log('[rag]   ⚠ no context found — the model will answer without RAG grounding');
  }

  return {
    context: parts.join('\n\n'),
    articleCount: articles.length,
    chunkCount: chunks.length,
  };
}
