import { query, queryOne } from '../db/pool';
import { OrientationData, User } from './types';

export interface TelegramUserInfo {
  telegramId: number | string;
  username?: string | null;
  firstName?: string | null;
}

/**
 * Inserts the user on first contact, otherwise refreshes their profile and
 * last_active_at. Returns the stored user row.
 */
export async function upsertUser(info: TelegramUserInfo): Promise<User> {
  const rows = await query<User>(
    `INSERT INTO users (telegram_id, username, first_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id) DO UPDATE
       SET username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           last_active_at = now()
     RETURNING *`,
    [String(info.telegramId), info.username ?? null, info.firstName ?? null]
  );
  return rows[0];
}

export async function getUserByTelegramId(telegramId: number | string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE telegram_id = $1', [String(telegramId)]);
}

export async function setOrientationData(
  telegramId: number | string,
  data: OrientationData
): Promise<void> {
  await query(
    'UPDATE users SET orientation_data = $2, last_active_at = now() WHERE telegram_id = $1',
    [String(telegramId), JSON.stringify(data)]
  );
}

export async function listUsers(limit = 200, offset = 0): Promise<User[]> {
  return query<User>(
    'SELECT * FROM users ORDER BY last_active_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
}

export async function countUsers(): Promise<number> {
  const row = await queryOne<{ count: number }>('SELECT count(*)::int AS count FROM users');
  return row?.count ?? 0;
}

// Telegram IDs of every user — used to broadcast announcements.
export async function getAllTelegramIds(): Promise<string[]> {
  const rows = await query<{ telegram_id: string }>('SELECT telegram_id FROM users');
  return rows.map((r) => r.telegram_id);
}
