import { query, queryOne } from '../db/pool';
import { Announcement } from './types';

export async function listAnnouncements(): Promise<Announcement[]> {
  return query<Announcement>('SELECT * FROM announcements ORDER BY created_at DESC');
}

export async function getAnnouncement(id: number): Promise<Announcement | null> {
  return queryOne<Announcement>('SELECT * FROM announcements WHERE id = $1', [id]);
}

export interface AnnouncementInput {
  title: string;
  message: string;
}

export async function createAnnouncement(input: AnnouncementInput): Promise<Announcement> {
  const rows = await query<Announcement>(
    'INSERT INTO announcements (title, message) VALUES ($1, $2) RETURNING *',
    [input.title, input.message]
  );
  return rows[0];
}

export async function deleteAnnouncement(id: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    'DELETE FROM announcements WHERE id = $1 RETURNING id',
    [id]
  );
  return rows.length > 0;
}

export async function markSent(id: number, sentCount: number): Promise<Announcement | null> {
  const rows = await query<Announcement>(
    'UPDATE announcements SET sent_at = now(), sent_count = $2 WHERE id = $1 RETURNING *',
    [id, sentCount]
  );
  return rows[0] ?? null;
}
