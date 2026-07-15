import { addDaysToKey, formatTime, todayKey, type CalendarEvent } from '@canopy/shared';
import { useEffect, useMemo, useState } from 'react';
import { useNow } from '../hooks/useNow';
import { useSettings } from '../theme/ThemeProvider';
import { useEventsRange } from '../features/calendar/api';

function chime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    osc.start();
    osc.stop(ctx.currentTime + 0.85);
  } catch {
    // Visual toast still shows.
  }
}

/**
 * On-panel event reminders: a toast + soft chime N minutes before timed
 * events (configurable in Settings; 0 disables). Shown-state lives in
 * localStorage so a page reload doesn't re-fire old reminders.
 */
export function EventReminders() {
  const settings = useSettings();
  const now = useNow();
  const today = todayKey();
  const { data } = useEventsRange(today, addDaysToKey(today, 1));
  const [active, setActive] = useState<CalendarEvent[]>([]);

  const upcoming = useMemo(() => {
    if (settings.reminderMinutes === 0) return [];
    const nowMs = now.getTime();
    const windowMs = settings.reminderMinutes * 60_000;
    return (data?.events ?? []).filter((e) => {
      if (e.allDay) return false;
      const start = new Date(e.start).getTime();
      return start > nowMs && start - nowMs <= windowMs;
    });
  }, [data, now, settings.reminderMinutes]);

  useEffect(() => {
    if (upcoming.length === 0) return;
    const seenRaw = localStorage.getItem('canopy-reminded') ?? '[]';
    let seen: string[] = [];
    try {
      seen = JSON.parse(seenRaw) as string[];
    } catch {
      // Corrupt localStorage — start over.
    }
    const fresh = upcoming.filter((e) => !seen.includes(`${e.id}:${e.start}`));
    if (fresh.length === 0) return;
    setActive((prev) => [...prev, ...fresh.filter((f) => !prev.some((p) => p.id === f.id))]);
    chime();
    const updated = [...seen, ...fresh.map((e) => `${e.id}:${e.start}`)].slice(-100);
    localStorage.setItem('canopy-reminded', JSON.stringify(updated));
  }, [upcoming]);

  if (active.length === 0) return null;
  return (
    <div className="reminder-stack">
      {active.map((e) => (
        <div key={`${e.id}:${e.start}`} className="reminder-toast panel">
          <span className="reminder-dot" style={{ background: `var(--family-${e.color})` }} />
          <div style={{ flex: 1 }}>
            <b>{e.title}</b>
            <div className="muted">
              {formatTime(e.start)}
              {e.location ? ` · ${e.location}` : ''}
            </div>
          </div>
          <button
            className="btn"
            onClick={() => setActive((prev) => prev.filter((p) => p.id !== e.id))}
          >
            Got it
          </button>
        </div>
      ))}
    </div>
  );
}
