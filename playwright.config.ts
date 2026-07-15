import { defineConfig } from '@playwright/test';

/**
 * E2E smoke tests: real server + built client + fresh SQLite file.
 * Run locally with `npm run e2e` (after `npm run build`). Not part of
 * `npm test` — CI runs unit/integration; E2E is a pre-deploy check.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3999',
    viewport: { width: 1920, height: 1080 }, // the wall panel
  },
  webServer: {
    command:
      'CANOPY_DB_PATH=/tmp/canopy-e2e/canopy.db PORT=3999 npx tsx server/src/index.ts',
    url: 'http://localhost:3999/api/health',
    reuseExistingServer: false,
    timeout: 20_000,
  },
  globalSetup: './e2e/global-setup.ts',
});
