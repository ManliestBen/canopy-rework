import {
  DEFAULT_SETTINGS,
  SettingsPatchSchema,
  SettingsSchema,
  type Settings,
  type SettingsPatch,
} from '@canopy/shared';
import type { ZodTypeAny } from 'zod';
import { getDb } from '../db/index.js';
import { logger } from '../logger.js';

/**
 * Settings live in a key/value table; each value is JSON. Reads apply
 * schema defaults so new fields appear automatically after upgrades.
 */
export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      raw[row.key] = JSON.parse(row.value);
    } catch {
      // Ignore unparseable values; defaults win.
    }
  }
  const parsed = SettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // A single out-of-range stored value must NOT reset every setting to
  // defaults (that would silently wipe family name, sleep window, digest
  // recipients…). Keep each field that validates, fall back per-key to its
  // default, and log which key was dropped.
  const shape = SettingsSchema.shape as Record<string, ZodTypeAny>;
  const repaired: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    if (!(key in raw)) continue;
    const field = shape[key]!.safeParse(raw[key]);
    if (field.success) repaired[key] = field.data;
    else logger.warn({ key }, 'ignoring an invalid stored setting; using its default');
  }
  return SettingsSchema.parse(repaired);
}

export function patchSettings(patch: SettingsPatch): Settings {
  const valid = SettingsPatchSchema.parse(patch);
  const db = getDb();
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(valid)) {
      if (value !== undefined) upsert.run(key, JSON.stringify(value));
    }
  })();
  return getSettings();
}
