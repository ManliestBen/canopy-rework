import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db/index.js';
import { logger } from './logger.js';
import { startBackgroundRefresh } from './services/eventCache.js';
import { initGoogle } from './services/googleCalendar.js';
import { startPhotosRefresh } from './services/photos.js';
import { startWeatherRefresh } from './services/weather.js';

openDb();
initGoogle();
startBackgroundRefresh();
startWeatherRefresh();
startPhotosRefresh();

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
