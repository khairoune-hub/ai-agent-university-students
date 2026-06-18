// Split long document text into overlapping chunks for retrieval.
// Character-based (not token-based) to stay dependency-free; ~1500 chars ≈ a
// few hundred tokens, which is a good retrieval granularity.

export interface ChunkOptions {
  size?: number; // target characters per chunk
  overlap?: number; // characters shared between consecutive chunks
}

export function splitIntoChunks(text: string, opts: ChunkOptions = {}): string[] {
  const size = opts.size ?? 1500;
  const overlap = opts.overlap ?? 200;

  // Normalise whitespace (PDF extraction is noisy).
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);

    // Prefer to break on a paragraph/sentence boundary near the end.
    if (end < clean.length) {
      const slice = clean.slice(start, end);
      const lastBreak = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('. '),
        slice.lastIndexOf('۔ '),
        slice.lastIndexOf('؟ '),
        slice.lastIndexOf('! ')
      );
      if (lastBreak > size * 0.5) {
        end = start + lastBreak + 1;
      }
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start = end - overlap; // overlap for context continuity
    if (start < 0) start = 0;
  }
  return chunks;
}
