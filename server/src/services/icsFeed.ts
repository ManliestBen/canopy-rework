import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ical, { type CalendarComponent, type VEvent } from 'node-ical';
import { toDateKey } from '@canopy/shared';

/**
 * ICS subscriptions (school calendars, sports teams, holidays). Feeds
 * are fetched with a timeout and parsed with node-ical, which expands
 * recurrence rules for us via its embedded rrule support.
 */
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

// Recurrence expansion caps: a hostile or malformed feed with a
// high-frequency rule would otherwise expand to millions of objects over
// the cache window and block the single-process event loop.
const MAX_OCCURRENCES_PER_EVENT = 1000;
const MAX_EVENTS_PER_FEED = 5000;

/** Error we're happy to surface to a client (our own wording, no internals). */
function safeError(message: string, status = 400): Error {
  return Object.assign(new Error(message), { status, safe: true });
}

/**
 * Reject any address that isn't publicly routable. Feed URLs are
 * user-supplied and refetched forever on a timer, so without this the server
 * could be pointed at loopback/LAN services (SSRF).
 */
export function isPublicAddress(addr: string): boolean {
  const kind = isIP(addr);
  if (kind === 4) {
    const p = addr.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
    const [a, b] = p as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return false; // this-network, private, loopback
    if (a === 169 && b === 254) return false; // link-local
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false; // multicast / reserved
    return true;
  }
  if (kind === 6) {
    const lower = addr.toLowerCase();
    if (lower === '::1' || lower === '::') return false; // loopback / unspecified
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded IPv4.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]!);
    if (lower.startsWith('fc') || lower.startsWith('fd')) return false; // unique-local fc00::/7
    if (lower.startsWith('fe80')) return false; // link-local
    return true;
  }
  return false;
}

/** Parse a feed URL and confirm it is http(s) to a public host. Returns the URL. */
async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw safeError('Feed URL is not valid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw safeError('Feed URL must be http(s)');
  }
  // WHATWG URL keeps IPv6 literals bracketed ("[::1]"); strip for isIP.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost') throw safeError('Feed URL is not allowed');
  // IP literals: check directly (no DNS). Hostnames: resolve all addresses.
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw safeError('Feed URL is not allowed');
    return url;
  }
  const results = await lookup(host, { all: true }).catch(() => {
    throw safeError('Feed host could not be resolved', 502);
  });
  if (results.length === 0 || !results.every((r) => isPublicAddress(r.address))) {
    throw safeError('Feed URL is not allowed');
  }
  return url;
}

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
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  // Follow redirects manually so every hop is re-validated against the SSRF
  // guard — a public URL must not be allowed to bounce to an internal one.
  let current = await assertPublicHttpUrl(httpUrl);
  let res: Response;
  for (let hop = 0; ; hop++) {
    res = await fetch(current, {
      signal,
      headers: { 'User-Agent': 'Canopy/1.0 (family calendar panel)' },
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
      if (hop >= MAX_REDIRECTS) throw safeError('Feed redirected too many times', 502);
      const next = new URL(res.headers.get('location')!, current);
      current = await assertPublicHttpUrl(next.toString());
      continue;
    }
    break;
  }
  if (!res.ok) throw safeError(`Feed responded ${res.status}`, 502);

  // Bound the body so a huge feed can't exhaust memory on the Pi.
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw safeError('Feed too large', 502);
  }
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw safeError('Feed too large', 502);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
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
