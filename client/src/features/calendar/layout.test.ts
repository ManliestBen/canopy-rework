import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '@canopy/shared';
import { isBanner, layoutBanners, layoutDay } from './layout';

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: Math.random().toString(36).slice(2),
    calendarId: '11111111-1111-4111-8111-111111111111',
    calendarTitle: 'Family',
    color: 'teal',
    userId: null,
    title: 'Event',
    allDay: false,
    start: '2026-07-15T14:00:00.000Z',
    end: '2026-07-15T15:00:00.000Z',
    startKey: '2026-07-15',
    endKey: '2026-07-15',
    readOnly: false,
    ...overrides,
  };
}

// Tests run in UTC unless configured otherwise; build instants from
// local wall times so assertions are TZ-independent.
function local(dateKey: string, hhmm: string): string {
  return new Date(`${dateKey}T${hhmm}:00`).toISOString();
}

describe('layoutDay', () => {
  it('positions events by local minutes', () => {
    const [pos] = layoutDay(
      [makeEvent({ start: local('2026-07-15', '09:30'), end: local('2026-07-15', '10:15') })],
      '2026-07-15',
    );
    expect(pos!.startMin).toBe(9 * 60 + 30);
    expect(pos!.endMin).toBe(10 * 60 + 15);
    expect(pos!.lanes).toBe(1);
  });

  it('assigns lanes to overlapping events', () => {
    const events = [
      makeEvent({ start: local('2026-07-15', '09:00'), end: local('2026-07-15', '11:00') }),
      makeEvent({ start: local('2026-07-15', '10:00'), end: local('2026-07-15', '12:00') }),
      makeEvent({ start: local('2026-07-15', '11:30'), end: local('2026-07-15', '12:30') }),
    ];
    const positioned = layoutDay(events, '2026-07-15');
    expect(positioned[0]!.lane).toBe(0);
    expect(positioned[1]!.lane).toBe(1);
    // Third starts after the first ends → reuses lane 0, same cluster.
    expect(positioned[2]!.lane).toBe(0);
    expect(positioned.every((p) => p.lanes === 2)).toBe(true);
  });

  it('splits an overnight event at midnight with continuation flags', () => {
    const overnight = makeEvent({
      start: local('2026-07-15', '21:00'),
      end: local('2026-07-16', '01:00'),
      startKey: '2026-07-15',
      endKey: '2026-07-16',
    });
    const day1 = layoutDay([overnight], '2026-07-15');
    expect(day1[0]!.startMin).toBe(21 * 60);
    expect(day1[0]!.endMin).toBe(24 * 60);
    expect(day1[0]!.continuesAfter).toBe(true);

    const day2 = layoutDay([overnight], '2026-07-16');
    expect(day2[0]!.startMin).toBe(0);
    expect(day2[0]!.continuesBefore).toBe(true);
  });

  it('gives short events a minimum tappable height', () => {
    const [pos] = layoutDay(
      [makeEvent({ start: local('2026-07-15', '09:00'), end: local('2026-07-15', '09:10') })],
      '2026-07-15',
    );
    expect(pos!.endMin - pos!.startMin).toBeGreaterThanOrEqual(30);
  });
});

describe('layoutBanners', () => {
  const week = [
    '2026-07-12',
    '2026-07-13',
    '2026-07-14',
    '2026-07-15',
    '2026-07-16',
    '2026-07-17',
    '2026-07-18',
  ];

  it('classifies all-day and multi-day events as banners', () => {
    expect(isBanner(makeEvent({ allDay: true }))).toBe(true);
    expect(isBanner(makeEvent({ startKey: '2026-07-15', endKey: '2026-07-16' }))).toBe(true);
    expect(isBanner(makeEvent({}))).toBe(false);
  });

  it('spans the right columns and clips at the window edges', () => {
    const camping = makeEvent({
      allDay: true,
      startKey: '2026-07-10', // before the visible week
      endKey: '2026-07-13',
    });
    const [placed] = layoutBanners([camping], week);
    expect(placed!.startCol).toBe(0);
    expect(placed!.endCol).toBe(1);
    expect(placed!.clippedStart).toBe(true);
    expect(placed!.clippedEnd).toBe(false);
  });

  it('packs non-overlapping banners into the same row', () => {
    const a = makeEvent({ allDay: true, startKey: '2026-07-12', endKey: '2026-07-13' });
    const b = makeEvent({ allDay: true, startKey: '2026-07-15', endKey: '2026-07-16' });
    const c = makeEvent({ allDay: true, startKey: '2026-07-12', endKey: '2026-07-18' });
    const placed = layoutBanners([a, c, b], week);
    const rows = new Map(placed.map((p) => [p.event.id, p.row]));
    // c spans everything → own row; a and b share the other row.
    expect(rows.get(a.id)).toBe(rows.get(b.id));
    expect(rows.get(c.id)).not.toBe(rows.get(a.id));
  });
});
