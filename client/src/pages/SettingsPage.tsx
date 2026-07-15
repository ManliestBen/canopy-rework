import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SettingsSchema,
  THEMES,
  type Settings,
  type SettingsPatch,
} from '@canopy/shared';
import { useState } from 'react';
import { apiSend } from '../lib/api';
import { settingsQuery, useSettings } from '../theme/ThemeProvider';

const THEME_LABELS: Record<string, string> = {
  system: 'Match device',
  skylight: 'Skylight',
  'skylight-dark': 'Skylight Dark',
  light: 'Light',
  dark: 'Dark',
  'bold-light': 'Bold',
  'bold-dark': 'Bold Dark',
  pride: 'Pride',
};

export function SettingsPage() {
  const settings = useSettings();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (patch: SettingsPatch) =>
      apiSend(SettingsSchema, 'PATCH', '/api/settings', patch),
    // Optimistic: the theme changes the instant you tap it.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: settingsQuery.queryKey });
      const previous = queryClient.getQueryData<Settings>(settingsQuery.queryKey);
      if (previous) {
        queryClient.setQueryData(settingsQuery.queryKey, { ...previous, ...patch });
      }
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(settingsQuery.queryKey, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsQuery.queryKey }),
  });

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title">Settings</h1>

      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Appearance</h2>
        <div className="field">
          <label>Theme</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {(['system', ...THEMES] as const).map((mode) => (
              <button
                key={mode}
                className={`btn${settings.themeMode === mode ? ' btn-primary' : ''}`}
                onClick={() => mutation.mutate({ themeMode: mode })}
              >
                {THEME_LABELS[mode] ?? mode}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="transparency">
            Glass effect — {settings.transparency}%
          </label>
          <input
            id="transparency"
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.transparency}
            onChange={(e) => mutation.mutate({ transparency: Number(e.target.value) })}
            style={{ minHeight: 'var(--touch-target)' }}
          />
        </div>
      </section>

      <section className="panel" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Household</h2>
        <NameField
          label="Family name (shown in the header)"
          value={settings.familyName}
          onSave={(familyName) => mutation.mutate({ familyName })}
        />
        <NameField
          label="Device name"
          value={settings.deviceName}
          onSave={(deviceName) => mutation.mutate({ deviceName })}
        />
      </section>
    </div>
  );
}

function NameField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const dirty = draft !== null && draft.trim() !== value && draft.trim() !== '';

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
        />
        {dirty && (
          <button
            className="btn btn-primary"
            onClick={() => {
              onSave(draft.trim());
              setDraft(null);
            }}
          >
            Save
          </button>
        )}
      </div>
    </div>
  );
}
