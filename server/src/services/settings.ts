import {
  DEFAULT_SETTINGS,
  SettingsPatchSchema,
  SettingsSchema,
  type Settings,
  type SettingsPatch,
} from '@canopy/shared';
import { getDb } from '../db/index.js';

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
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
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
