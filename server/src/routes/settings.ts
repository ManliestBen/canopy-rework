import { Router } from 'express';
import { getSettings, patchSettings } from '../services/settings.js';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json(getSettings());
});

settingsRouter.patch('/', (req, res) => {
  res.json(patchSettings(req.body));
});
