import { Router } from 'express';
import { z } from 'zod';
import { DATE_KEY_REGEX, RedeemSchema, todayKey } from '@canopy/shared';
import {
  choreDay,
  createChore,
  deleteChore,
  listChores,
  patchChore,
  redeem,
  rewardsSummary,
  toggleChore,
} from '../services/chores.js';

export const choresRouter = Router();
export const rewardsRouter = Router();

const IdParam = z.string().uuid();
const DayQuery = z.object({ date: z.string().regex(DATE_KEY_REGEX) });

choresRouter.get('/', (_req, res) => {
  res.json(listChores());
});

choresRouter.get('/day', (req, res) => {
  const { date } = DayQuery.parse(req.query);
  res.json(choreDay(date));
});

choresRouter.post('/', (req, res) => {
  res.status(201).json(createChore(req.body));
});

choresRouter.patch('/:id', (req, res) => {
  res.json(patchChore(IdParam.parse(req.params.id), req.body));
});

choresRouter.delete('/:id', (req, res) => {
  deleteChore(IdParam.parse(req.params.id));
  res.json({ ok: true });
});

choresRouter.post('/:id/toggle', (req, res) => {
  const { date } = DayQuery.parse(req.body);
  res.json(toggleChore(IdParam.parse(req.params.id), date));
});

rewardsRouter.get('/', (_req, res) => {
  res.json(rewardsSummary(todayKey()));
});

rewardsRouter.post('/redeem', (req, res) => {
  const { userId, points, note } = RedeemSchema.parse(req.body);
  redeem(userId, points, note);
  res.json({ ok: true });
});
