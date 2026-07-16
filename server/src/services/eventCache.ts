import {
  addDaysToKey,
  toDateKey,
  todayKey,
  type CalendarEvent,
  type CalendarSource,
  type EventsResponse,
} from '@canopy/shared';
import type { calendar_v3 } from '@googleapis/calendar';
import { getDb } from '../db/index.js';
import { logger } from '../logger.js';
import { listCalendars } from './calendars.js';
import { fetchGoogleEvents } from './googleCalendar.js';
import { fetchIcsText, parseIcsEvents, type IcsEvent } from './icsFeed.js';

/**
 * Client requests NEVER wait on Google or an ICS host: /api/events is
 * served from this cache, which refreshes in the background and
 * persists the last-good payload in SQLite (instant + offline-capable
 * across restarts). This replaces the original app's
 * fetch-everything-on-every-poll design.
 */
const WINDOW_BEHIND_DAYS = 45;
const WINDOW_AHEAD_DAYS = 120;
const REFRESH_INTERVAL_MS = 5 * 60_000;
const STALE_AFTER_MS = 20 * 60_000;

type CacheEntry = {
  events: CalendarEvent[];
  fetchedAt: string | null;
  error: string | null;
};

const cache = new Map<string, CacheEntry>();
let timer: NodeJS.Timeout | null = null;

// ---- Normalization ---------------------------------------------------

function endKeyFromExclusiveEnd(end: Date, startKey: string): string {
  const inclusive = new Date(end.getTime() - 1);
  const key = toDateKey(inclusive);
  return key < startKey ? startKey : key;
}

export function normalizeGoogleEvent(
  item: calendar_v3.Schema$Event,
  cal: CalendarSource,
): CalendarEvent | null {
  if (item.status === 'cancelled' || !item.id) return null;
  const allDay = Boolean(item.start?.date);
  let start: Date;
  let end: Date;
  if (allDay) {
    // All-day: Google uses date-only with EXCLUSIVE end date.
    if (!item.start?.date || !item.end?.date) return null;
    start = new Date(`${item.start.date}T00:00:00`);
    end = new Date(`${item.end.date}T00:00:00`);
  } else {
    if (!item.start?.dateTime || !item.end?.dateTime) return null;
    start = new Date(item.start.dateTime);
    end = new Date(item.end.dateTime);
  }
  const startKey = toDateKey(start);
  return {
    id: item.id,
    calendarId: cal.id,
    calendarTitle: cal.title,
    color: cal.color,
    userId: cal.userId,
    title: item.summary ?? '(untitled)',
    allDay,
    start: start.toISOString(),
    end: end.toISOString(),
    startKey,
    endKey: endKeyFromExclusiveEnd(end, startKey),
    location: item.location ?? undefined,
    description: item.description ?? undefined,
    rrule: item.recurrence?.find((r) => r.startsWith('RRULE:')),
    readOnly: false,
  };
}

export function normalizeIcsEvent(ev: IcsEvent, cal: CalendarSource): CalendarEvent {
  const startKey = toDateKey(ev.start);
  return {
    id: ev.uid,
    calendarId: cal.id,
    calendarTitle: cal.title,
    color: cal.color,
    userId: cal.userId,
    title: ev.title,
    allDay: ev.allDay,
    start: ev.start.toISOString(),
    end: ev.end.toISOString(),
    startKey,
    endKey:
      ev.allDay || ev.end.getTime() > ev.start.getTime()
        ? endKeyFromExclusiveEnd(ev.end, startKey)
        : startKey,
    location: ev.location,
    description: ev.description,
    rrule: ev.rrule,
    readOnly: true,
  };
}

// ---- Fetching --------------------------------------------------------

type Fetchers = {
  google: (cal: CalendarSource, minIso: string, maxIso: string) => Promise<CalendarEvent[]>;
  ics: (cal: CalendarSource, min: Date, max: Date) => Promise<CalendarEvent[]>;
};

let fetchers: Fetchers = {
  google: async (cal, minIso, maxIso) =>
    (await fetchGoogleEvents(cal.sourceRef, minIso, maxIso))
      .map((item) => normalizeGoogleEvent(item, cal))
      .filter((e): e is CalendarEvent => e !== null),
  ics: async (cal, min, max) =>
    parseIcsEvents(await fetchIcsText(cal.sourceRef), min, max).map((ev) =>
      normalizeIcsEvent(ev, cal),
    ),
};

export function __setFetchersForTests(f: Partial<Fetchers>): void {
  fetchers = { ...fetchers, ...f };
}

function window() {
  const min = new Date(`${addDaysToKey(todayKey(), -WINDOW_BEHIND_DAYS)}T00:00:00`);
  const max = new Date(`${addDaysToKey(todayKey(), WINDOW_AHEAD_DAYS)}T00:00:00`);
  return { min, max };
}

export async function refreshCalendar(cal: CalendarSource): Promise<void> {
  const { min, max } = window();
  try {
    const events =
      cal.sourceType === 'google'
        ? await fetchers.google(cal, min.toISOString(), max.toISOString())
        : await fetchers.ics(cal, min, max);
    const fetchedAt = new Date().toISOString();
    cache.set(cal.id, { events, fetchedAt, error: null });
    getDb()
      .prepare(
        `INSERT INTO event_cache (calendar_id, payload, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT(calendar_id) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
      )
      .run(cal.id, JSON.stringify(events), fetchedAt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Only errors we raised deliberately (safe wording, no internals) are
    // shown to clients; upstream/network detail stays in the log.
    const safe = (err as { safe?: boolean }).safe === true;
    const clientMessage = safe ? message : 'Could not refresh this calendar';
    const existing = cache.get(cal.id);
    // Keep serving last-good events; just mark the failure.
    cache.set(cal.id, {
      events: existing?.events ?? [],
      fetchedAt: existing?.fetchedAt ?? null,
      error: clientMessage,
    });
    logger.warn({ calendarId: cal.id, err: message }, 'calendar refresh failed');
  }
}

export async function refreshAll(): Promise<void> {
  const cals = listCalendars();
  await Promise.allSettled(cals.map((c) => refreshCalendar(c)));
}

/** Load persisted last-good payloads so a restart serves instantly. */
export function warmFromDb(): void {
  const rows = getDb()
    .prepare('SELECT calendar_id, payload, fetched_at FROM event_cache')
    .all() as { calendar_id: string; payload: string; fetched_at: string }[];
  for (const row of rows) {
    try {
      cache.set(row.calendar_id, {
        events: JSON.parse(row.payload) as CalendarEvent[],
        fetchedAt: row.fetched_at,
        error: null,
      });
    } catch {
      // Corrupt cache row — background refresh will replace it.
    }
  }
}

export function startBackgroundRefresh(): void {
  if (timer) return;
  warmFromDb();
  void refreshAll();
  timer = setInterval(() => void refreshAll(), REFRESH_INTERVAL_MS);
  timer.unref();
}

export function stopBackgroundRefresh(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function clearCacheForTests(): void {
  cache.clear();
}

// ---- Serving ---------------------------------------------------------

export function getEvents(fromKey: string, toKey: string): EventsResponse {
  const cals = listCalendars();
  const events: CalendarEvent[] = [];
  const calendars: EventsResponse['calendars'] = [];

  for (const cal of cals) {
    const entry = cache.get(cal.id);
    let status: 'ok' | 'stale' | 'error' | 'pending';
    if (!entry || (!entry.fetchedAt && !entry.error)) status = 'pending';
    else if (entry.error) status = 'error';
    else if (Date.now() - new Date(entry.fetchedAt!).getTime() > STALE_AFTER_MS)
      status = 'stale';
    else status = 'ok';

    calendars.push({
      id: cal.id,
      title: cal.title,
      color: cal.color,
      userId: cal.userId,
      sourceType: cal.sourceType,
      status,
      fetchedAt: entry?.fetchedAt ?? null,
      error: entry?.error ?? undefined,
    });

    for (const ev of entry?.events ?? []) {
      // Overlap test on local day keys (inclusive on both ends).
      if (ev.endKey >= fromKey && ev.startKey <= toKey) events.push(ev);
    }
  }

  events.sort((a, b) =>
    a.allDay !== b.allDay && a.startKey === b.startKey
      ? Number(b.allDay) - Number(a.allDay)
      : a.start.localeCompare(b.start),
  );
  return { events, calendars };
}
