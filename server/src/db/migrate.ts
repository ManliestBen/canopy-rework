import type Database from 'better-sqlite3';
import { logger } from '../logger.js';

/**
 * Ordered, versioned migrations tracked via PRAGMA user_version.
 * Append-only: never edit a shipped migration; add a new one.
 */
const MIGRATIONS: string[] = [
  // 1 — core settings + users
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  CREATE TABLE users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    avatar     TEXT NOT NULL DEFAULT '',
    is_admin   INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;

  CREATE TABLE auth_sessions (
    token_hash TEXT PRIMARY KEY,
    label      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at TEXT
  ) STRICT;
  `,

  // 2 — calendar sources + last-good event cache
  `
  CREATE TABLE calendars (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('google','ics')),
    source_ref  TEXT NOT NULL UNIQUE,
    color       TEXT NOT NULL,
    user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;

  CREATE TABLE event_cache (
    calendar_id TEXT PRIMARY KEY REFERENCES calendars(id) ON DELETE CASCADE,
    payload     TEXT NOT NULL,
    fetched_at  TEXT NOT NULL
  ) STRICT;
  `,

  // 3 — tasks, chores, rewards
  `
  CREATE TABLE tasks (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    notes        TEXT NOT NULL DEFAULT '',
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    category     TEXT NOT NULL DEFAULT '',
    due_key      TEXT,
    schedule     TEXT NOT NULL DEFAULT 'none'
                 CHECK (schedule IN ('none','daily','weekdays','weekly','monthly')),
    completed_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;

  CREATE TABLE task_completions (
    task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    date_key TEXT NOT NULL,
    PRIMARY KEY (task_id, date_key)
  ) STRICT;

  CREATE TABLE chores (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT '',
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points     INTEGER NOT NULL DEFAULT 1,
    schedule   TEXT NOT NULL DEFAULT 'daily'
               CHECK (schedule IN ('daily','weekdays','weekly')),
    anchor_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;

  CREATE TABLE chore_completions (
    chore_id     TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    date_key     TEXT NOT NULL,
    points       INTEGER NOT NULL,
    user_id      TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (chore_id, date_key)
  ) STRICT;

  CREATE TABLE reward_redemptions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points     INTEGER NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;
  `,

  // 4 — shopping lists + meal planner
  `
  CREATE TABLE lists (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    emoji      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;

  CREATE TABLE list_items (
    id          TEXT PRIMARY KEY,
    list_id     TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;

  CREATE TABLE meals (
    id       TEXT PRIMARY KEY,
    date_key TEXT NOT NULL,
    slot     TEXT NOT NULL CHECK (slot IN ('breakfast','lunch','dinner')),
    name     TEXT NOT NULL,
    notes    TEXT NOT NULL DEFAULT '',
    UNIQUE (date_key, slot)
  ) STRICT;

  CREATE TABLE item_history (
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;
  `,

  // 5 — generic last-good cache (weather now; future integrations too)
  `
  CREATE TABLE kv_cache (
    key        TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  ) STRICT;
  `,
];

export function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const sql = MIGRATIONS[v];
    if (!sql) continue;
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${v + 1}`);
    })();
    logger.info({ from: v, to: v + 1 }, 'applied migration');
  }
}
