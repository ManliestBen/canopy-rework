import { Router } from 'express';
import { BackupSchema, type Backup } from '@canopy/shared';
import { getDb } from '../db/index.js';
import { wrap } from '../lib/asyncRoute.js';
import { getSettings, patchSettings } from '../services/settings.js';
import { listUsers, restoreUsers } from '../services/users.js';
import {
  cloudBackupStatus,
  restoreFromCloud,
  runCloudBackup,
} from '../services/cloudBackup.js';

export const backupRouter = Router();

/**
 * Backup = one JSON document of app config (settings + users).
 * No secrets: the PIN hash lives outside the Settings schema and .env /
 * Google keys are backed up separately by the owner (per feature list).
 */
backupRouter.get('/', (_req, res) => {
  const backup: Backup = {
    kind: 'canopy-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    users: listUsers(),
  };
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="canopy-backup-${backup.exportedAt.slice(0, 10)}.json"`,
  );
  res.json(backup);
});

backupRouter.post('/restore', (req, res) => {
  const backup = BackupSchema.parse(req.body);
  // One transaction: settings + users apply all-or-nothing (a partial
  // restore would leave the panel in a confusing half-configured state).
  getDb().transaction(() => {
    patchSettings(backup.settings);
    restoreUsers(backup.users);
  })();
  res.json({ ok: true, restoredUsers: backup.users.length });
});

// ---- Cloud backup (full database snapshot to MongoDB) ------------------

/** Status: is cloud backup configured, and when did it last run. */
backupRouter.get(
  '/cloud',
  wrap(async (_req, res) => {
    res.json(await cloudBackupStatus());
  }),
);

/** Run a cloud backup now (also invoked automatically every 24h). */
backupRouter.post(
  '/cloud',
  wrap(async (_req, res) => {
    const meta = await runCloudBackup();
    res.json({ ok: true, createdAt: meta.createdAt, size: meta.size });
  }),
);

/** Restore the database from the most recent cloud snapshot (destructive). */
backupRouter.post(
  '/cloud/restore',
  wrap(async (_req, res) => {
    const { restoredFrom } = await restoreFromCloud();
    res.json({ ok: true, restoredFrom });
  }),
);
