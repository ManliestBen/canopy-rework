import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { closeDb, openTestDb } from './db/index.js';

async function makeUser(app: ReturnType<typeof createApp>, name: string, color: string) {
  const res = await request(app).post('/api/users').send({ name, color });
  return res.body.id as string;
}

describe('tasks', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  it('creates and toggles a one-time task', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Call plumber', category: 'Home', dueKey: '2026-07-20' });
    expect(created.status).toBe(201);
    expect(created.body.completedAt).toBeNull();

    const toggled = await request(app).post(`/api/tasks/${created.body.id}/toggle`).send({});
    expect(toggled.body.completedAt).not.toBeNull();
    const untoggled = await request(app)
      .post(`/api/tasks/${created.body.id}/toggle`)
      .send({});
    expect(untoggled.body.completedAt).toBeNull();
  });

  it('recurring tasks complete per-day', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Water plants', schedule: 'daily', dueKey: '2026-07-01' });

    // Needs a dateKey.
    expect(
      (await request(app).post(`/api/tasks/${created.body.id}/toggle`).send({})).status,
    ).toBe(400);

    const day1 = await request(app)
      .post(`/api/tasks/${created.body.id}/toggle`)
      .send({ dateKey: '2026-07-15' });
    expect(day1.body.completedKeys).toEqual(['2026-07-15']);

    const day2 = await request(app)
      .post(`/api/tasks/${created.body.id}/toggle`)
      .send({ dateKey: '2026-07-16' });
    expect(day2.body.completedKeys).toHaveLength(2);

    const undo = await request(app)
      .post(`/api/tasks/${created.body.id}/toggle`)
      .send({ dateKey: '2026-07-15' });
    expect(undo.body.completedKeys).toEqual(['2026-07-16']);
  });

  it('assignee survives user deletion as unassigned (ON DELETE SET NULL)', async () => {
    const app = createApp();
    const userId = await makeUser(app, 'Kid', 'green');
    const task = await request(app)
      .post('/api/tasks')
      .send({ title: 'Clean room', userId });
    await request(app).delete(`/api/users/${userId}`);
    const list = await request(app).get('/api/tasks');
    const found = list.body.find((t: { id: string }) => t.id === task.body.id);
    expect(found.userId).toBeNull();
  });
});

describe('chores & rewards', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  it('builds the day chart from schedules', async () => {
    const app = createApp();
    const kid = await makeUser(app, 'Harper', 'lavender');
    await request(app).post('/api/chores').send({
      title: 'Make bed',
      userId: kid,
      schedule: 'daily',
      anchorKey: '2026-01-01',
      points: 2,
      icon: '🛏️',
    });
    await request(app).post('/api/chores').send({
      title: 'Take out trash',
      userId: kid,
      schedule: 'weekly',
      anchorKey: '2026-07-13', // a Monday
    });

    const wednesday = await request(app).get('/api/chores/day?date=2026-07-15');
    expect(wednesday.body.chores).toHaveLength(1); // only daily
    const monday = await request(app).get('/api/chores/day?date=2026-07-20');
    expect(monday.body.chores).toHaveLength(2);
  });

  it('toggling chores earns points; redemptions reduce balance', async () => {
    const app = createApp();
    const kid = await makeUser(app, 'Liam', 'green');
    const chore = await request(app).post('/api/chores').send({
      title: 'Homework',
      userId: kid,
      schedule: 'daily',
      anchorKey: '2026-01-01',
      points: 3,
    });

    await request(app).post(`/api/chores/${chore.body.id}/toggle`).send({ date: '2026-07-14' });
    await request(app).post(`/api/chores/${chore.body.id}/toggle`).send({ date: '2026-07-15' });

    let rewards = await request(app).get('/api/rewards');
    let entry = rewards.body.users.find((u: { userId: string }) => u.userId === kid);
    expect(entry.earnedTotal).toBe(6);
    expect(entry.balance).toBe(6);

    await request(app)
      .post('/api/rewards/redeem')
      .send({ userId: kid, points: 4, note: 'Ice cream' });
    rewards = await request(app).get('/api/rewards');
    entry = rewards.body.users.find((u: { userId: string }) => u.userId === kid);
    expect(entry.balance).toBe(2);
    expect(rewards.body.recentRedemptions[0].note).toBe('Ice cream');
  });

  it('untoggling removes the earned points', async () => {
    const app = createApp();
    const kid = await makeUser(app, 'Ella', 'pink');
    const chore = await request(app).post('/api/chores').send({
      title: 'Feed cat',
      userId: kid,
      schedule: 'daily',
      anchorKey: '2026-01-01',
      points: 5,
    });
    await request(app).post(`/api/chores/${chore.body.id}/toggle`).send({ date: '2026-07-15' });
    await request(app).post(`/api/chores/${chore.body.id}/toggle`).send({ date: '2026-07-15' });
    const rewards = await request(app).get('/api/rewards');
    const entry = rewards.body.users.find((u: { userId: string }) => u.userId === kid);
    expect(entry?.earnedTotal ?? 0).toBe(0);
  });

  it('completed history keeps its points when the chore is edited', async () => {
    const app = createApp();
    const kid = await makeUser(app, 'Max', 'blue');
    const chore = await request(app).post('/api/chores').send({
      title: 'Dishes',
      userId: kid,
      schedule: 'daily',
      anchorKey: '2026-01-01',
      points: 2,
    });
    await request(app).post(`/api/chores/${chore.body.id}/toggle`).send({ date: '2026-07-15' });
    await request(app).patch(`/api/chores/${chore.body.id}`).send({ points: 50 });
    const rewards = await request(app).get('/api/rewards');
    const entry = rewards.body.users.find((u: { userId: string }) => u.userId === kid);
    expect(entry.earnedTotal).toBe(2); // snapshot, not retroactive
  });
});
