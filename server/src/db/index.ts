import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { migrate } from './migrate.js';

let db: Database.Database | null = null;

/**
 * The database is opened and migrated exactly once, at startup — a boot
 * failure here is loud and immediate rather than surfacing on the first
 * request.
 */
export function openDb(dbPath: string = config.dbPath): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  logger.info({ dbPath }, 'database ready');
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not opened; call openDb() at startup');
  return db;
}

/** Test helper: open an isolated in-memory database. */
export function openTestDb(): Database.Database {
  closeDb();
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
