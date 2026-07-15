import { describe, expect, it } from 'vitest';
import { inSleepWindow } from './sleep';

describe('inSleepWindow', () => {
  it('handles same-day windows', () => {
    expect(inSleepWindow('13:00', '12:00', '14:00')).toBe(true);
    expect(inSleepWindow('11:59', '12:00', '14:00')).toBe(false);
    expect(inSleepWindow('14:00', '12:00', '14:00')).toBe(false); // end exclusive
  });

  it('handles windows crossing midnight', () => {
    expect(inSleepWindow('22:30', '21:30', '06:30')).toBe(true);
    expect(inSleepWindow('02:00', '21:30', '06:30')).toBe(true);
    expect(inSleepWindow('06:29', '21:30', '06:30')).toBe(true);
    expect(inSleepWindow('06:30', '21:30', '06:30')).toBe(false);
    expect(inSleepWindow('12:00', '21:30', '06:30')).toBe(false);
    expect(inSleepWindow('21:30', '21:30', '06:30')).toBe(true); // start inclusive
  });

  it('zero-length window never sleeps', () => {
    expect(inSleepWindow('12:00', '12:00', '12:00')).toBe(false);
  });
});
