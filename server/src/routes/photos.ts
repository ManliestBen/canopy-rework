import { Router } from 'express';
import { wrap } from '../lib/asyncRoute.js';
import { getPhotos, listFolders, refreshPhotos } from '../services/photos.js';

export const photosRouter = Router();

photosRouter.get('/', (_req, res) => {
  res.json(getPhotos());
});

photosRouter.get(
  '/folders',
  wrap(async (_req, res) => {
    try {
      res.json(await listFolders());
    } catch {
      res.json([]);
    }
  }),
);

photosRouter.post(
  '/refresh',
  wrap(async (_req, res) => {
    await refreshPhotos();
    res.json(getPhotos());
  }),
);
