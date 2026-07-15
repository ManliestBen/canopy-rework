/**
 * These tests run with TZ=America/Chicago (see package test script via
 * vitest config) so DST transitions are exercised: spring forward
 * 2026-03-08 (23h day), fall back 2026-11-01 (25h day).
 */
import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  addWeeksToKey,
  daysBetween,
  fromDateKey,
  instantToLocal,
  keysInRange,
  monthGridKeys,
  toDateKey,
  todayKey,
  weekKeys,
  weekStartKey,
} from './dates';

describe('DST safety (TZ=America/Chicago)', () => {
  it('navigates forward across spring-forward without skipping a day', () => {
    // 2026-03-08 02:00 CST → 03:00 CDT (23-hour day). ms-arithmetic breaks here.
    expect(addDaysToKey('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDaysToKey('2026-03-08', 1)).toBe('2026-03-09');
  });

  it('navigates backward across spring-forward', () => {
    expect(addDaysToKey('2026-03-09', -1)).toBe('2026-03-08');
    expect(addDaysToKey('2026-03-08', -1)).toBe('2026-03-07');
  });

  it('navigates across fall-back (25-hour day) without repeating a day', () => {
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToKey('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDaysToKey('2026-11-02', -1)).toBe('2026-11-01');
  });

  it('week navigation lands on the right week across DST', () => {
    expect(addWeeksToKey('2026-03-04', 1)).toBe('2026-03-11');
    expect(addWeeksToKey('2026-11-04', -1)).toBe('2026-10-28');
  });

  it('daysBetween counts calendar days, not 24h blocks', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
});

describe('local-date correctness (no UTC leakage)', () => {
  it('todayKey matches local calendar date, not the UTC date', () => {
    // 2026-01-15 20:30 in Chicago is 2026-01-16 02:30 UTC.
    // toISOString().slice(0,10) would say "tomorrow" — the original bug.
    const evening = new Date(2026, 0, 15, 20, 30);
    expect(toDateKey(evening)).toBe('2026-01-15');
    expect(evening.toISOString().slice(0, 10)).toBe('2026-01-16'); // the trap
    expect(todayKey()).toBe(toDateKey(new Date()));
  });

  it('round-trips DateKey ↔ Date at local midnight', () => {
    const d = fromDateKey('2026-07-04');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(0);
    expect(toDateKey(d)).toBe('2026-07-04');
  });

  it('rejects malformed keys', () => {
    expect(() => fromDateKey('2026-13-40')).toThrow();
    expect(() => fromDateKey('garbage')).toThrow();
    expect(() => fromDateKey('2026-1-5')).toThrow();
  });

  it('instantToLocal converts an offset instant to local wall time', () => {
    // 18:00 UTC = 12:00 CST in January
    const { dateKey, minutes } = instantToLocal('2026-01-10T18:00:00Z');
    expect(dateKey).toBe('2026-01-10');
    expect(minutes).toBe(12 * 60);
  });
});

describe('grids and ranges', () => {
  it('weekKeys returns Sunday-start weeks', () => {
    const keys = weekKeys('2026-07-15'); // a Wednesday
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-07-12');
    expect(keys[6]).toBe('2026-07-18');
    expect(weekStartKey('2026-07-15')).toBe('2026-07-12');
  });

  it('monthGridKeys pads to full weeks', () => {
    const keys = monthGridKeys('2026-07-15');
    expect(keys.length % 7).toBe(0);
    expect(keys[0]).toBe('2026-06-28'); // July 2026 starts Wednesday
    expect(keys[keys.length - 1]).toBe('2026-08-01');
  });

  it('keysInRange is inclusive and order-safe', () => {
    expect(keysInRange('2026-07-01', '2026-07-03')).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
    expect(keysInRange('2026-07-03', '2026-07-01')).toHaveLength(3);
  });
});
