import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { closeDb, getDb, openTestDb } from './db/index.js';
import { hashToken } from './auth/middleware.js';

// supertest always connects over loopback, so every server test is "the
// panel". The x-canopy-test-remote seam (honored only under VITEST) lets us
// pose as a phone on the LAN and exercise the real PIN access boundary.
const REMOTE = { 'x-canopy-test-remote': '192.168.1.50' } as const;

describe('remote auth boundary', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  async function setPanelPin(app: ReturnType<typeof createApp>, pin: string) {
    // No REMOTE header → looks like the panel (loopback), which may set the PIN.
    await request(app).post('/api/auth/pin').send({ newPin: pin });
  }

  it('rejects an unauthenticated remote peer on every feature router', async () => {
    const app = createApp();
    await setPanelPin(app, '4321');

    const paths = [
      '/api/settings',
      '/api/users',
      '/api/events?from=2026-07-01&to=2026-07-02',
      '/api/backup',
      '/api/tasks',
    ];
    for (const path of paths) {
      const res = await request(app).get(path).set(REMOTE);
      expect(res.status, path).toBe(401);
      expect(res.body.code, path).toBe('unauthorized');
    }
    const post = await request(app).post('/api/tasks').set(REMOTE).send({ title: 'x' });
    expect(post.status).toBe(401);
  });

  it('allows a remote peer to reach only health and auth status pre-login', async () => {
    const app = createApp();
    const health = await request(app).get('/api/health').set(REMOTE);
    expect(health.status).toBe(200);
    const status = await request(app).get('/api/auth/status').set(REMOTE);
    expect(status.status).toBe(200);
    expect(status.body.isPanel).toBe(false);
  });

  it('lets a remote peer through after a valid PIN login', async () => {
    const app = createApp();
    await setPanelPin(app, '4321');

    const login = await request(app).post('/api/auth/login').set(REMOTE).send({ pin: '4321' });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie']![0]!;

    const ok = await request(app).get('/api/settings').set(REMOTE).set('Cookie', cookie);
    expect(ok.status).toBe(200);
  });

  it('rejects a wrong PIN from a remote peer with no cookie issued', async () => {
    const app = createApp();
    await setPanelPin(app, '4321');
    const res = await request(app).post('/api/auth/login').set(REMOTE).send({ pin: '0000' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects an expired session token', async () => {
    const app = createApp();
    await setPanelPin(app, '4321');
    // Insert a session whose expiry is a day in the past.
    const token = 'expired-token-under-test';
    getDb()
      .prepare(
        `INSERT INTO auth_sessions (token_hash, label, expires_at)
         VALUES (?, 'expired', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 days'))`,
      )
      .run(hashToken(token));
    const res = await request(app)
      .get('/api/settings')
      .set(REMOTE)
      .set('Cookie', `canopy_session=${token}`);
    expect(res.status).toBe(401);
  });

  it('invalidates the session for remote callers after logout', async () => {
    const app = createApp();
    await setPanelPin(app, '4321');
    const login = await request(app).post('/api/auth/login').set(REMOTE).send({ pin: '4321' });
    const cookie = login.headers['set-cookie']![0]!;

    await request(app).post('/api/auth/logout').set(REMOTE).set('Cookie', cookie);
    const after = await request(app).get('/api/settings').set(REMOTE).set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('locks out remote access entirely until a PIN is configured', async () => {
    const app = createApp();
    const res = await request(app).get('/api/settings').set(REMOTE);
    expect(res.status).toBe(401);
  });
});
