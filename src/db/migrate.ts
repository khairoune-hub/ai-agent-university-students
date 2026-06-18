import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './pool';
import { EMBEDDING_DIM } from '../config/env';

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

  console.log('[migrate] Done.');
}

migrate()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] Failed:', err);
    pool.end().finally(() => process.exit(1));
  });
