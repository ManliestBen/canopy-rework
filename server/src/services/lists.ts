import crypto from 'node:crypto';
import {
  ItemPatchSchema,
  ListCreateSchema,
  ListPatchSchema,
  MealSchema,
  ShoppingListSchema,
  type Meal,
  type ShoppingList,
} from '@canopy/shared';
import type { z } from 'zod';
import { getDb } from '../db/index.js';

/** Retain only the most recent N shopping-item history rows (see addItems). */
const HISTORY_CAP = 1000;

type ListRow = { id: string; title: string; emoji: string };
type ItemRow = {
  id: string;
  list_id: string;
  text: string;
  assignee_id: string | null;
  done: number;
};

export function listLists(): ShoppingList[] {
  const db = getDb();
  const lists = db.prepare('SELECT * FROM lists ORDER BY created_at').all() as ListRow[];
  const items = db
    .prepare('SELECT * FROM list_items ORDER BY done, created_at DESC')
    .all() as ItemRow[];
  return lists.map((l) =>
    ShoppingListSchema.parse({
      id: l.id,
      title: l.title,
      emoji: l.emoji,
      items: items
        .filter((i) => i.list_id === l.id)
        .map((i) => ({
          id: i.id,
          listId: i.list_id,
          text: i.text,
          assigneeId: i.assignee_id,
          done: i.done === 1,
        })),
    }),
  );
}

export function createList(input: unknown): ShoppingList {
  const valid = ListCreateSchema.parse(input);
  const id = crypto.randomUUID();
  getDb()
    .prepare('INSERT INTO lists (id, title, emoji) VALUES (?, ?, ?)')
    .run(id, valid.title, valid.emoji ?? '');
  return listLists().find((l) => l.id === id)!;
}

export function patchList(id: string, patch: unknown): ShoppingList {
  const valid = ListPatchSchema.parse(patch);
  const existing = getDb().prepare('SELECT * FROM lists WHERE id = ?').get(id) as
    | ListRow
    | undefined;
  if (!existing) throw Object.assign(new Error('List not found'), { status: 404 });
  getDb()
    .prepare('UPDATE lists SET title = ?, emoji = ? WHERE id = ?')
    .run(valid.title ?? existing.title, valid.emoji ?? existing.emoji, id);
  return listLists().find((l) => l.id === id)!;
}

export function deleteList(id: string): void {
  const result = getDb().prepare('DELETE FROM lists WHERE id = ?').run(id);
  if (result.changes === 0) throw Object.assign(new Error('List not found'), { status: 404 });
}

export function addItems(listId: string, texts: string[]): void {
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM lists WHERE id = ?').get(listId);
  if (!exists) throw Object.assign(new Error('List not found'), { status: 404 });
  const insert = db.prepare(
    'INSERT INTO list_items (id, list_id, text) VALUES (?, ?, ?)',
  );
  // History powers the "frequent items" suggestions and survives
  // clear-completed (which deletes the live rows).
  const record = db.prepare('INSERT INTO item_history (text) VALUES (?)');
  // Bound the table on a device that runs for years — keep the most recent
  // HISTORY_CAP rows (plenty of signal for frequent-item ranking).
  const prune = db.prepare(
    `DELETE FROM item_history WHERE rowid NOT IN (
       SELECT rowid FROM item_history ORDER BY rowid DESC LIMIT ?
     )`,
  );
  db.transaction(() => {
    for (const text of texts) {
      insert.run(crypto.randomUUID(), listId, text);
      record.run(text);
    }
    prune.run(HISTORY_CAP);
  })();
}

export function patchItem(itemId: string, patch: z.infer<typeof ItemPatchSchema>): void {
  const valid = ItemPatchSchema.parse(patch);
  const row = getDb().prepare('SELECT * FROM list_items WHERE id = ?').get(itemId) as
    | ItemRow
    | undefined;
  if (!row) throw Object.assign(new Error('Item not found'), { status: 404 });
  getDb()
    .prepare('UPDATE list_items SET text = ?, assignee_id = ?, done = ? WHERE id = ?')
    .run(
      valid.text ?? row.text,
      valid.assigneeId === undefined ? row.assignee_id : valid.assigneeId,
      valid.done === undefined ? row.done : valid.done ? 1 : 0,
      itemId,
    );
}

export function deleteItem(itemId: string): void {
  const result = getDb().prepare('DELETE FROM list_items WHERE id = ?').run(itemId);
  if (result.changes === 0) throw Object.assign(new Error('Item not found'), { status: 404 });
}

export function clearCompleted(listId: string): number {
  return getDb()
    .prepare('DELETE FROM list_items WHERE list_id = ? AND done = 1')
    .run(listId).changes;
}

/**
 * Frequent items: what this family actually buys, ranked by how often
 * it has been added anywhere; excludes items currently open on the list.
 */
export function frequentItems(listId: string, limit = 12): string[] {
  const rows = getDb()
    .prepare(
      `SELECT text, COUNT(*) AS n FROM item_history
       WHERE lower(text) NOT IN (
         SELECT lower(text) FROM list_items WHERE list_id = ? AND done = 0
       )
       GROUP BY lower(text)
       HAVING n >= 2
       ORDER BY n DESC, MAX(created_at) DESC
       LIMIT ?`,
    )
    .all(listId, limit) as { text: string }[];
  return rows.map((r) => r.text);
}

// ---- Meals -------------------------------------------------------------

export function mealsForDays(dayKeys: string[]): Meal[] {
  if (dayKeys.length === 0) return [];
  const placeholders = dayKeys.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT date_key, slot, name, notes FROM meals WHERE date_key IN (${placeholders})`)
    .all(...dayKeys) as { date_key: string; slot: string; name: string; notes: string }[];
  return rows.map((r) =>
    MealSchema.parse({ dateKey: r.date_key, slot: r.slot, name: r.name, notes: r.notes }),
  );
}

/** Upsert; an empty name clears the slot. */
export function setMeal(meal: Meal): void {
  const db = getDb();
  if (meal.name === '') {
    db.prepare('DELETE FROM meals WHERE date_key = ? AND slot = ?').run(meal.dateKey, meal.slot);
    return;
  }
  db.prepare(
    `INSERT INTO meals (id, date_key, slot, name, notes) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date_key, slot) DO UPDATE SET name = excluded.name, notes = excluded.notes`,
  ).run(crypto.randomUUID(), meal.dateKey, meal.slot, meal.name, meal.notes);
}
