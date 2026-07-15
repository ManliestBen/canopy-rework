import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from '../db/index.js';

/**
 * Trust model:
 * - The wall panel runs its browser on the same machine as the server, so
 *   loopback requests are trusted (the kiosk never types a password).
 * - Anything else on the LAN must present a session cookie obtained via
 *   PIN login (Phase 1). Until a PIN is configured, remote access is
 *   read-nothing: every non-loopback request is rejected.
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const SESSION_COOKIE = 'canopy_session';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function isLoopback(req: Request): boolean {
  // Test-only seam: vitest sets VITEST=true; production never runs under it.
  // supertest always connects over loopback, so this lets integration tests
  // simulate a non-loopback (remote) peer to exercise the PIN boundary.
  const testOverride = process.env.VITEST ? req.headers['x-canopy-test-remote'] : undefined;
  const addr = typeof testOverride === 'string' ? testOverride : req.socket.remoteAddress;
  return LOOPBACK.has(addr ?? '');
}

function hasValidSession(req: Request): boolean {
  const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (!token) return false;
  const row = getDb()
    .prepare(
      `SELECT 1 FROM auth_sessions
       WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    )
    .get(hashToken(token));
  return row !== undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isLoopback(req) || hasValidSession(req)) {
    next();
    return;
  }
  res.status(401).json({
    error: 'Sign in from the Canopy panel, or log in with the family PIN.',
    code: 'unauthorized',
  });
}
