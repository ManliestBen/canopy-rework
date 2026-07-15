import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapDatabase } from './bootstrap.js';
import { closeDb, getDb } from './index.js';

// Each case uses a throwaway directory so we exercise the real filesystem
// path (dir creation, first-run detection, migrations, permissions).
const tmpDirs: string[] = [];
function freshDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-bootstrap-'));
  tmpDirs.push(dir);
  return path.join(dir, 'nested', 'canopy.db');
}

afterEach(() => {
  closeDb();
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('bootstrapDatabase', () => {
  it('creates the directory and a migrated database on first run', () => {
    const dbPath = freshDbPath();
    const result = bootstrapDatabase(dbPath);
    expect(result.created).toBe(true);
    expect(fs.existsSync(dbPath)).toBe(true);
    // A migrated DB has the users table — prove migrations ran.
    const row = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();
    expect(row).toBeDefined();
  });

  it('is idempotent — reports not-created on a second run', () => {
    const dbPath = freshDbPath();
    expect(bootstrapDatabase(dbPath).created).toBe(true);
    closeDb();
    expect(bootstrapDatabase(dbPath).created).toBe(false);
  });

  it('locks down the database directory and file (POSIX)', () => {
    if (process.platform === 'win32') return; // perms not enforced on Windows
    const dbPath = freshDbPath();
    bootstrapDatabase(dbPath);
    const dirMode = fs.statSync(path.dirname(dbPath)).mode & 0o777;
    const fileMode = fs.statSync(dbPath).mode & 0o777;
    expect(dirMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
  });
});
