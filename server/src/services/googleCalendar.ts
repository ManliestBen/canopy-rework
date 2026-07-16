import fs from 'node:fs';
import { auth as googleAuth, calendar, type calendar_v3 } from '@googleapis/calendar';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Google Calendar via service account. Fixes over the original app:
 * - ONE auth client built at startup (the old code re-read the key file
 *   from disk on every API call).
 * - Every call has a timeout; writes retry on 429/5xx with backoff.
 * - Never configured ⇒ everything returns cleanly, app still runs.
 */
const TIMEOUT_MS = 10_000;

let client: calendar_v3.Calendar | null = null;
let serviceAccountEmail: string | null = null;
let initError: string | null = null;

export function initGoogle(): void {
  const keyPath = config.google.serviceAccountPath;
  if (!keyPath) return;
  try {
    const raw = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as {
      client_email?: string;
    };
    serviceAccountEmail = raw.client_email ?? null;
    const auth = new googleAuth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    client = calendar({ version: 'v3', auth, timeout: TIMEOUT_MS });
    logger.info({ serviceAccountEmail }, 'Google Calendar client ready');
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'failed to init Google Calendar client');
  }
}

export function googleStatus() {
  return {
    configured: config.google.serviceAccountPath !== null,
    serviceAccountEmail,
    initError,
  };
}

function requireClient(): calendar_v3.Calendar {
  if (!client) {
    throw Object.assign(
      new Error(
        'Google Calendar is not set up yet. Add a service account key to get started.',
      ),
      { status: 503 },
    );
  }
  return client;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number; code?: number }).status ??
        (err as { code?: number }).code;
      const retriable = status === 429 || (typeof status === 'number' && status >= 500);
      if (!retriable || attempt === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export async function fetchGoogleEvents(
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<calendar_v3.Schema$Event[]> {
  const cal = requireClient();
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withRetry(() =>
      cal.events.list({
        calendarId,
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        singleEvents: true, // Google expands recurrences for us
        orderBy: 'startTime',
        maxResults: 2500,
        pageToken,
      }),
    );
    events.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return events;
}

/** The series master carries the RRULE (singleEvents strips it). */
export async function fetchEventMaster(
  calendarId: string,
  eventId: string,
): Promise<calendar_v3.Schema$Event> {
  const cal = requireClient();
  const res = await withRetry(() => cal.events.get({ calendarId, eventId }));
  return res.data;
}

export async function probeCalendar(
  calendarId: string,
): Promise<{ ok: boolean; summary?: string; error?: string }> {
  try {
    const cal = requireClient();
    const res = await cal.calendars.get({ calendarId });
    return { ok: true, summary: res.data.summary ?? undefined };
  } catch (err) {
    const status = (err as { status?: number; code?: number }).status ??
      (err as { code?: number }).code;
    return {
      ok: false,
      error:
        status === 404
          ? 'Calendar not found — check the ID and make sure it is shared with the service account.'
          : 'Could not reach this calendar.',
    };
  }
}

export async function insertGoogleEvent(
  calendarId: string,
  body: calendar_v3.Schema$Event,
): Promise<calendar_v3.Schema$Event> {
  const cal = requireClient();
  // sendUpdates: 'none' — the original app defaulted to emailing every
  // attendee on every change (a spam vector on an open endpoint).
  const res = await withRetry(() =>
    cal.events.insert({ calendarId, sendUpdates: 'none', requestBody: body }),
  );
  return res.data;
}

export async function patchGoogleEvent(
  calendarId: string,
  eventId: string,
  body: calendar_v3.Schema$Event,
): Promise<calendar_v3.Schema$Event> {
  const cal = requireClient();
  const res = await withRetry(() =>
    cal.events.patch({ calendarId, eventId, sendUpdates: 'none', requestBody: body }),
  );
  return res.data;
}

export async function deleteGoogleEvent(
  calendarId: string,
  eventId: string,
): Promise<void> {
  const cal = requireClient();
  await withRetry(() => cal.events.delete({ calendarId, eventId, sendUpdates: 'none' }));
}

/** Test hook. */
export function __setClientForTests(c: calendar_v3.Calendar | null): void {
  client = c;
}
