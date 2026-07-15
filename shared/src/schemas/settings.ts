import { z } from 'zod';

export const THEMES = [
  'skylight',
  'skylight-dark',
  'light',
  'dark',
  'bold-light',
  'bold-dark',
  'pride',
] as const;

export const ThemeSchema = z.enum(THEMES);
export type Theme = z.infer<typeof ThemeSchema>;

/**
 * App settings, stored as a key/value table server-side and edited from
 * the Settings screen. Every field is optional in PATCH payloads; the
 * server merges and returns the full object with defaults applied.
 */
export const SettingsSchema = z.object({
  familyName: z.string().trim().min(1).max(60).default('Our Family'),
  deviceName: z.string().trim().min(1).max(60).default('Canopy'),
  /** 'system' follows prefers-color-scheme between skylight and skylight-dark. */
  themeMode: z.union([z.literal('system'), ThemeSchema]).default('skylight'),
  /** 0 = solid panels, 100 = maximum glass. Maps to --panel-alpha/--panel-blur. */
  transparency: z.number().int().min(0).max(100).default(35),
  /** Free-text location for weather ("Traverse City, MI"). Geocoded in Phase 5. */
  locationQuery: z.string().trim().max(100).default(''),
  /** Set true when the first-run wizard completes. */
  onboarded: z.boolean().default(false),

  /** What the panel does during the sleep window. */
  sleepMode: z.enum(['off', 'dim', 'slideshow']).default('off'),
  sleepStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('21:30'),
  sleepEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('06:30'),
  /** Start the slideshow after this many idle minutes (0 = never). */
  idleSlideshowMinutes: z.number().int().min(0).max(240).default(0),
  /** Seconds each photo stays on screen. */
  slideshowIntervalSeconds: z.number().int().min(5).max(120).default(12),
  /** Cloudinary folder/prefix feeding the slideshow ('' = all photos). */
  photoFolder: z.string().trim().max(200).default(''),

  /** Daily agenda digest email (needs Gmail configured on the server). */
  digestEnabled: z.boolean().default(false),
  digestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('06:45'),
  /** Comma-separated recipient addresses. */
  digestEmails: z.string().trim().max(500).default(''),

  /** On-panel pop-up (and chime) before timed events. 0 = off. */
  reminderMinutes: z.number().int().min(0).max(120).default(10),
  /** Require the family PIN to open Settings on the panel itself. */
  settingsLocked: z.boolean().default(false),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsPatchSchema = SettingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
