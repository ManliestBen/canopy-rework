import crypto from 'node:crypto';
import {
  UserCreateSchema,
  UserPatchSchema,
  UserSchema,
  type User,
  type UserCreate,
  type UserPatch,
} from '@canopy/shared';
import { getDb } from '../db/index.js';

type UserRow = {
  id: string;
  name: string;
  color: string;
  avatar: string;
  is_admin: number;
  sort_order: number;
};

function rowToUser(row: UserRow): User {
  return UserSchema.parse({
    id: row.id,
    name: row.name,
    color: row.color,
    avatar: row.avatar,
    isAdmin: row.is_admin === 1,
    sortOrder: row.sort_order,
  });
}

export function listUsers(): User[] {
  const rows = getDb()
    .prepare('SELECT * FROM users ORDER BY sort_order, created_at')
    .all() as UserRow[];
  return rows.map(rowToUser);
}

export function createUser(input: UserCreate): User {
  const valid = UserCreateSchema.parse(input);
  const id = crypto.randomUUID();
  const maxOrder = getDb()
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM users')
    .get() as { m: number };
  getDb()
    .prepare(
      'INSERT INTO users (id, name, color, avatar, is_admin, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      valid.name,
      valid.color,
      valid.avatar ?? '',
      valid.isAdmin ? 1 : 0,
      valid.sortOrder ?? maxOrder.m + 1,
    );
  return getUser(id);
}

export function getUser(id: string): User {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined;
  if (!row) throw Object.assign(new Error('User not found'), { status: 404 });
  return rowToUser(row);
}

export function patchUser(id: string, patch: UserPatch): User {
  const valid = UserPatchSchema.parse(patch);
  const current = getUser(id);
  const next = { ...current, ...valid };
  getDb()
    .prepare(
      'UPDATE users SET name = ?, color = ?, avatar = ?, is_admin = ?, sort_order = ? WHERE id = ?',
    )
    .run(next.name, next.color, next.avatar, next.isAdmin ? 1 : 0, next.sortOrder, id);
  return getUser(id);
}

export function deleteUser(id: string): void {
  const result = getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }
}

export function replaceAllUsers(users: User[]): void {
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO users (id, name, color, avatar, is_admin, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
  );
  db.transaction(() => {
    db.prepare('DELETE FROM users').run();
    for (const u of users) {
      insert.run(u.id, u.name, u.color, u.avatar, u.isAdmin ? 1 : 0, u.sortOrder);
    }
  })();
}
