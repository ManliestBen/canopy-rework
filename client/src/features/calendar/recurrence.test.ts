import { describe, expect, it } from 'vitest';
import { describeRrule, presetToRrule, rruleToPreset } from './recurrence';

describe('rruleToPreset (round-trip safety)', () => {
  it('recognizes the picker presets', () => {
    expect(rruleToPreset(undefined)).toBe('none');
    expect(rruleToPreset('RRULE:FREQ=DAILY')).toBe('daily');
    expect(rruleToPreset('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('weekdays');
    expect(rruleToPreset('RRULE:FREQ=WEEKLY;BYDAY=TU')).toBe('weekly');
    expect(rruleToPreset('RRULE:FREQ=MONTHLY;BYMONTHDAY=15')).toBe('monthly');
    expect(rruleToPreset('RRULE:FREQ=YEARLY')).toBe('yearly');
  });

  it('classifies everything else as custom — never rewrites it', () => {
    // The exact shapes the original app corrupted into "every weekday":
    expect(rruleToPreset('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU')).toBe('custom');
    expect(rruleToPreset('RRULE:FREQ=MONTHLY;BYDAY=2SU')).toBe('custom');
    expect(rruleToPreset('RRULE:FREQ=DAILY;COUNT=10')).toBe('custom');
    expect(rruleToPreset('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe('custom');
    expect(rruleToPreset('RRULE:FREQ=WEEKLY;UNTIL=20261231T000000Z;BYDAY=TH')).toBe(
      'custom',
    );
    expect(rruleToPreset('garbage')).toBe('custom');
  });

  it('presets survive a full round trip', () => {
    for (const preset of ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const) {
      const rule = presetToRrule(preset, '2026-07-14'); // a Tuesday
      expect(rruleToPreset(rule)).toBe(preset);
    }
  });

  it('generates start-day-aware weekly/monthly rules', () => {
    expect(presetToRrule('weekly', '2026-07-14')).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU');
    expect(presetToRrule('monthly', '2026-07-14')).toBe(
      'RRULE:FREQ=MONTHLY;BYMONTHDAY=14',
    );
  });

  it('describes custom rules in words instead of hiding them', () => {
    expect(describeRrule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU')).toMatch(/every 2 weeks/i);
    expect(describeRrule(undefined)).toBe('Does not repeat');
  });
});
