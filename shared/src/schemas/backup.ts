import { z } from 'zod';
import { SettingsSchema } from './settings';
import { UserSchema } from './users';

/**
 * Config-only backup (per feature list): settings + users + future
 * sections appended as optional keys so old backups always restore.
 * Secrets (.env, Google keys) and the PIN hash are deliberately NOT
 * included — a backup file is safe to email around.
 */
export const BackupSchema = z.object({
  kind: z.literal('canopy-backup'),
  version: z.literal(1),
  exportedAt: z.string(),
  settings: SettingsSchema,
  users: z.array(UserSchema),
});
export type Backup = z.infer<typeof BackupSchema>;
