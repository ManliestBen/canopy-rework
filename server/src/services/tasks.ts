import crypto from 'node:crypto';
import {
  TaskCreateSchema,
  TaskPatchSchema,
  TaskSchema,
  type Task,
  type TaskCreate,
  type TaskPatch,
} from '@canopy/shared';
import { getDb } from '../db/index.js';

type TaskRow = {
  id: string;
  title: string;
  notes: string;
  user_id: string | null;
  category: string;
  due_key: string | null;
  schedule: string;
  completed_at: string | null;
};

function rowToTask(row: TaskRow, completedKeys: string[]): Task {
  return TaskSchema.parse({
    id: row.id,
    title: row.title,
    notes: row.notes,
    userId: row.user_id,
    category: row.category,
    dueKey: row.due_key,
    schedule: row.schedule,
    completedAt: row.completed_at,
    completedKeys,
  });
}

export function listTasks(): Task[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM tasks ORDER BY created_at DESC')
    .all() as TaskRow[];
  const completions = db
    .prepare('SELECT task_id, date_key FROM task_completions')
    .all() as { task_id: string; date_key: string }[];
  const byTask = new Map<string, string[]>();
  for (const c of completions) {
    const list = byTask.get(c.task_id) ?? [];
    list.push(c.date_key);
    byTask.set(c.task_id, list);
  }
  return rows.map((r) => rowToTask(r, byTask.get(r.id) ?? []));
}

export function getTask(id: string): Task {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
    | TaskRow
    | undefined;
  if (!row) throw Object.assign(new Error('Task not found'), { status: 404 });
  const keys = (
    getDb()
      .prepare('SELECT date_key FROM task_completions WHERE task_id = ?')
      .all(id) as { date_key: string }[]
  ).map((r) => r.date_key);
  return rowToTask(row, keys);
}

export function createTask(input: TaskCreate): Task {
  const valid = TaskCreateSchema.parse(input);
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO tasks (id, title, notes, user_id, category, due_key, schedule)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      valid.title,
      valid.notes ?? '',
      valid.userId ?? null,
      valid.category ?? '',
      valid.dueKey ?? null,
      valid.schedule ?? 'none',
    );
  return getTask(id);
}

export function patchTask(id: string, patch: TaskPatch): Task {
  const valid = TaskPatchSchema.parse(patch);
  const current = getTask(id);
  const next = { ...current, ...valid };
  getDb()
    .prepare(
      `UPDATE tasks SET title = ?, notes = ?, user_id = ?, category = ?, due_key = ?, schedule = ?
       WHERE id = ?`,
    )
    .run(next.title, next.notes, next.userId, next.category, next.dueKey, next.schedule, id);
  return getTask(id);
}

export function deleteTask(id: string): void {
  const result = getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw Object.assign(new Error('Task not found'), { status: 404 });
  }
}

/**
 * Toggle completion. One-time tasks flip completed_at; recurring tasks
 * toggle a per-day completion row.
 */
export function toggleTask(id: string, dateKey: string | null): Task {
  const task = getTask(id);
  const db = getDb();
  if (task.schedule === 'none') {
    db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run(
      task.completedAt ? null : new Date().toISOString(),
      id,
    );
  } else {
    if (!dateKey) {
      throw Object.assign(new Error('dateKey required for recurring tasks'), {
        status: 400,
      });
    }
    const existing = db
      .prepare('SELECT 1 FROM task_completions WHERE task_id = ? AND date_key = ?')
      .get(id, dateKey);
    if (existing) {
      db.prepare('DELETE FROM task_completions WHERE task_id = ? AND date_key = ?').run(
        id,
        dateKey,
      );
    } else {
      db.prepare('INSERT INTO task_completions (task_id, date_key) VALUES (?, ?)').run(
        id,
        dateKey,
      );
    }
  }
  return getTask(id);
}
