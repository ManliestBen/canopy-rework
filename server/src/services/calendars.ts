import crypto from 'node:crypto';
import {
  CalendarCreateSchema,
  CalendarPatchSchema,
  CalendarSourceSchema,
  type CalendarCreate,
  type CalendarPatch,
  type CalendarSource,
} from '@canopy/shared';
import { getDb } from '../db/index.js';

type CalendarRow = {
  id: string;
  title: string;
  source_type: string;
  source_ref: string;
  color: string;
  user_id: string | null;
};

function rowToCalendar(row: CalendarRow): CalendarSource {
  return CalendarSourceSchema.parse({
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    color: row.color,
    userId: row.user_id,
  });
}

export function listCalendars(): CalendarSource[] {
  const rows = getDb()
    .prepare('SELECT * FROM calendars ORDER BY created_at')
    .all() as CalendarRow[];
  return rows.map(rowToCalendar);
}

export function getCalendar(id: string): CalendarSource {
  const row = getDb().prepare('SELECT * FROM calendars WHERE id = ?').get(id) as
    | CalendarRow
    | undefined;
  if (!row) throw Object.assign(new Error('Calendar not found'), { status: 404 });
  return rowToCalendar(row);
}

export function createCalendar(input: CalendarCreate): CalendarSource {
  const valid = CalendarCreateSchema.parse(input);
  const id = crypto.randomUUID();
  try {
    getDb()
      .prepare(
        'INSERT INTO calendars (id, title, source_type, source_ref, color, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, valid.title, valid.sourceType, valid.sourceRef, valid.color, valid.userId ?? null);
  } catch (err) {
    if ((err as Error).message.includes('UNIQUE')) {
      throw Object.assign(new Error('That calendar is already added'), { status: 409 });
    }
    throw err;
  }
  return getCalendar(id);
}

export function patchCalendar(id: string, patch: CalendarPatch): CalendarSource {
  const valid = CalendarPatchSchema.parse(patch);
  const current = getCalendar(id);
  const next = { ...current, ...valid };
  getDb()
    .prepare(
      'UPDATE calendars SET title = ?, source_ref = ?, color = ?, user_id = ? WHERE id = ?',
    )
    .run(next.title, next.sourceRef, next.color, next.userId, id);
  return getCalendar(id);
}

export function deleteCalendar(id: string): void {
  const result = getDb().prepare('DELETE FROM calendars WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw Object.assign(new Error('Calendar not found'), { status: 404 });
  }
}
