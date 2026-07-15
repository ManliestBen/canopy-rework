import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db/index.js';
import { logger } from './logger.js';
import { startBackgroundRefresh } from './services/eventCache.js';
import { initGoogle } from './services/googleCalendar.js';
import { startDigestScheduler } from './services/digest.js';
import { initGmail } from './services/gmail.js';
import { startPhotosRefresh } from './services/photos.js';
import { startWeatherRefresh } from './services/weather.js';

openDb();
initGoogle();
initGmail();
startBackgroundRefresh();
startWeatherRefresh();
startPhotosRefresh();
startDigestScheduler();

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
