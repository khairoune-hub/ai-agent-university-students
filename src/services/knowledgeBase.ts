import { query } from '../db/pool';
import { Article } from './types';

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
