import type { Settings, Theme } from '@canopy/shared';

/** Resolve the configured theme mode to a concrete data-theme value. */
export function resolveTheme(mode: Settings['themeMode'], prefersDark: boolean): Theme {
  if (mode === 'system') return prefersDark ? 'skylight-dark' : 'skylight';
  return mode;
}
