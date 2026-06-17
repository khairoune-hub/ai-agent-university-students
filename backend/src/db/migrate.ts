import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './pool';

// Applies schema.sql. Idempotent — safe to run repeatedly.
async function migrate() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] Applying schema...');
  await pool.query(sql);
  console.log('[migrate] Done.');
}

migrate()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] Failed:', err);
    pool.end().finally(() => process.exit(1));
  });
