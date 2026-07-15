import { Router } from 'express';
import { z } from 'zod';
import { DATE_KEY_REGEX } from '@canopy/shared';
import {
  createTask,
  deleteTask,
  listTasks,
  patchTask,
  toggleTask,
} from '../services/tasks.js';

export const tasksRouter = Router();

const IdParam = z.string().uuid();
const ToggleSchema = z.object({
  dateKey: z.string().regex(DATE_KEY_REGEX).nullable().default(null),
});

tasksRouter.get('/', (_req, res) => {
  res.json(listTasks());
});

tasksRouter.post('/', (req, res) => {
  res.status(201).json(createTask(req.body));
});

tasksRouter.patch('/:id', (req, res) => {
  res.json(patchTask(IdParam.parse(req.params.id), req.body));
});

tasksRouter.delete('/:id', (req, res) => {
  deleteTask(IdParam.parse(req.params.id));
  res.json({ ok: true });
});

tasksRouter.post('/:id/toggle', (req, res) => {
  const { dateKey } = ToggleSchema.parse(req.body ?? {});
  res.json(toggleTask(IdParam.parse(req.params.id), dateKey));
});
