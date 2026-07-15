import { useQuery } from '@tanstack/react-query';
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from '@canopy/shared';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { apiGet } from '../lib/api';
import { resolveTheme } from './resolve';

const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS);

export function useSettings(): Settings {
  return useContext(SettingsContext);
}

export const settingsQuery = {
  queryKey: ['settings'] as const,
  queryFn: () => apiGet(SettingsSchema, '/api/settings'),
};

function subscribeToColorScheme(cb: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery(settingsQuery);
  const settings = data ?? DEFAULT_SETTINGS;

  const prefersDark = useSyncExternalStore(
    subscribeToColorScheme,
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolveTheme(settings.themeMode, prefersDark);
    root.style.setProperty('--transparency', String(settings.transparency));
  }, [settings.themeMode, settings.transparency, prefersDark]);

  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}
