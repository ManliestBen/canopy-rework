import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CalendarEvent, Task } from '@canopy/shared';
import { createApp } from './app.js';
import { closeDb, openTestDb } from './db/index.js';
import { composeDigest } from './services/digest.js';
import { buildRawMessage } from './services/gmail.js';

describe('announcements', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  it('posts, lists, and removes sticky notes', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/announcements')
      .send({ text: "Dinner's ready! 🍝", emoji: '🍝' });
    expect(created.status).toBe(201);

    const list = await request(app).get('/api/announcements');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].text).toBe("Dinner's ready! 🍝");

    await request(app).delete(`/api/announcements/${created.body.id}`);
    expect((await request(app).get('/api/announcements')).body).toHaveLength(0);
  });

  it('expired notes fall off the list', async () => {
    const app = createApp();
    // Directly insert an already-expired row (API minimum is 15 minutes).
    const { getDb } = await import('./db/index.js');
    getDb()
      .prepare(
        `INSERT INTO announcements (id, text, expires_at)
         VALUES ('00000000-0000-4000-8000-000000000001', 'Old news', '2020-01-01T00:00:00Z')`,
      )
      .run();
    const list = await request(app).get('/api/announcements');
    expect(list.body).toHaveLength(0);
  });

  it('email status reports unconfigured without creds', async () => {
    const app = createApp();
    const res = await request(app).get('/api/email/status');
    expect(res.body.configured).toBe(false);
  });

  it('test email returns 503 when Gmail is not configured', async () => {
    const app = createApp();
    // A recipient must be configured first; then the send fails because Gmail
    // itself is not set up in tests.
    await request(app).patch('/api/settings').send({ digestEmails: 'a@b.com' });
    const res = await request(app).post('/api/email/test').send({});
    expect(res.status).toBe(503);
  });
});

describe('digest composition', () => {
  const event = (over: Partial<CalendarEvent>): CalendarEvent => ({
    id: 'e',
    calendarId: '11111111-1111-4111-8111-111111111111',
    calendarTitle: 'Family',
    color: 'teal',
    userId: null,
    title: 'Event',
    allDay: false,
    start: '2026-07-15T14:00:00.000Z',
    end: '2026-07-15T15:00:00.000Z',
    startKey: '2026-07-15',
    endKey: '2026-07-15',
    readOnly: false,
    ...over,
  });
  const task = (over: Partial<Task>): Task => ({
    id: 't',
    title: 'Task',
    notes: '',
    userId: null,
    category: '',
    dueKey: null,
    schedule: 'none',
    completedAt: null,
    completedKeys: [],
    ...over,
  });

  it('lists events chronologically with all-day first, and due tasks', () => {
    const text = composeDigest(
      '2026-07-15',
      'The Manleys',
      [
        event({ title: 'Dentist', start: '2026-07-15T19:00:00.000Z' }),
        event({ title: 'Camp day', allDay: true }),
      ],
      [
        task({ title: 'Water plants', schedule: 'daily', dueKey: '2026-01-01' }),
        task({ title: 'Renew tabs', dueKey: '2026-07-10' }), // overdue
        task({ title: 'Done thing', dueKey: '2026-07-15', completedAt: 'x' }),
      ],
    );
    expect(text).toContain('The Manleys');
    expect(text.indexOf('Camp day')).toBeLessThan(text.indexOf('Dentist'));
    expect(text).toContain('Water plants');
    expect(text).toContain('Renew tabs (since Jul 10)');
    expect(text).not.toContain('Done thing');
  });

  it('handles empty days gracefully', () => {
    const text = composeDigest('2026-07-15', 'Us', [], []);
    expect(text).toContain('Nothing on the calendar');
    expect(text).toContain('All caught up');
  });

  it('skips recurring tasks already completed today', () => {
    const text = composeDigest('2026-07-15', 'Us', [], [
      task({
        title: 'Feed cat',
        schedule: 'daily',
        dueKey: '2026-01-01',
        completedKeys: ['2026-07-15'],
      }),
    ]);
    expect(text).not.toContain('Feed cat');
  });
});

describe('buildRawMessage', () => {
  it('produces base64url RFC2822 with UTF-8-safe subject and body', () => {
    const raw = buildRawMessage(['a@b.com'], 'Canopy 🌳 test', 'Hëllo wörld');
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('To: a@b.com');
    expect(decoded).toContain('Subject: =?UTF-8?B?');
    expect(decoded).toContain('Content-Type: text/plain; charset=UTF-8');
    // Body round-trips through its base64 layer.
    const bodyB64 = decoded.split('\r\n\r\n')[1]!;
    expect(Buffer.from(bodyB64, 'base64').toString('utf8')).toBe('Hëllo wörld');
    // base64url alphabet only (no +, /, =).
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
