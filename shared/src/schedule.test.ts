import { describe, expect, it } from 'vitest';
import { occursOn } from './schedule';

describe('occursOn', () => {
  it('one-time items occur only on their date', () => {
    expect(occursOn('none', '2026-07-15', '2026-07-15')).toBe(true);
    expect(occursOn('none', '2026-07-15', '2026-07-16')).toBe(false);
    expect(occursOn('none', null, '2026-07-16')).toBe(false);
  });

  it('daily occurs every day from the anchor forward', () => {
    expect(occursOn('daily', '2026-07-15', '2026-07-15')).toBe(true);
    expect(occursOn('daily', '2026-07-15', '2026-08-01')).toBe(true);
    expect(occursOn('daily', '2026-07-15', '2026-07-14')).toBe(false);
    expect(occursOn('daily', null, '2026-07-14')).toBe(true);
  });

  it('weekdays skips weekends', () => {
    expect(occursOn('weekdays', null, '2026-07-15')).toBe(true); // Wed
    expect(occursOn('weekdays', null, '2026-07-18')).toBe(false); // Sat
    expect(occursOn('weekdays', null, '2026-07-19')).toBe(false); // Sun
  });

  it('weekly matches the anchor weekday', () => {
    // 2026-07-15 is a Wednesday
    expect(occursOn('weekly', '2026-07-15', '2026-07-22')).toBe(true);
    expect(occursOn('weekly', '2026-07-15', '2026-07-23')).toBe(false);
    expect(occursOn('weekly', '2026-07-15', '2026-07-08')).toBe(false); // before anchor
  });

  it('monthly matches the anchor day-of-month and skips short months', () => {
    expect(occursOn('monthly', '2026-01-31', '2026-03-31')).toBe(true);
    expect(occursOn('monthly', '2026-01-31', '2026-02-28')).toBe(false);
    expect(occursOn('monthly', '2026-01-15', '2026-02-15')).toBe(true);
  });
});
