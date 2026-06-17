import { query, queryOne } from '../db/pool';
import { Article } from './types';

export async function listArticles(category?: string): Promise<Article[]> {
  if (category && category.trim()) {
    return query<Article>(
      'SELECT * FROM articles WHERE category = $1 ORDER BY updated_at DESC',
      [category.trim()]
    );
  }
  return query<Article>('SELECT * FROM articles ORDER BY updated_at DESC');
}

export async function getArticle(id: number): Promise<Article | null> {
  return queryOne<Article>('SELECT * FROM articles WHERE id = $1', [id]);
}

export interface ArticleInput {
  title: string;
  category: string;
  content: string;
}

export async function createArticle(input: ArticleInput): Promise<Article> {
  const rows = await query<Article>(
    `INSERT INTO articles (title, category, content)
     VALUES ($1, $2, $3) RETURNING *`,
    [input.title, input.category, input.content]
  );
  return rows[0];
}

export async function updateArticle(id: number, input: ArticleInput): Promise<Article | null> {
  const rows = await query<Article>(
    `UPDATE articles
        SET title = $2, category = $3, content = $4, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, input.title, input.category, input.content]
  );
  return rows[0] ?? null;
}

export async function deleteArticle(id: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    'DELETE FROM articles WHERE id = $1 RETURNING id',
    [id]
  );
  return rows.length > 0;
}

export async function countArticles(): Promise<number> {
  const row = await queryOne<{ count: number }>('SELECT count(*)::int AS count FROM articles');
  return row?.count ?? 0;
}
