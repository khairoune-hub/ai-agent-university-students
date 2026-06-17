import { query, queryOne } from '../db/pool';
import { AiSettings } from './types';

// Sensible fallback used only if the ai_settings row is somehow missing
// (e.g. the seed wasn't run). The bot should still work.
const FALLBACK: Omit<AiSettings, 'updated_at'> = {
  id: 1,
  system_prompt:
    'أنت مساعد توجيه ذكي لطلاب البكالوريا في الجزائر. أجب بالعربية بشكل دقيق ومفيد.',
  model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  temperature: 0.6,
};

export async function getAiSettings(): Promise<AiSettings> {
  const row = await queryOne<AiSettings>('SELECT * FROM ai_settings WHERE id = 1');
  if (row) return row;
  return { ...FALLBACK, updated_at: new Date().toISOString() };
}

export interface UpdateAiSettingsInput {
  system_prompt: string;
  model: string;
  temperature: number;
}

export async function updateAiSettings(input: UpdateAiSettingsInput): Promise<AiSettings> {
  const rows = await query<AiSettings>(
    `INSERT INTO ai_settings (id, system_prompt, model, temperature, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE
       SET system_prompt = EXCLUDED.system_prompt,
           model = EXCLUDED.model,
           temperature = EXCLUDED.temperature,
           updated_at = now()
     RETURNING *`,
    [input.system_prompt, input.model, input.temperature]
  );
  return rows[0];
}
