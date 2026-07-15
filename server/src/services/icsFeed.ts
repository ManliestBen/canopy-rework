import ical, { type CalendarComponent, type VEvent } from 'node-ical';
import { toDateKey } from '@canopy/shared';

/**
 * ICS subscriptions (school calendars, sports teams, holidays). Feeds
 * are fetched with a timeout and parsed with node-ical, which expands
 * recurrence rules for us via its embedded rrule support.
 */
const TIMEOUT_MS = 10_000;

// Recurrence expansion caps: a hostile or malformed feed with a
// high-frequency rule would otherwise expand to millions of objects over
// the cache window and block the single-process event loop.
const MAX_OCCURRENCES_PER_EVENT = 1000;
const MAX_EVENTS_PER_FEED = 5000;

export type IcsEvent = {
  uid: string;
  title: string;
  allDay: boolean;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
  rrule?: string;
};

export async function fetchIcsText(url: string): Promise<string> {
  // Accept webcal:// (Apple convention) by translating to https.
  const httpUrl = url.replace(/^webcal:\/\//i, 'https://');
  const res = await fetch(httpUrl, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'Canopy/1.0 (family calendar panel)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Feed responded ${res.status}`);
  return res.text();
}

function isVEvent(c: CalendarComponent): c is VEvent {
  return c.type === 'VEVENT';
}

/**
 * node-ical returns rrule occurrences with the real instant's server-local
 * wall clock stored in the Date's UTC fields whenever the event carries a
 * TZID. Rebuild the real instant through the local-zone Date constructor;
 * floating events (no tzid) are already real instants. This is what keeps an
 * 8pm recurring event at 8pm instead of shifting it by the UTC offset, and
 * it stays correct across DST transitions because the engine's DST tables
 * produce the right wall-clock fields per occurrence.
 */
function occurrenceInstant(occ: Date, tzid: string | undefined): Date {
  if (!tzid) return occ;
  return new Date(
    occ.getUTCFullYear(),
    occ.getUTCMonth(),
    occ.getUTCDate(),
    occ.getUTCHours(),
    occ.getUTCMinutes(),
    occ.getUTCSeconds(),
  );
}

/**
 * Parse ICS text and return concrete events within [windowStart, windowEnd],
 * with recurrences expanded.
 */
export function parseIcsEvents(
  icsText: string,
  windowStart: Date,
  windowEnd: Date,
): IcsEvent[] {
  const parsed = ical.sync.parseICS(icsText);
  const out: IcsEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (!isVEvent(component)) continue;
    if (out.length >= MAX_EVENTS_PER_FEED) break;
    const ev = component;
    const durationMs =
      (ev.end?.getTime() ?? ev.start.getTime()) - ev.start.getTime();
    // node-ical marks all-day starts with dateOnly.
    const allDay = (ev.start as Date & { dateOnly?: boolean }).dateOnly === true;

    if (ev.rrule) {
      const tzid =
        (ev.rrule.origOptions.tzid as string | null | undefined) ?? undefined;

      // exdate/recurrence exclusions must be matched in the SAME frame as the
      // occurrence's real instant, or the wrong day is dropped. exdate values
      // and recurrenceid are real-instant Dates from node-ical.
      const asKey = (d: Date) => (allDay ? toDateKey(d) : String(d.getTime()));
      const excluded = new Set<string>([
        ...Object.values(ev.exdate ?? {}).map((d) => asKey(d as Date)),
        ...Object.values(ev.recurrences ?? {}).map((o) => {
          const rid = (o as VEvent & { recurrenceid?: Date }).recurrenceid;
          return asKey(rid ?? (o as VEvent).start);
        }),
      ]);

      // Widen the expansion window by a day each side (the floating frame can
      // skew boundaries by up to the UTC offset), then filter by real instant.
      const expandStart = new Date(windowStart.getTime() - 86_400_000);
      const expandEnd = new Date(windowEnd.getTime() + 86_400_000);
      // Use the iterator form so a pathological high-frequency rule (e.g.
      // FREQ=MINUTELY with no COUNT) stops early instead of materializing
      // millions of Dates before we can cap the output.
      const occurrences: Date[] = [];
      ev.rrule.between(expandStart, expandEnd, true, (occ) => {
        occurrences.push(occ);
        return occurrences.length < MAX_OCCURRENCES_PER_EVENT;
      });
      for (const occ of occurrences) {
        if (out.length >= MAX_EVENTS_PER_FEED) break;
        const start = occurrenceInstant(occ, tzid);
        if (start > windowEnd || start < windowStart) continue;
        if (excluded.has(asKey(start))) continue;
        const ruleLine = ev.rrule.toString().split('\n').pop() ?? '';
        out.push({
          uid: `${ev.uid}:${start.toISOString()}`,
          title: ev.summary ?? '(untitled)',
          allDay,
          start,
          end: new Date(start.getTime() + durationMs),
          location: ev.location || undefined,
          description: ev.description || undefined,
          rrule: ruleLine.startsWith('RRULE:') ? ruleLine : `RRULE:${ruleLine}`,
        });
      }
      // Overridden instances (moved occurrences) come through as their own entries.
      for (const override of Object.values(ev.recurrences ?? {})) {
        const o = override as VEvent;
        if (o.start >= windowStart && o.start <= windowEnd) {
          out.push({
            uid: `${o.uid}:${o.start.toISOString()}`,
            title: o.summary ?? '(untitled)',
            allDay,
            start: o.start,
            end: o.end ?? new Date(o.start.getTime() + durationMs),
            location: o.location || undefined,
            description: o.description || undefined,
          });
        }
      }
    } else {
      if (ev.start > windowEnd || (ev.end ?? ev.start) < windowStart) continue;
      out.push({
        uid: ev.uid,
        title: ev.summary ?? '(untitled)',
        allDay,
        start: ev.start,
        end: ev.end ?? ev.start,
        location: ev.location || undefined,
        description: ev.description || undefined,
      });
    }
  }
  return out;
}
