import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './pool';

// Loads the parsed BAC minimum-averages dataset (data/moyennes_minimales_2025.json,
// produced once by scripts/extract_minimums.py) into the structured tables.
// Idempotent — safe to run on every deploy (upserts).

interface Institution {
  code: string;
  name: string;
  type: string;
  wilaya?: string | null;
}
interface Specialty {
  filiere_code: string;
  filiere_name: string;
  domain?: string | null;
}
interface Offering {
  institution_code: string;
  filiere_code: string;
  min1: number | null;
  min2: number | null;
  min3: number | null;
  year: number;
}
interface Dataset {
  institutions: Institution[];
  specialties: Specialty[];
  offerings: Offering[];
}

async function importOfferings() {
  // data/ lives at the repo root; from src/db (tsx) or dist/db (compiled) it's ../../data.
  const file = join(__dirname, '../../data/moyennes_minimales_2025.json');
  const data: Dataset = JSON.parse(readFileSync(file, 'utf8'));

  console.log(
    `[import] loading ${data.institutions.length} institutions, ` +
      `${data.specialties.length} specialties, ${data.offerings.length} offerings...`
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const i of data.institutions) {
      await client.query(
        `INSERT INTO institutions (code, name, wilaya, institution_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE
           SET name = EXCLUDED.name,
               wilaya = EXCLUDED.wilaya,
               institution_type = EXCLUDED.institution_type`,
        [i.code, i.name, i.wilaya ?? null, i.type]
      );
    }

    for (const s of data.specialties) {
      await client.query(
        `INSERT INTO specialties (filiere_code, filiere_name, domain)
         VALUES ($1, $2, $3)
         ON CONFLICT (filiere_code) DO UPDATE
           SET filiere_name = EXCLUDED.filiere_name`,
        [s.filiere_code, s.filiere_name, s.domain ?? null]
      );
    }

    for (const o of data.offerings) {
      await client.query(
        `INSERT INTO offerings (institution_code, filiere_code, min1, min2, min3, year)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (institution_code, filiere_code, year) DO UPDATE
           SET min1 = EXCLUDED.min1, min2 = EXCLUDED.min2, min3 = EXCLUDED.min3`,
        [o.institution_code, o.filiere_code, o.min1, o.min2, o.min3, o.year]
      );
    }

    await client.query('COMMIT');
    console.log('[import] Done.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

importOfferings()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[import] Failed:', err);
    pool.end().finally(() => process.exit(1));
  });
