import { describe, expect, it } from 'vitest';
import { aggregateForecast } from './services/weather.js';

function entry(iso: string, min: number, max: number, icon: string, pop = 0) {
  return {
    dt: Math.floor(new Date(iso).getTime() / 1000),
    main: { temp_min: min, temp_max: max },
    weather: [{ icon, description: `desc-${icon}` }],
    pop,
  };
}

describe('aggregateForecast', () => {
  it('collapses 3-hourly entries into daily min/max', () => {
    const days = aggregateForecast([
      entry('2026-07-15T06:00:00', 61, 64, '01d'),
      entry('2026-07-15T12:00:00', 70, 78, '02d', 0.1),
      entry('2026-07-15T18:00:00', 72, 81, '10d', 0.4),
      entry('2026-07-16T12:00:00', 65, 70, '11d', 0.9),
    ]);
    expect(days).toHaveLength(2);
    expect(days[0]!.min).toBe(61);
    expect(days[0]!.max).toBe(81);
    expect(days[0]!.pop).toBe(0.4); // worst-case precipitation
    expect(days[1]!.emoji).toBe('⛈️');
  });

  it('uses the entry closest to midday as the face of the day', () => {
    const days = aggregateForecast([
      entry('2026-07-15T03:00:00', 60, 62, '01n'),
      entry('2026-07-15T12:00:00', 70, 75, '02d'),
      entry('2026-07-15T21:00:00', 66, 68, '09n'),
    ]);
    expect(days[0]!.emoji).toBe('⛅'); // the 12:00 icon, not 03:00 or 21:00
    expect(days[0]!.description).toBe('desc-02d');
  });

  it('sorts days chronologically', () => {
    const days = aggregateForecast([
      entry('2026-07-17T12:00:00', 60, 70, '01d'),
      entry('2026-07-15T12:00:00', 60, 70, '01d'),
    ]);
    expect(days.map((d) => d.dateKey)).toEqual(['2026-07-15', '2026-07-17']);
  });
});
