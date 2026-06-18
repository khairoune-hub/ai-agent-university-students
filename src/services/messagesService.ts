import { query } from '../db/pool';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// How many past turns to feed back into the model (≈ 4 exchanges).
// Note: we KEEP the full history in the DB (for the admin to review); this only
// limits how much is sent back to the model as context.
const HISTORY_LIMIT = 8;

/** Most recent turns for a user, in chronological order (oldest → newest). */
export async function getRecentHistory(
  telegramId: number | string,
  limit = HISTORY_LIMIT
): Promise<ChatTurn[]> {
  const rows = await query<ChatTurn>(
    `SELECT role, content FROM chat_messages
      WHERE telegram_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [String(telegramId), limit]
  );
  return rows.reverse();
}

/** Append turns (user message + assistant reply). Full history is retained. */
export async function appendTurns(
  telegramId: number | string,
  turns: ChatTurn[]
): Promise<void> {
  const id = String(telegramId);
  for (const t of turns) {
    await query(
      'INSERT INTO chat_messages (telegram_id, role, content) VALUES ($1, $2, $3)',
      [id, t.role, t.content]
    );
  }
}

// ── Admin: review conversations ─────────────────────────────

/** Full conversation for one user, chronological. */
export async function getConversation(telegramId: number | string): Promise<
  (ChatTurn & { created_at: string })[]
> {
  return query(
    `SELECT role, content, created_at FROM chat_messages
      WHERE telegram_id = $1
      ORDER BY created_at ASC, id ASC`,
    [String(telegramId)]
  );
}

/** Per-user message counts + last activity, for the admin conversations list. */
export interface ConversationSummary {
  telegram_id: string;
  first_name: string | null;
  username: string | null;
  message_count: number;
  last_message_at: string;
}
export async function listConversations(limit = 200): Promise<ConversationSummary[]> {
  return query<ConversationSummary>(
    `SELECT m.telegram_id,
            u.first_name,
            u.username,
            count(*)::int AS message_count,
            max(m.created_at) AS last_message_at
       FROM chat_messages m
       LEFT JOIN users u ON u.telegram_id = m.telegram_id
      GROUP BY m.telegram_id, u.first_name, u.username
      ORDER BY max(m.created_at) DESC
      LIMIT $1`,
    [limit]
  );
}
