import ical, { type CalendarComponent, type VEvent } from 'node-ical';

/**
 * ICS subscriptions (school calendars, sports teams, holidays). Feeds
 * are fetched with a timeout and parsed with node-ical, which expands
 * recurrence rules for us via its embedded rrule support.
 */
const TIMEOUT_MS = 10_000;

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
    const ev = component;
    const durationMs =
      (ev.end?.getTime() ?? ev.start.getTime()) - ev.start.getTime();
    // node-ical marks all-day starts with dateOnly.
    const allDay = (ev.start as Date & { dateOnly?: boolean }).dateOnly === true;

    if (ev.rrule) {
      const overridden = new Set(
        Object.keys(ev.recurrences ?? {}), // ISO date strings of overridden instances
      );
      for (const occ of ev.rrule.between(windowStart, windowEnd, true)) {
        const key = occ.toISOString().slice(0, 10);
        if (ev.exdate && Object.keys(ev.exdate).some((d) => d.startsWith(key))) continue;
        if (overridden.has(key)) continue;
        out.push({
          uid: `${ev.uid}:${occ.toISOString()}`,
          title: ev.summary ?? '(untitled)',
          allDay,
          start: occ,
          end: new Date(occ.getTime() + durationMs),
          location: ev.location || undefined,
          description: ev.description || undefined,
          rrule: `RRULE:${ev.rrule.toString().split('\n').pop() ?? ''}`,
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
