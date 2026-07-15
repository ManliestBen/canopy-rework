import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * All environment access happens here, once. Secrets never use a VITE_
 * prefix and never reach the client bundle.
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  env: process.env.NODE_ENV ?? 'development',
  dbPath:
    process.env.CANOPY_DB_PATH ?? path.resolve(here, '../../data/canopy.db'),
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
} as const;
