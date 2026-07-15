import crypto from 'node:crypto';
import { getDb } from '../db/index.js';

/**
 * The family PIN is stored as scrypt(pin, salt) in its own settings key.
 * It is NEVER part of the Settings schema, so it can't leak through
 * GET /api/settings or a backup file.
 */
const PIN_KEY = '__pin__';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;

function scryptHash(pin: string, salt: Buffer): Buffer {
  return crypto.scryptSync(pin, salt, KEY_LEN, SCRYPT_PARAMS);
}

export function hasPin(): boolean {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(PIN_KEY);
  return row !== undefined;
}

export function setPin(pin: string): void {
  const salt = crypto.randomBytes(16);
  const hash = scryptHash(pin, salt);
  const value = JSON.stringify({
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
  });
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(PIN_KEY, value);
}

export function verifyPin(pin: string): boolean {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(PIN_KEY) as
    | { value: string }
    | undefined;
  if (!row) return false;
  try {
    const { salt, hash } = JSON.parse(row.value) as { salt: string; hash: string };
    const expected = Buffer.from(hash, 'base64');
    const actual = scryptHash(pin, Buffer.from(salt, 'base64'));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Create a session; returns the raw token (only ever sent to the client). */
export function createSession(label: string, ttlDays = 90): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  getDb()
    .prepare(
      `INSERT INTO auth_sessions (token_hash, label, expires_at)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now', ?))`,
    )
    .run(tokenHash, label, `+${ttlDays} days`);
  return token;
}

export function destroySession(token: string): void {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  getDb().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
}
