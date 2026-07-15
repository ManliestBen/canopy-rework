import { bootstrapDatabase } from './bootstrap.js';
import { closeDb } from './index.js';

/**
 * `npm run bootstrap` — create and migrate the Canopy database in its
 * configured location (CANOPY_DB_PATH, or the per-environment default).
 * Idempotent: run it before first boot, or just let the server do it.
 */
const { dbPath, created } = bootstrapDatabase();
closeDb();
console.log(
  created
    ? `Created a new Canopy database at ${dbPath}`
    : `Canopy database already present at ${dbPath}`,
);
