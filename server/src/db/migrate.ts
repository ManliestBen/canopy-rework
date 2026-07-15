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
