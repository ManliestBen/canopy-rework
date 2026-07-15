/**
 * All date handling in Canopy flows through this module.
 *
 * Rules that prevent the bug classes found in the original app:
 * - A calendar day is a `DateKey` string ("2026-07-15"), never a Date at
 *   an assumed midnight and never a UTC slice of an ISO timestamp.
 * - Navigation uses date-fns calendar-field math (DST-safe), never
 *   millisecond arithmetic.
 * - "Today" is always computed at call time in the device's local zone.
 */
import {
  addDays,
  addWeeks,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isValid,
  parse,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns';

/** A local calendar day, formatted YYYY-MM-DD. */
export type DateKey = string;

export const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Local calendar day of a Date. */
export function toDateKey(d: Date): DateKey {
  return format(d, 'yyyy-MM-dd');
}

/** Parse a DateKey to a local-midnight Date. Throws on malformed input. */
export function fromDateKey(key: DateKey): Date {
  const d = parse(key, 'yyyy-MM-dd', new Date());
  if (!DATE_KEY_REGEX.test(key) || !isValid(d)) {
    throw new Error(`Invalid date key: ${key}`);
  }
  return d;
}

/** Today's local DateKey — never derived from toISOString(). */
export function todayKey(): DateKey {
  return toDateKey(new Date());
}

export function addDaysToKey(key: DateKey, days: number): DateKey {
  return toDateKey(addDays(fromDateKey(key), days));
}

export function addWeeksToKey(key: DateKey, weeks: number): DateKey {
  return toDateKey(addWeeks(fromDateKey(key), weeks));
}

export function addMonthsToKey(key: DateKey, months: number): DateKey {
  return toDateKey(addMonths(fromDateKey(key), months));
}

/** Sunday-start week, matching the Skylight reference layout. */
export function weekStartKey(key: DateKey): DateKey {
  return toDateKey(startOfWeek(fromDateKey(key), { weekStartsOn: 0 }));
}

/** The 7 DateKeys of the week containing `key`. */
export function weekKeys(key: DateKey): DateKey[] {
  const start = startOfWeek(fromDateKey(key), { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 0 }) }).map(toDateKey);
}

/** All DateKeys shown in a month grid (padded to full weeks). */
export function monthGridKeys(key: DateKey): DateKey[] {
  const d = fromDateKey(key);
  const start = startOfWeek(startOfMonth(d), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(d), { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end }).map(toDateKey);
}

/** Inclusive range of DateKeys between two keys (order-safe). */
export function keysInRange(startKey: DateKey, endKey: DateKey): DateKey[] {
  const start = fromDateKey(startKey);
  const end = fromDateKey(endKey);
  if (end < start) return keysInRange(endKey, startKey);
  return eachDayOfInterval({ start, end }).map(toDateKey);
}

export function daysBetween(a: DateKey, b: DateKey): number {
  return differenceInCalendarDays(fromDateKey(b), fromDateKey(a));
}

/** Local DateKey + minutes-from-midnight for an instant (event start/end). */
export function instantToLocal(iso: string): { dateKey: DateKey; minutes: number } {
  const d = new Date(iso);
  if (!isValid(d)) throw new Error(`Invalid instant: ${iso}`);
  return { dateKey: toDateKey(d), minutes: d.getHours() * 60 + d.getMinutes() };
}

/** Human labels used across the UI. */
export function formatKey(key: DateKey, fmt: string): string {
  return format(fromDateKey(key), fmt);
}

export function formatTime(iso: string): string {
  return format(new Date(iso), 'h:mm a');
}
