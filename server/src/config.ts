import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the SQLite database lives when CANOPY_DB_PATH is not set. In
 * production (e.g. the Pi kiosk) default to the user's config dir so the
 * data survives a repo reinstall and lives outside the app tree; in
 * development keep it inside the repo under data/ for convenience.
 */
function defaultDbPath(): string {
  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    return path.join(os.homedir(), '.config', 'canopy', 'canopy.db');
  }
  return path.resolve(here, '../../data/canopy.db');
}

/**
 * All environment access happens here, once. Secrets never use a VITE_
 * prefix and never reach the client bundle.
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  env: process.env.NODE_ENV ?? 'development',
  dbPath: process.env.CANOPY_DB_PATH ?? defaultDbPath(),
  clientDist: path.resolve(here, '../../client/dist'),

  google: {
    serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH ?? null,
    oauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? null,
    oauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? null,
    oauthRefreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN ?? null,
    emailFrom: process.env.CANOPY_EMAIL_FROM ?? null,
  },
  weather: {
    apiKey: process.env.OPENWEATHERMAP_API_KEY ?? null,
  },
  cloudinary: {
    url: process.env.CLOUDINARY_URL ?? null,
  },
  cloudBackup: {
    // Optional MongoDB connection string. When set, Canopy backs up a full
    // snapshot of its SQLite database to the cloud (daily + on demand).
    mongodbUri: process.env.MONGODB_URI ?? null,
  },
} as const;
