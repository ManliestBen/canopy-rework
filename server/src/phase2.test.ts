import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CalendarSource } from '@canopy/shared';
import { createApp } from './app.js';
import { closeDb, openTestDb } from './db/index.js';
import { createCalendar } from './services/calendars.js';
import {
  __setFetchersForTests,
  clearCacheForTests,
  getEvents,
  normalizeGoogleEvent,
  normalizeIcsEvent,
  refreshCalendar,
} from './services/eventCache.js';
import { parseIcsEvents } from './services/icsFeed.js';

const CAL: CalendarSource = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Family',
  sourceType: 'google',
  sourceRef: 'family@group.calendar.google.com',
  color: 'teal',
  userId: null,
};

describe('normalizeGoogleEvent', () => {
  it('normalizes a timed event', () => {
    const ev = normalizeGoogleEvent(
      {
        id: 'abc',
        summary: 'Dentist',
        start: { dateTime: '2026-07-20T14:00:00-05:00' },
        end: { dateTime: '2026-07-20T15:00:00-05:00' },
        location: 'Main St',
      },
      CAL,
    )!;
    expect(ev.title).toBe('Dentist');
    expect(ev.allDay).toBe(false);
    expect(ev.startKey).toBe('2026-07-20');
    expect(ev.endKey).toBe('2026-07-20');
    expect(ev.readOnly).toBe(false);
  });

  it('converts exclusive all-day ends to inclusive endKey', () => {
    // A 2-day camping trip: Google says start 07-10, end 07-12 (exclusive).
    const ev = normalizeGoogleEvent(
      {
        id: 'trip',
        summary: 'Camping',
        start: { date: '2026-07-10' },
        end: { date: '2026-07-12' },
      },
      CAL,
    )!;
    expect(ev.allDay).toBe(true);
    expect(ev.startKey).toBe('2026-07-10');
    expect(ev.endKey).toBe('2026-07-11'); // inclusive
  });

  it('keeps timed events crossing midnight on both days', () => {
    const ev = normalizeGoogleEvent(
      {
        id: 'party',
        summary: 'NYE Party',
        start: { dateTime: '2026-12-31T21:00:00-06:00' },
        end: { dateTime: '2027-01-01T01:00:00-06:00' },
      },
      CAL,
    )!;
    // The original app dropped these from every day after the first.
    expect(ev.startKey).toBe('2026-12-31');
    expect(ev.endKey).toBe('2027-01-01');
  });

  it('drops cancelled and malformed items', () => {
    expect(normalizeGoogleEvent({ id: 'x', status: 'cancelled' }, CAL)).toBeNull();
    expect(normalizeGoogleEvent({ id: 'y' }, CAL)).toBeNull();
  });
});

describe('ICS parsing', () => {
  const ICS_FIXTURE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
X-WR-CALNAME:School Events
BEGIN:VEVENT
UID:single-1
SUMMARY:Field Trip
DTSTART;VALUE=DATE:20260720
DTEND;VALUE=DATE:20260721
END:VEVENT
BEGIN:VEVENT
UID:weekly-1
SUMMARY:Soccer Practice
DTSTART:20260706T220000Z
DTEND:20260706T230000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
END:VEVENT
END:VCALENDAR`;

  it('parses single and recurring events within the window', () => {
    const events = parseIcsEvents(
      ICS_FIXTURE,
      new Date('2026-07-01T00:00:00Z'),
      new Date('2026-08-01T00:00:00Z'),
    );
    const fieldTrip = events.find((e) => e.title === 'Field Trip');
    expect(fieldTrip).toBeDefined();
    expect(fieldTrip!.allDay).toBe(true);

    const practices = events.filter((e) => e.title === 'Soccer Practice');
    // Mondays in July 2026 within window: Jul 6, 13, 20, 27.
    expect(practices.length).toBe(4);
    expect(practices[0]!.rrule).toContain('FREQ=WEEKLY');
  });

  it('normalizeIcsEvent marks events read-only', () => {
    const events = parseIcsEvents(
      ICS_FIXTURE,
      new Date('2026-07-19T00:00:00Z'),
      new Date('2026-07-22T00:00:00Z'),
    );
    const ev = normalizeIcsEvent(events.find((e) => e.title === 'Field Trip')!, {
      ...CAL,
      sourceType: 'ics',
    });
    expect(ev.readOnly).toBe(true);
    expect(ev.startKey).toBe('2026-07-20');
    expect(ev.endKey).toBe('2026-07-20'); // exclusive DTEND collapsed
  });
});

describe('event cache', () => {
  beforeEach(() => {
    openTestDb();
    clearCacheForTests();
  });
  afterEach(() => closeDb());

  it('serves last-good events when a refresh fails', async () => {
    const cal = createCalendar({
      title: 'Family',
      sourceType: 'google',
      sourceRef: 'fam@example.com',
      color: 'teal',
    });
    const good = [
      {
        id: 'e1',
        calendarId: cal.id,
        calendarTitle: 'Family',
        color: 'teal' as const,
        userId: null,
        title: 'Dinner',
        allDay: false,
        start: '2026-07-16T23:00:00.000Z',
        end: '2026-07-17T00:00:00.000Z',
        startKey: '2026-07-16',
        endKey: '2026-07-16',
        readOnly: false,
      },
    ];
    __setFetchersForTests({ google: async () => good });
    await refreshCalendar(cal);
    expect(getEvents('2026-07-16', '2026-07-16').events).toHaveLength(1);

    // Now Google goes down — cache keeps serving, status flips to error.
    __setFetchersForTests({
      google: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await refreshCalendar(cal);
    const res = getEvents('2026-07-16', '2026-07-16');
    expect(res.events).toHaveLength(1);
    expect(res.calendars[0]!.status).toBe('error');
    // Raw upstream detail (ECONNREFUSED) is logged, not reflected to clients.
    expect(res.calendars[0]!.error).toBe('Could not refresh this calendar');
  });

  it('filters by day-key overlap, including multi-day spans', async () => {
    const cal = createCalendar({
      title: 'Family',
      sourceType: 'google',
      sourceRef: 'fam2@example.com',
      color: 'coral',
    });
    __setFetchersForTests({
      google: async () => [
        {
          id: 'trip',
          calendarId: cal.id,
          calendarTitle: 'Family',
          color: 'coral' as const,
          userId: null,
          title: 'Camping',
          allDay: true,
          start: '2026-07-10T05:00:00.000Z',
          end: '2026-07-12T05:00:00.000Z',
          startKey: '2026-07-10',
          endKey: '2026-07-11',
          readOnly: false,
        },
      ],
    });
    await refreshCalendar(cal);
    // Query only the second day of the trip: still matches.
    expect(getEvents('2026-07-11', '2026-07-11').events).toHaveLength(1);
    expect(getEvents('2026-07-12', '2026-07-13').events).toHaveLength(0);
  });
});

describe('calendar & event routes', () => {
  beforeEach(() => {
    openTestDb();
    clearCacheForTests();
  });
  afterEach(() => closeDb());

  it('creates and lists calendar sources; rejects duplicates', async () => {
    __setFetchersForTests({ google: async () => [] });
    const app = createApp();
    const created = await request(app).post('/api/calendars').send({
      title: 'Family',
      sourceType: 'google',
      sourceRef: 'fam3@example.com',
      color: 'lavender',
    });
    expect(created.status).toBe(201);

    const dup = await request(app).post('/api/calendars').send({
      title: 'Family again',
      sourceType: 'google',
      sourceRef: 'fam3@example.com',
      color: 'teal',
    });
    expect(dup.status).toBe(409);
  });

  it('rejects writes to ICS calendars', async () => {
    __setFetchersForTests({ ics: async () => [] });
    const app = createApp();
    const created = await request(app).post('/api/calendars').send({
      title: 'School',
      sourceType: 'ics',
      sourceRef: 'https://school.example.com/cal.ics',
      color: 'green',
    });
    const res = await request(app)
      .post(`/api/events/${created.body.id}`)
      .send({ title: 'Nope', allDay: true, startKey: '2026-07-20', endKey: '2026-07-20' });
    expect(res.status).toBe(403);
  });

  it('validates event input (timed events need times)', async () => {
    __setFetchersForTests({ google: async () => [] });
    const app = createApp();
    const created = await request(app).post('/api/calendars').send({
      title: 'Family',
      sourceType: 'google',
      sourceRef: 'fam4@example.com',
      color: 'blue',
    });
    const res = await request(app)
      .post(`/api/events/${created.body.id}`)
      .send({ title: 'Missing times', allDay: false, startKey: '2026-07-20', endKey: '2026-07-20' });
    expect(res.status).toBe(400);
  });

  it('serves events with range validation', async () => {
    const app = createApp();
    expect((await request(app).get('/api/events?from=2026-07-01&to=2026-07-31')).status).toBe(
      200,
    );
    expect((await request(app).get('/api/events?from=bogus&to=2026-07-31')).status).toBe(400);
  });
});
