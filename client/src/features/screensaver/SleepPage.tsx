import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsSchema, type Settings, type SettingsPatch } from '@canopy/shared';
import { useState } from 'react';
import { apiSend } from '../../lib/api';
import { settingsQuery, useSettings } from '../../theme/ThemeProvider';
import { Slideshow } from './Slideshow';
import './screensaver.css';

export function SleepPage() {
  const settings = useSettings();
  const qc = useQueryClient();
  const [previewing, setPreviewing] = useState(false);

  const save = useMutation({
    mutationFn: (patch: SettingsPatch) =>
      apiSend(SettingsSchema, 'PATCH', '/api/settings', patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: settingsQuery.queryKey });
      const previous = qc.getQueryData<Settings>(settingsQuery.queryKey);
      if (previous) qc.setQueryData(settingsQuery.queryKey, { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) qc.setQueryData(settingsQuery.queryKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: settingsQuery.queryKey }),
  });

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title">Sleep & Screensaver</h1>

      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Night sleep</h2>
        <p className="muted">
          During the sleep window the panel {settings.sleepMode === 'dim' ? 'dims' : 'shows your photos'} instead
          of the calendar. Tap the screen any time to wake it for a few minutes.
        </p>
        <div className="field">
          <label>At night, the panel should…</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(
              [
                ['off', 'Stay on'],
                ['dim', 'Go dark'],
                ['slideshow', 'Show photos'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                className={`btn${settings.sleepMode === mode ? ' btn-primary' : ''}`}
                onClick={() => save.mutate({ sleepMode: mode })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {settings.sleepMode !== 'off' && (
          <div className="field-grid">
            <div className="field">
              <label htmlFor="sleep-start">Sleep at</label>
              <input
                id="sleep-start"
                type="time"
                className="input"
                value={settings.sleepStart}
                onChange={(e) => save.mutate({ sleepStart: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="sleep-end">Wake at</label>
              <input
                id="sleep-end"
                type="time"
                className="input"
                value={settings.sleepEnd}
                onChange={(e) => save.mutate({ sleepEnd: e.target.value })}
              />
            </div>
          </div>
        )}
      </section>

      <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Daytime slideshow</h2>
        <div className="field">
          <label htmlFor="idle-min">
            Start the slideshow after{' '}
            {settings.idleSlideshowMinutes === 0
              ? '— never'
              : `${settings.idleSlideshowMinutes} quiet minute(s)`}
          </label>
          <input
            id="idle-min"
            type="range"
            min={0}
            max={60}
            step={5}
            value={settings.idleSlideshowMinutes}
            onChange={(e) => save.mutate({ idleSlideshowMinutes: Number(e.target.value) })}
            style={{ minHeight: 'var(--touch-target)' }}
          />
        </div>
        <div className="field">
          <label htmlFor="slide-secs">
            Each photo shows for {settings.slideshowIntervalSeconds}s
          </label>
          <input
            id="slide-secs"
            type="range"
            min={5}
            max={60}
            step={1}
            value={settings.slideshowIntervalSeconds}
            onChange={(e) =>
              save.mutate({ slideshowIntervalSeconds: Number(e.target.value) })
            }
            style={{ minHeight: 'var(--touch-target)' }}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setPreviewing(true)}>
          ▶ Preview slideshow
        </button>
      </section>

      {previewing && <Slideshow onWake={() => setPreviewing(false)} />}
    </div>
  );
}
