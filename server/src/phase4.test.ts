import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { closeDb, openTestDb } from './db/index.js';

describe('shopping lists', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  it('full list lifecycle: create, add items, check off, clear', async () => {
    const app = createApp();
    const list = await request(app)
      .post('/api/lists')
      .send({ title: 'Groceries', emoji: '🛒' });
    expect(list.status).toBe(201);

    await request(app)
      .post(`/api/lists/${list.body.id}/items`)
      .send({ items: ['Milk', 'Eggs', 'Bread'] });
    let all = await request(app).get('/api/lists');
    expect(all.body[0].items).toHaveLength(3);

    const milk = all.body[0].items.find((i: { text: string }) => i.text === 'Milk');
    await request(app).patch(`/api/lists/items/${milk.id}`).send({ done: true });

    const cleared = await request(app).post(`/api/lists/${list.body.id}/clear-completed`);
    expect(cleared.body.cleared).toBe(1);
    all = await request(app).get('/api/lists');
    expect(all.body[0].items).toHaveLength(2);
  });

  it('frequent items surface repeat purchases, excluding open ones', async () => {
    const app = createApp();
    const list = await request(app).post('/api/lists').send({ title: 'Groceries' });
    // Milk bought twice (cleared), bananas open on the list now.
    await request(app)
      .post(`/api/lists/${list.body.id}/items`)
      .send({ items: ['Milk', 'Bananas'] });
    const items1 = (await request(app).get('/api/lists')).body[0].items;
    for (const i of items1) {
      await request(app).patch(`/api/lists/items/${i.id}`).send({ done: true });
    }
    await request(app).post(`/api/lists/${list.body.id}/clear-completed`);
    await request(app)
      .post(`/api/lists/${list.body.id}/items`)
      .send({ items: ['Milk', 'Bananas'] });
    const items2 = (await request(app).get('/api/lists')).body[0].items;
    const milk = items2.find((i: { text: string }) => i.text === 'Milk');
    await request(app).patch(`/api/lists/items/${milk.id}`).send({ done: true });
    await request(app).post(`/api/lists/${list.body.id}/clear-completed`);

    // Milk: added twice, none open → frequent. Bananas: still open → excluded.
    const frequent = await request(app).get(`/api/lists/${list.body.id}/frequent`);
    expect(frequent.body).toContain('Milk');
    expect(frequent.body).not.toContain('Bananas');
  });

  it('items keep working when their assignee is deleted', async () => {
    const app = createApp();
    const user = await request(app).post('/api/users').send({ name: 'Mo', color: 'coral' });
    const list = await request(app).post('/api/lists').send({ title: 'Costco' });
    await request(app).post(`/api/lists/${list.body.id}/items`).send({ items: ['Paper towels'] });
    const item = (await request(app).get('/api/lists')).body[0].items[0];
    await request(app)
      .patch(`/api/lists/items/${item.id}`)
      .send({ assigneeId: user.body.id });
    await request(app).delete(`/api/users/${user.body.id}`);
    const after = (await request(app).get('/api/lists')).body[0].items[0];
    expect(after.assigneeId).toBeNull();
  });
});

describe('meals', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  it('upserts, replaces, and clears meal slots', async () => {
    const app = createApp();
    await request(app)
      .put('/api/meals')
      .send({ dateKey: '2026-07-15', slot: 'dinner', name: 'Tacos', notes: '' });
    await request(app)
      .put('/api/meals')
      .send({ dateKey: '2026-07-15', slot: 'dinner', name: 'Pizza night', notes: 'homemade' });

    let week = await request(app).get('/api/meals?week=2026-07-15');
    expect(week.body).toHaveLength(1);
    expect(week.body[0].name).toBe('Pizza night');

    // Empty name clears the slot.
    await request(app)
      .put('/api/meals')
      .send({ dateKey: '2026-07-15', slot: 'dinner', name: '', notes: '' });
    week = await request(app).get('/api/meals?week=2026-07-15');
    expect(week.body).toHaveLength(0);
  });

  it('week query returns only that week', async () => {
    const app = createApp();
    await request(app)
      .put('/api/meals')
      .send({ dateKey: '2026-07-15', slot: 'dinner', name: 'Tacos', notes: '' });
    await request(app)
      .put('/api/meals')
      .send({ dateKey: '2026-07-25', slot: 'dinner', name: 'Burgers', notes: '' });
    const week = await request(app).get('/api/meals?week=2026-07-15');
    expect(week.body).toHaveLength(1);
    expect(week.body[0].name).toBe('Tacos');
  });
});
