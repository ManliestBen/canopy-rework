import { afterEach, describe, expect, it, vi } from 'vitest';
import { rrulestr } from 'rrule';
import { fetchIcsText, isPublicAddress, parseIcsEvents } from './services/icsFeed.js';

// Tests run under TZ=America/Chicago (see server/package.json). The whole
// point of these cases is that a recurring feed event keeps its wall-clock
// time and that the right occurrence is cancelled by EXDATE.

const WINDOW_START = new Date('2026-06-01T00:00:00');
const WINDOW_END = new Date('2026-12-31T00:00:00');

function ics(...lines: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...lines, 'END:VCALENDAR'].join(
    '\r\n',
  );
}

function vevent(...lines: string[]): string[] {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
}

describe('parseIcsEvents recurrence', () => {
  it('keeps the correct wall-clock instant for a TZID recurring event', () => {
    const text = ics(
      ...vevent(
        'UID:practice',
        'DTSTART;TZID=America/Chicago:20260701T200000',
        'DTEND;TZID=America/Chicago:20260701T210000',
        'RRULE:FREQ=DAILY;COUNT=3',
        'SUMMARY:Evening practice',
      ),
    );
    const events = parseIcsEvents(text, WINDOW_START, WINDOW_END);
    expect(events).toHaveLength(3);
    // 8pm CDT on July 1 is 01:00Z on July 2.
    expect(events[0]!.start.toISOString()).toBe('2026-07-02T01:00:00.000Z');
    for (const ev of events) {
      expect(ev.end.getTime() - ev.start.getTime()).toBe(3_600_000);
    }
  });

  it('cancels exactly the EXDATE-named occurrence, not an adjacent day', () => {
    const text = ics(
      ...vevent(
        'UID:practice',
        'DTSTART;TZID=America/Chicago:20260701T200000',
        'DTEND;TZID=America/Chicago:20260701T210000',
        'RRULE:FREQ=DAILY;COUNT=3',
        'EXDATE;TZID=America/Chicago:20260702T200000',
        'SUMMARY:Evening practice',
      ),
    );
    const events = parseIcsEvents(text, WINDOW_START, WINDOW_END);
    const starts = events.map((e) => e.start.toISOString());
    expect(events).toHaveLength(2);
    // July 2 8pm CDT (the cancelled one) is 2026-07-03T01:00:00Z — must be gone.
    expect(starts).not.toContain('2026-07-03T01:00:00.000Z');
    // July 1 and July 3 (local) must remain.
    expect(starts).toContain('2026-07-02T01:00:00.000Z');
    expect(starts).toContain('2026-07-04T01:00:00.000Z');
  });

  it('keeps the correct instant for a UTC (Z) recurring event', () => {
    const text = ics(
      ...vevent(
        'UID:utc',
        'DTSTART:20260701T200000Z',
        'DTEND:20260701T210000Z',
        'RRULE:FREQ=DAILY;COUNT=2',
        'SUMMARY:UTC event',
      ),
    );
    const events = parseIcsEvents(text, WINDOW_START, WINDOW_END);
    expect(events[0]!.start.toISOString()).toBe('2026-07-01T20:00:00.000Z');
  });

  it('holds wall-clock time across the fall DST boundary', () => {
    // CDT -> CST happens Nov 1 2026. A daily 8pm event must render 8pm both
    // sides of the switch: Oct 31 8pm CDT = Nov 1 01:00Z; Nov 1 8pm CST = Nov 2 02:00Z.
    const text = ics(
      ...vevent(
        'UID:dst',
        'DTSTART;TZID=America/Chicago:20261031T200000',
        'DTEND;TZID=America/Chicago:20261031T210000',
        'RRULE:FREQ=DAILY;COUNT=3',
        'SUMMARY:Across DST',
      ),
    );
    const starts = parseIcsEvents(text, WINDOW_START, WINDOW_END).map((e) =>
      e.start.toISOString(),
    );
    expect(starts).toContain('2026-11-01T01:00:00.000Z'); // Oct 31, 8pm CDT
    expect(starts).toContain('2026-11-02T02:00:00.000Z'); // Nov 1, 8pm CST
  });

  it('emits a moved (overridden) occurrence once, at its new time', () => {
    const text = ics(
      ...vevent(
        'UID:moved',
        'DTSTART;TZID=America/Chicago:20260701T200000',
        'DTEND;TZID=America/Chicago:20260701T210000',
        'RRULE:FREQ=DAILY;COUNT=4',
        'SUMMARY:Practice',
      ),
      ...vevent(
        'UID:moved',
        'RECURRENCE-ID;TZID=America/Chicago:20260703T200000',
        'DTSTART;TZID=America/Chicago:20260703T223000',
        'DTEND;TZID=America/Chicago:20260703T233000',
        'SUMMARY:Practice (moved late)',
      ),
    );
    const events = parseIcsEvents(text, WINDOW_START, WINDOW_END);
    const starts = events.map((e) => e.start.toISOString());
    // Original July 3 8pm slot (2026-07-04T01:00:00Z) must NOT appear.
    expect(starts).not.toContain('2026-07-04T01:00:00.000Z');
    // The moved instance (10:30pm CDT = 2026-07-04T03:30:00Z) appears once.
    expect(starts.filter((s) => s === '2026-07-04T03:30:00.000Z')).toHaveLength(1);
  });

  it('emits a well-formed RRULE string that rrulestr can parse', () => {
    const text = ics(
      ...vevent(
        'UID:weekly',
        'DTSTART;TZID=America/Chicago:20260706T090000',
        'DTEND;TZID=America/Chicago:20260706T100000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
        'SUMMARY:Class',
      ),
    );
    const events = parseIcsEvents(text, WINDOW_START, WINDOW_END);
    expect(events.length).toBeGreaterThan(0);
    for (const ev of events) {
      expect(ev.rrule).toMatch(/^RRULE:FREQ=/);
      expect(ev.rrule).not.toContain('RRULE:RRULE');
      expect(() => rrulestr(ev.rrule!)).not.toThrow();
    }
  });

  it('leaves non-recurring events untouched', () => {
    const text = ics(
      ...vevent(
        'UID:one',
        'DTSTART;TZID=America/Chicago:20260710T140000',
        'DTEND;TZID=America/Chicago:20260710T150000',
        'SUMMARY:Dentist',
      ),
    );
    const events = parseIcsEvents(text, WINDOW_START, WINDOW_END);
    expect(events).toHaveLength(1);
    expect(events[0]!.start.toISOString()).toBe('2026-07-10T19:00:00.000Z'); // 2pm CDT
    expect(events[0]!.rrule).toBeUndefined();
  });

  it('caps expansion of a pathological high-frequency rule', () => {
    const text = ics(
      ...vevent(
        'UID:evil',
        'DTSTART;TZID=America/Chicago:20260701T000000',
        'DTEND;TZID=America/Chicago:20260701T000100',
        'RRULE:FREQ=MINUTELY',
        'SUMMARY:Flood',
      ),
    );
    const events = parseIcsEvents(text, WINDOW_START, WINDOW_END);
    expect(events.length).toBeLessThanOrEqual(1000);
  });
});

describe('isPublicAddress', () => {
  it('rejects private, loopback, and link-local addresses', () => {
    for (const addr of [
      '127.0.0.1',
      '10.0.0.8',
      '172.20.1.1',
      '192.168.1.10',
      '169.254.1.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:192.168.1.10',
    ]) {
      expect(isPublicAddress(addr), addr).toBe(false);
    }
  });

  it('accepts public addresses', () => {
    for (const addr of ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']) {
      expect(isPublicAddress(addr), addr).toBe(true);
    }
  });
});

describe('fetchIcsText SSRF + size guards', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects non-http(s) schemes without a network call', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await expect(fetchIcsText('ftp://example.com/cal.ics')).rejects.toMatchObject({ status: 400 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects loopback and private IP literals without a network call', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    for (const url of [
      'http://localhost/cal.ics',
      'http://127.0.0.1/cal.ics',
      'http://192.168.1.1/cal.ics',
      'http://[::1]/cal.ics',
    ]) {
      await expect(fetchIcsText(url)).rejects.toMatchObject({ status: 400 });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  // Use a public IP literal so the guard skips DNS (keeps tests offline-safe).
  const PUBLIC = 'https://93.184.216.34/cal.ics';

  it('rejects a body that exceeds the size cap via content-length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('BEGIN:VCALENDAR', {
          status: 200,
          headers: { 'content-length': String(6 * 1024 * 1024) },
        }),
      ),
    );
    await expect(fetchIcsText(PUBLIC)).rejects.toMatchObject({ message: 'Feed too large' });
  });

  it('re-validates redirect targets against the guard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/x' } }),
      ),
    );
    await expect(fetchIcsText(PUBLIC)).rejects.toMatchObject({ status: 400 });
  });

  it('stops after too many redirects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(null, { status: 302, headers: { location: 'https://93.184.216.34/next' } }),
      ),
    );
    await expect(fetchIcsText(PUBLIC)).rejects.toMatchObject({
      message: 'Feed redirected too many times',
    });
  });
});
