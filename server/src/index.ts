import { createApp } from './app.js';
import { config } from './config.js';
import { bootstrapDatabase } from './db/bootstrap.js';
import { logger } from './logger.js';
import { startBackgroundRefresh } from './services/eventCache.js';
import { initGoogle } from './services/googleCalendar.js';
import { reportIntegration } from './routes/health.js';
import { startDigestScheduler } from './services/digest.js';
import { startCloudBackupScheduler } from './services/cloudBackup.js';
import { gmailConfigured, initGmail } from './services/gmail.js';
import { googleStatus } from './services/googleCalendar.js';
import { startPhotosRefresh } from './services/photos.js';
import { startWeatherRefresh } from './services/weather.js';

bootstrapDatabase();
initGoogle();
initGmail();
startBackgroundRefresh();
startWeatherRefresh();
startPhotosRefresh();
startDigestScheduler();
startCloudBackupScheduler();

// Reflect real init results in /api/health.
const gs = googleStatus();
reportIntegration('googleCalendar', {
  configured: gs.configured,
  ok: gs.configured ? gs.initError === null : null,
  detail: gs.initError ?? gs.serviceAccountEmail ?? undefined,
});
reportIntegration('gmail', {
  configured: gmailConfigured(),
  ok: gmailConfigured() ? true : null,
});

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'Canopy server listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
