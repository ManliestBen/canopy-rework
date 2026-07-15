import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { closeDb, openTestDb } from './db/index.js';

describe('users', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  it('creates, lists, updates, and deletes users', async () => {
    const app = createApp();

    const created = await request(app)
      .post('/api/users')
      .send({ name: 'Ella', color: 'pink', avatar: '🦄' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Ella');
    expect(created.body.id).toMatch(/[0-9a-f-]{36}/);

    await request(app).post('/api/users').send({ name: 'Dad', color: 'teal' });
    const list = await request(app).get('/api/users');
    expect(list.body).toHaveLength(2);
    expect(list.body.map((u: { name: string }) => u.name)).toEqual(['Ella', 'Dad']);

    const patched = await request(app)
      .patch(`/api/users/${created.body.id}`)
      .send({ color: 'lavender' });
    expect(patched.body.color).toBe('lavender');

    const del = await request(app).delete(`/api/users/${created.body.id}`);
    expect(del.body.ok).toBe(true);
    const after = await request(app).get('/api/users');
    expect(after.body).toHaveLength(1);
  });

  it('rejects bad colors and missing names', async () => {
    const app = createApp();
    expect(
      (await request(app).post('/api/users').send({ name: 'X', color: 'neon' })).status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/users').send({ color: 'teal' })).status,
    ).toBe(400);
  });

  it('404s on unknown user ids', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/users/00000000-0000-4000-8000-000000000000')
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('PIN auth', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  it('reports status, sets a PIN, logs in, and logs out', async () => {
    const app = createApp();

    const before = await request(app).get('/api/auth/status');
    expect(before.body).toMatchObject({ isPanel: true, hasPin: false });

    expect((await request(app).post('/api/auth/pin').send({ newPin: '4321' })).status).toBe(
      200,
    );
    expect((await request(app).get('/api/auth/status')).body.hasPin).toBe(true);

    const bad = await request(app).post('/api/auth/login').send({ pin: '9999' });
    expect(bad.status).toBe(401);

    const good = await request(app).post('/api/auth/login').send({ pin: '4321' });
    expect(good.status).toBe(200);
    const cookie = good.headers['set-cookie']?.[0];
    expect(cookie).toContain('canopy_session=');
    expect(cookie).toContain('HttpOnly');

    const status = await request(app).get('/api/auth/status').set('Cookie', cookie!);
    expect(status.body.authenticated).toBe(true);

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie!);
    expect(out.body.ok).toBe(true);
    const statusAfter = await request(app).get('/api/auth/status').set('Cookie', cookie!);
    expect(statusAfter.body.authenticated).toBe(false);
  });

  it('changing an existing PIN from the panel does not need the current PIN (loopback trust)', async () => {
    const app = createApp();
    await request(app).post('/api/auth/pin').send({ newPin: '1111' });
    const res = await request(app).post('/api/auth/pin').send({ newPin: '2222' });
    expect(res.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ pin: '2222' })).status).toBe(
      200,
    );
  });

  it('rejects malformed PINs', async () => {
    const app = createApp();
    expect(
      (await request(app).post('/api/auth/pin').send({ newPin: 'abcd' })).status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/auth/pin').send({ newPin: '12' })).status,
    ).toBe(400);
  });
});

describe('backup & restore', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  it('round-trips settings and users through a backup file', async () => {
    const app = createApp();
    await request(app)
      .patch('/api/settings')
      .send({ familyName: 'The Testers', themeMode: 'bold-dark' });
    await request(app).post('/api/users').send({ name: 'Mo', color: 'marigold' });

    const backup = await request(app).get('/api/backup');
    expect(backup.body.kind).toBe('canopy-backup');
    expect(backup.body.users).toHaveLength(1);

    // Wipe: restore into a fresh database.
    closeDb();
    openTestDb();
    const app2 = createApp();
    const restore = await request(app2).post('/api/backup/restore').send(backup.body);
    expect(restore.status).toBe(200);
    expect(restore.body.restoredUsers).toBe(1);

    expect((await request(app2).get('/api/settings')).body.familyName).toBe('The Testers');
    expect((await request(app2).get('/api/users')).body[0].name).toBe('Mo');
  });

  it('rejects a file that is not a canopy backup', async () => {
    const app = createApp();
    const res = await request(app).post('/api/backup/restore').send({ kind: 'nope' });
    expect(res.status).toBe(400);
  });

  it('backup never contains the PIN hash', async () => {
    const app = createApp();
    await request(app).post('/api/auth/pin').send({ newPin: '5555' });
    const backup = await request(app).get('/api/backup');
    expect(JSON.stringify(backup.body)).not.toContain('__pin__');
    expect(JSON.stringify(backup.body)).not.toContain('hash');
  });
});
