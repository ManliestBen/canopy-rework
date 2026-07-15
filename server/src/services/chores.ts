import crypto from 'node:crypto';
import {
  ChoreCreateSchema,
  ChorePatchSchema,
  ChoreSchema,
  addDaysToKey,
  occursOn,
  weekStartKey,
  type Chore,
  type ChoreCreate,
  type ChoreDay,
  type ChorePatch,
  type RewardsSummary,
} from '@canopy/shared';
import { getDb } from '../db/index.js';

type ChoreRow = {
  id: string;
  title: string;
  icon: string;
  user_id: string;
  points: number;
  schedule: string;
  anchor_key: string;
};

function rowToChore(row: ChoreRow): Chore {
  return ChoreSchema.parse({
    id: row.id,
    title: row.title,
    icon: row.icon,
    userId: row.user_id,
    points: row.points,
    schedule: row.schedule,
    anchorKey: row.anchor_key,
  });
}

export function listChores(): Chore[] {
  const rows = getDb()
    .prepare('SELECT * FROM chores ORDER BY created_at')
    .all() as ChoreRow[];
  return rows.map(rowToChore);
}

export function getChore(id: string): Chore {
  const row = getDb().prepare('SELECT * FROM chores WHERE id = ?').get(id) as
    | ChoreRow
    | undefined;
  if (!row) throw Object.assign(new Error('Chore not found'), { status: 404 });
  return rowToChore(row);
}

export function createChore(input: ChoreCreate): Chore {
  const valid = ChoreCreateSchema.parse(input);
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO chores (id, title, icon, user_id, points, schedule, anchor_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      valid.title,
      valid.icon ?? '',
      valid.userId,
      valid.points ?? 1,
      valid.schedule ?? 'daily',
      valid.anchorKey,
    );
  return getChore(id);
}

export function patchChore(id: string, patch: ChorePatch): Chore {
  const valid = ChorePatchSchema.parse(patch);
  const current = getChore(id);
  const next = { ...current, ...valid };
  getDb()
    .prepare(
      `UPDATE chores SET title = ?, icon = ?, user_id = ?, points = ?, schedule = ?, anchor_key = ?
       WHERE id = ?`,
    )
    .run(next.title, next.icon, next.userId, next.points, next.schedule, next.anchorKey, id);
  return getChore(id);
}

export function deleteChore(id: string): void {
  const result = getDb().prepare('DELETE FROM chores WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw Object.assign(new Error('Chore not found'), { status: 404 });
  }
}

/** The chart for one day: which chores are due, and which are done. */
export function choreDay(dateKey: string): ChoreDay {
  const chores = listChores().filter((c) =>
    occursOn(c.schedule, c.anchorKey, dateKey),
  );
  const done = new Set(
    (
      getDb()
        .prepare('SELECT chore_id FROM chore_completions WHERE date_key = ?')
        .all(dateKey) as { chore_id: string }[]
    ).map((r) => r.chore_id),
  );
  return {
    dateKey,
    chores: chores.map((c) => ({ ...c, done: done.has(c.id) })),
  };
}

/** Toggle a chore for a day; completion snapshots points + user for history. */
export function toggleChore(id: string, dateKey: string): ChoreDay {
  const chore = getChore(id);
  const db = getDb();
  const existing = db
    .prepare('SELECT 1 FROM chore_completions WHERE chore_id = ? AND date_key = ?')
    .get(id, dateKey);
  if (existing) {
    db.prepare('DELETE FROM chore_completions WHERE chore_id = ? AND date_key = ?').run(
      id,
      dateKey,
    );
  } else {
    db.prepare(
      'INSERT INTO chore_completions (chore_id, date_key, points, user_id) VALUES (?, ?, ?, ?)',
    ).run(id, dateKey, chore.points, chore.userId);
  }
  return choreDay(dateKey);
}

export function rewardsSummary(todayKey: string): RewardsSummary {
  const db = getDb();
  const weekStart = weekStartKey(todayKey);
  const weekEnd = addDaysToKey(weekStart, 6);

  const earned = db
    .prepare(
      `SELECT user_id, SUM(points) AS total,
              SUM(CASE WHEN date_key BETWEEN ? AND ? THEN points ELSE 0 END) AS week
       FROM chore_completions GROUP BY user_id`,
    )
    .all(weekStart, weekEnd) as { user_id: string; total: number; week: number }[];

  const redeemed = db
    .prepare('SELECT user_id, SUM(points) AS total FROM reward_redemptions GROUP BY user_id')
    .all() as { user_id: string; total: number }[];
  const redeemedBy = new Map(redeemed.map((r) => [r.user_id, r.total]));

  const userIds = new Set([...earned.map((e) => e.user_id), ...redeemedBy.keys()]);
  const users = [...userIds].map((userId) => {
    const e = earned.find((x) => x.user_id === userId);
    const r = redeemedBy.get(userId) ?? 0;
    return {
      userId,
      earnedTotal: e?.total ?? 0,
      earnedThisWeek: e?.week ?? 0,
      redeemedTotal: r,
      balance: (e?.total ?? 0) - r,
    };
  });

  const recentRedemptions = (
    db
      .prepare(
        'SELECT id, user_id, points, note, created_at FROM reward_redemptions ORDER BY created_at DESC LIMIT 10',
      )
      .all() as { id: string; user_id: string; points: number; note: string; created_at: string }[]
  ).map((r) => ({
    id: r.id,
    userId: r.user_id,
    points: r.points,
    note: r.note,
    createdAt: r.created_at,
  }));

  return { users, recentRedemptions };
}

export function redeem(userId: string, points: number, note: string): void {
  getDb()
    .prepare('INSERT INTO reward_redemptions (id, user_id, points, note) VALUES (?, ?, ?, ?)')
    .run(crypto.randomUUID(), userId, points, note);
}
