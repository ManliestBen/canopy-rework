import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Keep JSON logs in production (journald-friendly); pretty in dev.
  transport:
    process.env.NODE_ENV === 'production' || process.env.VITEST
      ? undefined
      : { target: 'pino/file', options: { destination: 1 } },
});
