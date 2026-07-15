import { Router } from 'express';
import { z } from 'zod';
import { DATE_KEY_REGEX, ItemsAddSchema, MealSchema, weekKeys } from '@canopy/shared';
import {
  addItems,
  clearCompleted,
  createList,
  deleteItem,
  deleteList,
  frequentItems,
  listLists,
  mealsForDays,
  patchItem,
  patchList,
  setMeal,
} from '../services/lists.js';

export const listsRouter = Router();
export const mealsRouter = Router();

const IdParam = z.string().uuid();

listsRouter.get('/', (_req, res) => {
  res.json(listLists());
});

listsRouter.post('/', (req, res) => {
  res.status(201).json(createList(req.body));
});

listsRouter.patch('/:id', (req, res) => {
  res.json(patchList(IdParam.parse(req.params.id), req.body));
});

listsRouter.delete('/:id', (req, res) => {
  deleteList(IdParam.parse(req.params.id));
  res.json({ ok: true });
});

listsRouter.post('/:id/items', (req, res) => {
  const { items } = ItemsAddSchema.parse(req.body);
  addItems(IdParam.parse(req.params.id), items);
  res.status(201).json({ ok: true, added: items.length });
});

listsRouter.post('/:id/clear-completed', (req, res) => {
  res.json({ ok: true, cleared: clearCompleted(IdParam.parse(req.params.id)) });
});

listsRouter.get('/:id/frequent', (req, res) => {
  res.json(frequentItems(IdParam.parse(req.params.id)));
});

listsRouter.patch('/items/:itemId', (req, res) => {
  patchItem(IdParam.parse(req.params.itemId), req.body);
  res.json({ ok: true });
});

listsRouter.delete('/items/:itemId', (req, res) => {
  deleteItem(IdParam.parse(req.params.itemId));
  res.json({ ok: true });
});

// ---- Meals -------------------------------------------------------------

const WeekQuery = z.object({ week: z.string().regex(DATE_KEY_REGEX) });

mealsRouter.get('/', (req, res) => {
  const { week } = WeekQuery.parse(req.query);
  res.json(mealsForDays(weekKeys(week)));
});

mealsRouter.put('/', (req, res) => {
  setMeal(MealSchema.parse(req.body));
  res.json({ ok: true });
});
