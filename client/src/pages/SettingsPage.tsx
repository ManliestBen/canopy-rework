import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  OkSchema,
  SettingsSchema,
  THEMES,
  type Settings,
  type SettingsPatch,
} from '@canopy/shared';
import { useState } from 'react';
import { useEmailStatus } from '../features/announcements/api';
import { BackupSettings } from '../components/BackupSettings';
import { PinSettings } from '../components/PinSettings';
import { UserManager } from '../components/UserManager';
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

      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Household</h2>
        <NameField
          label="Family name (shown in the header)"
          value={settings.familyName}
          onSave={(familyName) => mutation.mutate({ familyName })}
        />
        <NameField
          label="Location (for weather)"
          value={settings.locationQuery}
          onSave={(locationQuery) => {
            mutation.mutate(
              { locationQuery },
              {
                // Kick a weather refresh so the header chip updates now.
                onSuccess: () => void fetch('/api/weather/refresh', { method: 'POST' }),
              },
            );
          }}
        />
        <NameField
          label="Device name"
          value={settings.deviceName}
          onSave={(deviceName) => mutation.mutate({ deviceName })}
        />
      </section>

      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Family members</h2>
        <UserManager />
      </section>

      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Reminders</h2>
        <div className="field">
          <label htmlFor="remind-min">
            {settings.reminderMinutes === 0
              ? 'Event reminders are off'
              : `Pop up ${settings.reminderMinutes} minutes before events`}
          </label>
          <input
            id="remind-min"
            type="range"
            min={0}
            max={60}
            step={5}
            value={settings.reminderMinutes}
            onChange={(e) => mutation.mutate({ reminderMinutes: Number(e.target.value) })}
            style={{ minHeight: 'var(--touch-target)' }}
          />
        </div>
      </section>

      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Security</h2>
        <PinSettings />
        <div className="field" style={{ marginTop: 12 }}>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.settingsLocked}
              onChange={(e) => mutation.mutate({ settingsLocked: e.target.checked })}
            />
            Require the PIN to open Settings on this panel
          </label>
        </div>
      </section>

      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Daily email digest</h2>
        <DigestSettings
          settings={settings}
          onPatch={(patch) => mutation.mutate(patch)}
        />
      </section>

      <section className="panel" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Backup</h2>
        <BackupSettings />
      </section>
    </div>
  );
}

function DigestSettings({
  settings,
  onPatch,
}: {
  settings: Settings;
  onPatch: (patch: SettingsPatch) => void;
}) {
  const { data: email } = useEmailStatus();
  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!email?.configured) {
    return (
      <p className="muted">
        Email isn't set up on the server yet (Gmail OAuth credentials). See the
        setup guide — then Canopy can send a morning agenda email and family
        announcements.
      </p>
    );
  }

  return (
    <div>
      <div className="field">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.digestEnabled}
            onChange={(e) => onPatch({ digestEnabled: e.target.checked })}
          />
          Send a morning "today at a glance" email
        </label>
      </div>
      {settings.digestEnabled && (
        <div className="field-grid">
          <div className="field">
            <label htmlFor="digest-time">Send at</label>
            <input
              id="digest-time"
              type="time"
              className="input"
              value={settings.digestTime}
              onChange={(e) => onPatch({ digestTime: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="digest-emails">Recipients (comma-separated)</label>
            <input
              id="digest-emails"
              className="input"
              placeholder="you@example.com, partner@example.com"
              defaultValue={settings.digestEmails}
              onBlur={(e) => onPatch({ digestEmails: e.target.value })}
            />
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="test-email">Send a test email</label>
        <div style={{ display: 'flex', gap: 8, maxWidth: 460 }}>
          <input
            id="test-email"
            className="input"
            style={{ flex: 1 }}
            placeholder="you@example.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
          <button
            className="btn"
            disabled={!testTo.includes('@')}
            onClick={async () => {
              setTestResult('Sending…');
              try {
                await apiSend(OkSchema, 'POST', '/api/email/test', {
                  to: testTo.trim(),
                });
                setTestResult('Sent ✓ — check the inbox');
              } catch (err) {
                setTestResult(err instanceof Error ? err.message : 'Failed');
              }
            }}
          >
            Send test
          </button>
        </div>
        {testResult && <p style={{ fontWeight: 700 }}>{testResult}</p>}
      </div>
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
