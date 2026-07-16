import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, openTestDb } from './db/index.js';
import { getSettings, patchSettings } from './services/settings.js';

describe('settings resilience', () => {
  beforeEach(() => openTestDb());
  afterEach(() => closeDb());

  it('one invalid stored value does not reset every setting', () => {
    patchSettings({ familyName: 'The Testers', digestEmails: 'a@b.com' });

    // Simulate schema drift / a bad manual edit: an out-of-range value.
    getDb()
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('slideshowIntervalSeconds', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(JSON.stringify(-999)); // min is 5

    const s = getSettings();
    // Other settings are preserved (not wiped to defaults)...
    expect(s.familyName).toBe('The Testers');
    expect(s.digestEmails).toBe('a@b.com');
    // ...and the bad key falls back to its own default (12), not -999.
    expect(s.slideshowIntervalSeconds).toBe(12);
  });
});
