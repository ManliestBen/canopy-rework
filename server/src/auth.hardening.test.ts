import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { closeDb, openTestDb } from './db/index.js';
import * as gmail from './services/gmail.js';

const REMOTE = { 'x-canopy-test-remote': '192.168.1.50' } as const;

describe('PIN-change hardening', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  it('forbids a remote peer from creating the initial PIN', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/pin').set(REMOTE).send({ newPin: '4321' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('panel_only');
    expect((await request(app).get('/api/auth/status')).body.hasPin).toBe(false);
  });

  it('lets the panel (loopback) create the initial PIN', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/pin').send({ newPin: '4321' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/auth/status')).body.hasPin).toBe(true);
  });

  it('requires the current PIN when a remote peer changes an existing PIN', async () => {
    const app = createApp();
    await request(app).post('/api/auth/pin').send({ newPin: '4321' }); // panel sets it
    const noCurrent = await request(app)
      .post('/api/auth/pin')
      .set(REMOTE)
      .send({ newPin: '9999' });
    expect(noCurrent.status).toBe(403);
    const withCurrent = await request(app)
      .post('/api/auth/pin')
      .set(REMOTE)
      .send({ currentPin: '4321', newPin: '9999' });
    expect(withCurrent.status).toBe(200);
  });

  it('wires the login rate limiter onto the PIN-change route', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/pin').send({ newPin: '4321' });
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });
});

describe('test-email hardening', () => {
  beforeEach(() => openTestDb());
  afterEach(() => {
    vi.restoreAllMocks();
    closeDb();
  });

  it('rejects a test send when no recipient is configured', async () => {
    const app = createApp();
    const res = await request(app).post('/api/email/test').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('no_recipient');
  });

  it('sends only to configured recipients, ignoring an arbitrary "to"', async () => {
    const app = createApp();
    await request(app).patch('/api/settings').send({ digestEmails: 'known@example.com' });
    const spy = vi.spyOn(gmail, 'sendEmail').mockResolvedValue();

    const res = await request(app)
      .post('/api/email/test')
      .send({ to: 'attacker@evil.com' });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toEqual(['known@example.com']);
    expect(JSON.stringify(spy.mock.calls[0])).not.toContain('attacker@evil.com');
  });
});
