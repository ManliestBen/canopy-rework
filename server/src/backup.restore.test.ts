import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backup } from '@canopy/shared';
import { createApp } from './app.js';
import { closeDb, openTestDb } from './db/index.js';
import * as usersService from './services/users.js';

async function makeUser(app: ReturnType<typeof createApp>, name: string, color: string) {
  const res = await request(app).post('/api/users').send({ name, color });
  return res.body.id as string;
}

async function makeChore(app: ReturnType<typeof createApp>, userId: string, title: string) {
  return request(app)
    .post('/api/chores')
    .send({ title, userId, schedule: 'daily', anchorKey: '2026-01-01' });
}

describe('backup restore', () => {
  beforeEach(() => openTestDb());
  afterEach(() => {
    vi.restoreAllMocks();
    closeDb();
  });

  it('preserves chores when restoring users with unchanged IDs', async () => {
    const app = createApp();
    const uid = await makeUser(app, 'Harper', 'lavender');
    await makeChore(app, uid, 'Make bed');

    const backup = (await request(app).get('/api/backup')).body as Backup;
    const restore = await request(app).post('/api/backup/restore').send(backup);
    expect(restore.status).toBe(200);

    // The chore must survive — same user ID means no DELETE, no cascade.
    const chores = await request(app).get('/api/chores');
    expect(chores.body.map((c: { title: string }) => c.title)).toContain('Make bed');
    expect(chores.body).toHaveLength(1);
  });

  it('deletes a user (and its chores) that the backup omits', async () => {
    const app = createApp();
    const a = await makeUser(app, 'Ann', 'teal');
    const b = await makeUser(app, 'Ben', 'coral');
    await makeChore(app, a, 'A chore');
    await makeChore(app, b, 'B chore');

    const backup = (await request(app).get('/api/backup')).body as Backup;
    // Restore a backup that drops Ben.
    backup.users = backup.users.filter((u) => u.id !== b);
    await request(app).post('/api/backup/restore').send(backup);

    const users = await request(app).get('/api/users');
    expect(users.body.map((u: { id: string }) => u.id)).toEqual([a]);
    const chores = await request(app).get('/api/chores');
    const titles = chores.body.map((c: { title: string }) => c.title);
    expect(titles).toContain('A chore'); // Ann kept
    expect(titles).not.toContain('B chore'); // Ben's chore cascade-deleted
  });

  it('rolls back settings if the users portion throws (atomic)', async () => {
    const app = createApp();
    await request(app).patch('/api/settings').send({ familyName: 'Original' });
    const backup = (await request(app).get('/api/backup')).body as Backup;
    backup.settings = { ...backup.settings, familyName: 'Should Not Persist' };

    // Force the users write to fail mid-restore.
    vi.spyOn(usersService, 'restoreUsers').mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await request(app).post('/api/backup/restore').send(backup);
    expect(res.status).toBe(500);
    // Settings must be unchanged — the whole transaction rolled back.
    const settings = await request(app).get('/api/settings');
    expect(settings.body.familyName).toBe('Original');
  });

  it('round-trips settings and users into a fresh database', async () => {
    const app = createApp();
    await request(app).patch('/api/settings').send({ familyName: 'The Testers' });
    await makeUser(app, 'Mo', 'marigold');
    const backup = (await request(app).get('/api/backup')).body as Backup;

    closeDb();
    openTestDb();
    const app2 = createApp();
    const restore = await request(app2).post('/api/backup/restore').send(backup);
    expect(restore.body.restoredUsers).toBe(1);
    expect((await request(app2).get('/api/settings')).body.familyName).toBe('The Testers');
    expect((await request(app2).get('/api/users')).body[0].name).toBe('Mo');
  });
});
