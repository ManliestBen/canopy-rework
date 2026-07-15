import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import { config } from './config.js';
import { logger } from './logger.js';
import { requireAuth } from './auth/middleware.js';
import { healthRouter } from './routes/health.js';
import { settingsRouter } from './routes/settings.js';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false); // remoteAddress must be the real peer for loopback trust

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://openweathermap.org'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
        },
      },
    }),
  );
  if (!process.env.VITEST) {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  }
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Write routes get a modest rate limit; the panel never hits it.
  const writeLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    return writeLimiter(req, res, next);
  });

  // Health is unauthenticated (used by systemd/monitoring); everything
  // else under /api requires loopback or a session.
  app.use('/api/health', healthRouter);
  app.use('/api', requireAuth);
  app.use('/api/settings', settingsRouter);

  // Static client (production build), SPA fallback.
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', code: 'not_found' });
  });

  // Central error handler: clients get generic messages, logs get detail.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'Invalid request',
        code: 'invalid_request',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    logger.error({ err, url: req.url, method: req.method }, 'unhandled error');
    res.status(500).json({ error: 'Something went wrong', code: 'internal' });
  });

  return app;
}
