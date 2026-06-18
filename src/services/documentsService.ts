import { PDFParse } from 'pdf-parse';
import { pool, query, queryOne } from '../db/pool';
import { splitIntoChunks } from './chunking';
import { embedTexts, toVectorLiteral } from './embeddings';
import { hasVectorColumn } from './vectorStatus';

export interface DocumentRow {
  id: number;
  title: string;
  filename: string | null;
  source_type: string;
  chunk_count: number;
  embedded: boolean;
  created_at: string;
}

export interface IngestResult {
  document: DocumentRow;
  chunks: number;
  embedded: boolean;
}

/**
 * Ingest a PDF: extract text → chunk → store → embed (if possible).
 * Embedding is best-effort: if it fails (no key/credits), chunks are still
 * stored and remain searchable via keyword search.
 */
export async function ingestPdf(
  buffer: Buffer,
  title: string,
  filename: string
): Promise<IngestResult> {
  const parser = new PDFParse({ data: buffer });
  let text: string;
  try {
    const result = await parser.getText();
    text = (result.text || '').trim();
  } finally {
    await parser.destroy().catch(() => {});
  }
  if (!text) {
    throw new Error('تعذّر استخراج نص من ملف PDF (قد يكون صورة ممسوحة بدون نص).');
  }

  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) {
    throw new Error('لم يتم العثور على محتوى نصي قابل للفهرسة في الملف.');
  }

  const client = await pool.connect();
  let documentId: number;
  try {
    await client.query('BEGIN');
    const docRes = await client.query<DocumentRow>(
      `INSERT INTO documents (title, filename, source_type, chunk_count)
       VALUES ($1, $2, 'pdf', $3) RETURNING *`,
      [title, filename, chunks.length]
    );
    documentId = docRes.rows[0].id;

    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO document_chunks (document_id, chunk_index, content)
         VALUES ($1, $2, $3)`,
        [documentId, i, chunks[i]]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Best-effort embedding (outside the insert transaction).
  let embedded = false;
  if (await hasVectorColumn()) {
    embedded = await embedDocument(documentId);
  }

  const document = (await queryOne<DocumentRow>('SELECT * FROM documents WHERE id = $1', [
    documentId,
  ]))!;
  console.log(
    `[docs] ingested "${title}" — ${chunks.length} chunks, embedded=${embedded}`
  );
  return { document, chunks: chunks.length, embedded };
}

/**
 * Embed all chunks of a document in batches and store the vectors.
 * Returns true if at least one chunk was embedded.
 */
async function embedDocument(documentId: number): Promise<boolean> {
  const rows = await query<{ id: number; content: string }>(
    'SELECT id, content FROM document_chunks WHERE document_id = $1 ORDER BY chunk_index',
    [documentId]
  );
  if (rows.length === 0) return false;

  const BATCH = 50;
  let anyEmbedded = false;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vectors = await embedTexts(batch.map((r) => r.content));
    if (!vectors) return anyEmbedded; // provider unavailable — stop trying
    try {
      for (let j = 0; j < batch.length; j++) {
        await query('UPDATE document_chunks SET embedding = $1::vector WHERE id = $2', [
          toVectorLiteral(vectors[j]),
          batch[j].id,
        ]);
      }
      anyEmbedded = true;
    } catch (err) {
      console.warn('[docs] storing embeddings failed (dim mismatch?):', err);
      return anyEmbedded;
    }
  }

  if (anyEmbedded) {
    await query('UPDATE documents SET embedded = true WHERE id = $1', [documentId]);
  }
  return anyEmbedded;
}

export async function listDocuments(): Promise<DocumentRow[]> {
  return query<DocumentRow>('SELECT * FROM documents ORDER BY created_at DESC');
}

export async function deleteDocument(id: number): Promise<boolean> {
  // document_chunks rows cascade-delete via FK.
  const rows = await query<{ id: number }>(
    'DELETE FROM documents WHERE id = $1 RETURNING id',
    [id]
  );
  return rows.length > 0;
}

export async function countDocuments(): Promise<number> {
  const row = await queryOne<{ count: number }>('SELECT count(*)::int AS count FROM documents');
  return row?.count ?? 0;
}
