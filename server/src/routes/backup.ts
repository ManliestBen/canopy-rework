import { Router } from 'express';
import { BackupSchema, type Backup } from '@canopy/shared';
import { getSettings, patchSettings } from '../services/settings.js';
import { listUsers, replaceAllUsers } from '../services/users.js';

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
  patchSettings(backup.settings);
  replaceAllUsers(backup.users);
  res.json({ ok: true, restoredUsers: backup.users.length });
});
