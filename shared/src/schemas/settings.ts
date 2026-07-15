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
});

export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsPatchSchema = SettingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
