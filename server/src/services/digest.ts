import {
  addDaysToKey,
  formatKey,
  formatTime,
  occursOn,
  todayKey,
  type CalendarEvent,
  type Task,
} from '@canopy/shared';
import { getDb } from '../db/index.js';
import { logger } from '../logger.js';
import { getEvents } from './eventCache.js';
import { gmailConfigured, sendEmail } from './gmail.js';
import { getSettings } from './settings.js';
import { listTasks } from './tasks.js';

/** Compose the plain-text daily digest. Pure — unit-testable. */
export function composeDigest(
  dateKey: string,
  familyName: string,
  events: CalendarEvent[],
  tasks: Task[],
): string {
  const lines: string[] = [
    `Good morning, ${familyName}! Here's ${formatKey(dateKey, 'EEEE, MMMM d')}:`,
    '',
  ];

  const todays = events
    .filter((e) => e.startKey <= dateKey && e.endKey >= dateKey)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  lines.push('📅 Events');
  if (todays.length === 0) lines.push('  Nothing on the calendar today.');
  for (const e of todays) {
    lines.push(`  • ${e.allDay ? 'All day' : formatTime(e.start)} — ${e.title}`);
  }

  const due = tasks.filter((t) => {
    if (t.schedule !== 'none') {
      return occursOn(t.schedule, t.dueKey, dateKey) && !t.completedKeys.includes(dateKey);
    }
    return !t.completedAt && t.dueKey !== null && t.dueKey <= dateKey;
  });
  lines.push('', '✅ To-dos');
  if (due.length === 0) lines.push('  All caught up!');
  for (const t of due) {
    const overdue = t.schedule === 'none' && t.dueKey && t.dueKey < dateKey;
    lines.push(`  • ${t.title}${overdue ? ` (since ${formatKey(t.dueKey!, 'MMM d')})` : ''}`);
  }

  lines.push('', '— Canopy 🌳');
  return lines.join('\n');
}

const SENT_KEY = 'digest-sent';
let timer: NodeJS.Timeout | null = null;

function lastSentKey(): string | null {
  const row = getDb().prepare('SELECT payload FROM kv_cache WHERE key = ?').get(SENT_KEY) as
    | { payload: string }
    | undefined;
  return row ? (JSON.parse(row.payload) as string) : null;
}

function markSent(dateKey: string): void {
  getDb()
    .prepare(
      `INSERT INTO kv_cache (key, payload, fetched_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    )
    .run(SENT_KEY, JSON.stringify(dateKey));
}

export function digestRecipients(): string[] {
  return getSettings()
    .digestEmails.split(',')
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

async function maybeSendDigest(): Promise<void> {
  const settings = getSettings();
  if (!settings.digestEnabled || !gmailConfigured()) return;
  const recipients = digestRecipients();
  if (recipients.length === 0) return;

  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = todayKey();
  if (hhmm < settings.digestTime || lastSentKey() === today) return;

  try {
    const events = getEvents(today, addDaysToKey(today, 0)).events;
    const body = composeDigest(today, settings.familyName, events, listTasks());
    await sendEmail(
      recipients,
      `Canopy — today at a glance (${formatKey(today, 'EEE, MMM d')})`,
      body,
    );
    markSent(today);
  } catch (err) {
    logger.warn({ err }, 'digest send failed; will retry next tick');
  }
}

export function startDigestScheduler(): void {
  if (timer) return;
  timer = setInterval(() => void maybeSendDigest(), 60_000);
  timer.unref();
}

export function stopDigestScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
