import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { PinLoginSchema, PinSetSchema } from '@canopy/shared';
import { logger } from '../logger.js';
import { SESSION_COOKIE, hashToken, isLoopback } from './middleware.js';
import { getDb } from '../db/index.js';
import { createSession, destroySession, hasPin, setPin, verifyPin } from './pin.js';

/** Mounted BEFORE requireAuth: status + login must work pre-auth. */
export const authRouter = Router();

// Brute-force protection: a 4-digit PIN survives ~10 guesses/15min for
// only so long, so lock it down hard and log failures.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.', code: 'rate_limited' },
});

authRouter.get('/status', (req, res) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  let authenticated = false;
  if (token) {
    const row = getDb()
      .prepare(
        `SELECT 1 FROM auth_sessions
         WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      )
      .get(hashToken(token));
    authenticated = row !== undefined;
  }
  res.json({ isPanel: isLoopback(req), authenticated, hasPin: hasPin() });
});

authRouter.post('/login', loginLimiter, (req, res) => {
  const { pin } = PinLoginSchema.parse(req.body);
  if (!hasPin() || !verifyPin(pin)) {
    logger.warn({ ip: req.ip }, 'failed PIN login attempt');
    res.status(401).json({ error: 'Wrong PIN', code: 'bad_pin' });
    return;
  }
  const token = createSession(`login ${new Date().toISOString()}`);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 90 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (token) destroySession(token);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

/**
 * Setting/changing the PIN requires being the panel (loopback) or
 * knowing the current PIN — so a guest's phone can't silently re-PIN
 * the house.
 */
authRouter.post('/pin', (req, res) => {
  const { currentPin, newPin } = PinSetSchema.parse(req.body);
  if (hasPin() && !isLoopback(req)) {
    if (!currentPin || !verifyPin(currentPin)) {
      res.status(403).json({ error: 'Current PIN is wrong', code: 'bad_pin' });
      return;
    }
  }
  setPin(newPin);
  logger.info('family PIN updated');
  res.json({ ok: true });
});
