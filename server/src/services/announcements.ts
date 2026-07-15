import crypto from 'node:crypto';
import {
  AnnouncementCreateSchema,
  AnnouncementSchema,
  type Announcement,
  type AnnouncementCreate,
} from '@canopy/shared';
import { getDb } from '../db/index.js';

type Row = {
  id: string;
  text: string;
  author_id: string | null;
  emoji: string;
  created_at: string;
  expires_at: string | null;
};

function rowToAnnouncement(row: Row): Announcement {
  return AnnouncementSchema.parse({
    id: row.id,
    text: row.text,
    authorId: row.author_id,
    emoji: row.emoji,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  });
}

/** Active only — expired notes fall off automatically. */
export function listAnnouncements(): Announcement[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM announcements
       WHERE expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
       ORDER BY created_at DESC`,
    )
    .all() as Row[];
  return rows.map(rowToAnnouncement);
}

export function createAnnouncement(input: AnnouncementCreate): Announcement {
  const valid = AnnouncementCreateSchema.parse(input);
  const id = crypto.randomUUID();
  const expiresAt = valid.expiresInHours
    ? new Date(Date.now() + valid.expiresInHours * 3600_000).toISOString()
    : null;
  getDb()
    .prepare(
      'INSERT INTO announcements (id, text, author_id, emoji, expires_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, valid.text, valid.authorId ?? null, valid.emoji ?? '📌', expiresAt);
  const row = getDb().prepare('SELECT * FROM announcements WHERE id = ?').get(id) as Row;
  return rowToAnnouncement(row);
}

export function deleteAnnouncement(id: string): void {
  const result = getDb().prepare('DELETE FROM announcements WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw Object.assign(new Error('Announcement not found'), { status: 404 });
  }
}
