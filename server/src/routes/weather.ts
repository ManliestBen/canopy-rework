import { Router } from 'express';
import { wrap } from '../lib/asyncRoute.js';
import { getWeather, refreshWeather } from '../services/weather.js';

export const weatherRouter = Router();

weatherRouter.get('/', (_req, res) => {
  res.json(getWeather());
});

/** Called after the location setting changes so the chip updates now. */
weatherRouter.post(
  '/refresh',
  wrap(async (_req, res) => {
    await refreshWeather();
    res.json(getWeather());
  }),
);
