import { query } from '../db/pool';

// Human-readable Arabic labels for each institution category, so the model can
// group its answer (e.g. call out écoles nationales supérieures explicitly).
export const TYPE_LABELS: Record<string, string> = {
  ecole_nationale_superieure: 'مدارس وطنية عليا (توظيف وطني)',
  ecole_normale_superieure: 'مدارس عليا للأساتذة',
  universite: 'جامعات',
  centre_universitaire: 'مراكز جامعية',
  institut: 'معاهد',
  centre_formation: 'مراكز تكوين',
  recrutement_national: 'توظيف وطني',
  autre: 'أخرى',
};

export interface ProgramRow {
  institution_code: string;
  institution_name: string;
  institution_type: string;
  filiere_name: string;
  min1: number | null;
  min2: number | null;
  min3: number | null;
}

export interface SearchProgramsInput {
  keyword?: string; // specialty/field in FRENCH (data is French), e.g. "informatique"
  institution_type?: string;
  limit?: number;
}

export interface SearchProgramsResult {
  total: number;
  truncated: boolean;
  groups: { type: string; label: string; count: number; rows: ProgramRow[] }[];
}

const MAX = 150;

/**
 * Exhaustive structured lookup over the BAC offerings table. Unlike RAG top-k,
 * this returns ALL matching programs (capped at a safety ceiling), grouped by
 * institution type so the answer can separate universités / écoles / etc.
 */
export async function searchPrograms(input: SearchProgramsInput): Promise<SearchProgramsResult> {
  const limit = Math.min(input.limit ?? MAX, MAX);
  const conditions: string[] = [];
  const params: any[] = [];

  const kw = (input.keyword ?? '').trim();
  if (kw) {
    params.push(`%${kw}%`);
    // Match the specialty name OR the institution name (catches écoles whose
    // filiere code is a generic tronc-commun but whose name says the field).
    conditions.push(`(s.filiere_name ILIKE $${params.length} OR i.name ILIKE $${params.length})`);
  }
  if (input.institution_type && input.institution_type.trim()) {
    params.push(input.institution_type.trim());
    conditions.push(`i.institution_type = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit + 1); // fetch one extra to detect truncation

  const rows = await query<ProgramRow>(
    `SELECT i.code AS institution_code, i.name AS institution_name,
            i.institution_type, s.filiere_name,
            o.min1, o.min2, o.min3
       FROM offerings o
       JOIN institutions i ON i.code = o.institution_code
       JOIN specialties s ON s.filiere_code = o.filiere_code
       ${where}
      ORDER BY o.min1 DESC NULLS LAST, i.name ASC
      LIMIT $${params.length}`,
    params
  );

  const truncated = rows.length > limit;
  const kept = truncated ? rows.slice(0, limit) : rows;

  // Group by institution type, ordered with the "national higher schools" first.
  const order = [
    'ecole_nationale_superieure',
    'ecole_normale_superieure',
    'recrutement_national',
    'universite',
    'centre_universitaire',
    'institut',
    'centre_formation',
    'autre',
  ];
  const byType = new Map<string, ProgramRow[]>();
  for (const r of kept) {
    if (!byType.has(r.institution_type)) byType.set(r.institution_type, []);
    byType.get(r.institution_type)!.push(r);
  }
  const groups = order
    .filter((t) => byType.has(t))
    .map((t) => ({
      type: t,
      label: TYPE_LABELS[t] ?? t,
      count: byType.get(t)!.length,
      rows: byType.get(t)!,
    }));

  return { total: kept.length, truncated, groups };
}
