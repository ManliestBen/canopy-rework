import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { openDb } from './index.js';

export type BootstrapResult = { dbPath: string; created: boolean };

/**
 * Prepare the SQLite database so the app is self-installing on a fresh Pi:
 * create its directory (private perms), create + migrate the database file on
 * first run, and lock the file down (it holds the family PIN hash). Safe to
 * call on every boot — it is a no-op when the database already exists. This is
 * what removes any manual "put the db file here" step.
 */
export function bootstrapDatabase(dbPath: string = config.dbPath): BootstrapResult {
  // In-memory databases (tests) need no filesystem setup.
  if (dbPath === ':memory:') {
    openDb(dbPath);
    return { dbPath, created: false };
  }

  const created = !fs.existsSync(dbPath);
  const dir = path.dirname(dbPath);

  // Private directory (owner-only). recursive:true won't tighten an existing
  // dir, so also chmod best-effort; both are no-ops for perms on Windows.
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Non-POSIX filesystem — permissions aren't enforced here anyway.
  }

  // Opens, applies migrations, and creates the file if missing.
  openDb(dbPath);

  // Lock down the db and its WAL/SHM sidecars (they mirror its contents).
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      if (fs.existsSync(dbPath + suffix)) fs.chmodSync(dbPath + suffix, 0o600);
    } catch {
      // Best-effort; skip where chmod is unsupported.
    }
  }

  if (created) {
    logger.info({ dbPath }, 'created a new Canopy database');
  } else {
    logger.info({ dbPath }, 'using existing Canopy database');
  }
  return { dbPath, created };
}
