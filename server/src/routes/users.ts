import { Router } from 'express';
import { z } from 'zod';
import { createUser, deleteUser, listUsers, patchUser } from '../services/users.js';

export const usersRouter = Router();

const IdParam = z.string().uuid();

usersRouter.get('/', (_req, res) => {
  res.json(listUsers());
});

usersRouter.post('/', (req, res) => {
  res.status(201).json(createUser(req.body));
});

usersRouter.patch('/:id', (req, res) => {
  res.json(patchUser(IdParam.parse(req.params.id), req.body));
});

usersRouter.delete('/:id', (req, res) => {
  deleteUser(IdParam.parse(req.params.id));
  res.json({ ok: true });
});
