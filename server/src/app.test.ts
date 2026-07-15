import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { closeDb, openTestDb } from './db/index.js';

describe('server foundations', () => {
  beforeEach(() => {
    openTestDb();
  });
  afterEach(() => {
    closeDb();
  });

  it('reports health without auth', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.integrations).toBeDefined();
  });

  it('serves default settings (supertest runs over loopback → trusted)', async () => {
    const res = await request(createApp()).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.themeMode).toBe('skylight');
    expect(res.body.familyName).toBe('Our Family');
  });

  it('persists a settings patch', async () => {
    const app = createApp();
    const patch = await request(app)
      .patch('/api/settings')
      .send({ familyName: 'The Manleys', themeMode: 'pride', transparency: 60 });
    expect(patch.status).toBe(200);
    expect(patch.body.familyName).toBe('The Manleys');

    const read = await request(app).get('/api/settings');
    expect(read.body.themeMode).toBe('pride');
    expect(read.body.transparency).toBe(60);
  });

  it('rejects invalid settings with a 400 and field-level issues', async () => {
    const res = await request(createApp())
      .patch('/api/settings')
      .send({ transparency: 400, themeMode: 'neon' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_request');
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('rejects unknown settings keys (strict schema)', async () => {
    const res = await request(createApp())
      .patch('/api/settings')
      .send({ hackerField: true });
    expect(res.status).toBe(400);
  });

  it('404s unknown API routes with the uniform envelope', async () => {
    const res = await request(createApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });
});
