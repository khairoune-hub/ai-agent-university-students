import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './pool';
import { env, EMBEDDING_DIM } from '../config/env';

// Applies schema.sql. Idempotent — safe to run repeatedly.
async function migrate() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] Applying schema...');
  await pool.query(sql);

  // Try to enable pgvector for semantic search. This is OPTIONAL: if the
  // Postgres image doesn't ship the extension, we log a warning and keep going
  // in keyword-only mode rather than failing the whole deploy.
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pool.query(
      `ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector(${EMBEDDING_DIM})`
    );
    // HNSW cosine index for fast nearest-neighbour search.
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_chunks_embedding
         ON document_chunks USING hnsw (embedding vector_cosine_ops)`
    );
    console.log(`[migrate] pgvector enabled (dim=${EMBEDDING_DIM}).`);
  } catch (err: any) {
    console.warn(
      '[migrate] pgvector unavailable — documents will use keyword search only. Reason:',
      err?.message ?? err
    );
  }

  // Try to enable pg_trgm for fuzzy keyword search over institution/specialty
  // names. Optional: ILIKE still works without it (just slower / no fuzziness).
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_specialties_name_trgm
         ON specialties USING GIN (filiere_name gin_trgm_ops)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_institutions_name_trgm
         ON institutions USING GIN (name gin_trgm_ops)`
    );
    console.log('[migrate] pg_trgm enabled (fuzzy name search).');
  } catch (err: any) {
    console.warn('[migrate] pg_trgm unavailable — name search uses ILIKE only. Reason:', err?.message ?? err);
  }

  // Heal a stale model: if we're configured for OpenAI but the saved model is an
  // OpenRouter-style id (contains "/" or ":"), reset it to a valid OpenAI model.
  if (env.llmIsOpenAI) {
    const res = await pool.query(
      `UPDATE ai_settings SET model = 'gpt-4o-mini', updated_at = now()
        WHERE id = 1 AND (model LIKE '%/%' OR model LIKE '%:%')`
    );
    if (res.rowCount && res.rowCount > 0) {
      console.log('[migrate] Reset incompatible AI model to gpt-4o-mini (OpenAI).');
    }
  }

  console.log('[migrate] Done.');
}

migrate()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] Failed:', err);
    pool.end().finally(() => process.exit(1));
  });
