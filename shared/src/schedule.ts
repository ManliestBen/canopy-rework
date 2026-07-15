import { fromDateKey, type DateKey } from './dates';

/**
 * Lightweight recurrence for tasks and chores (calendar events use full
 * RRULEs; household routines don't need that power). Anchored at
 * `anchorKey` — the weekday/day-of-month comes from the anchor.
 */
export const SCHEDULES = ['none', 'daily', 'weekdays', 'weekly', 'monthly'] as const;
export type Schedule = (typeof SCHEDULES)[number];

export function occursOn(
  schedule: Schedule,
  anchorKey: DateKey | null,
  dateKey: DateKey,
): boolean {
  if (schedule === 'none') return anchorKey === dateKey;
  if (schedule === 'daily') return anchorKey === null || dateKey >= anchorKey;
  const date = fromDateKey(dateKey);
  if (schedule === 'weekdays') {
    const dow = date.getDay();
    return dow >= 1 && dow <= 5 && (anchorKey === null || dateKey >= anchorKey);
  }
  if (!anchorKey) return false;
  if (dateKey < anchorKey) return false;
  const anchor = fromDateKey(anchorKey);
  if (schedule === 'weekly') return date.getDay() === anchor.getDay();
  // monthly: same day-of-month; months without that day (31st) skip.
  return date.getDate() === anchor.getDate();
}

export const SCHEDULE_LABELS: Record<Schedule, string> = {
  none: 'One time',
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
  monthly: 'Monthly',
};
