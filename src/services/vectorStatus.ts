import { queryOne } from '../db/pool';

// Detect once whether the pgvector `embedding` column exists (it's added
// conditionally during migration). Cached after first check.
let cached: boolean | null = null;

export async function hasVectorColumn(): Promise<boolean> {
  if (cached !== null) return cached;
  const row = await queryOne(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'document_chunks' AND column_name = 'embedding'`
  );
  cached = !!row;
  return cached;
}

// Allow forcing a re-check (e.g. right after migration in the same process).
export function resetVectorStatus(): void {
  cached = null;
}
