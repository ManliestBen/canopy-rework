import { RRule, rrulestr } from 'rrule';
import { fromDateKey, type DateKey } from '@canopy/shared';

/**
 * Recurrence round-trip. The original app's edit modal silently rewrote
 * ANY existing rule to "every weekday" because it never parsed the
 * RRULE back. Rules we can't represent in the picker are preserved
 * verbatim as 'custom' and displayed in plain words.
 */
export type RecurrencePreset =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

const WEEKDAYS = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];

export function presetToRrule(preset: RecurrencePreset, startKey: DateKey): string | undefined {
  const start = fromDateKey(startKey);
  switch (preset) {
    case 'none':
    case 'custom':
      return undefined; // custom keeps the original string (caller's job)
    case 'daily':
      return 'RRULE:FREQ=DAILY';
    case 'weekdays':
      return 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly': {
      const day = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][start.getDay()];
      return `RRULE:FREQ=WEEKLY;BYDAY=${day}`;
    }
    case 'monthly':
      return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${start.getDate()}`;
    case 'yearly':
      return 'RRULE:FREQ=YEARLY';
  }
}

/** Classify an RRULE into a preset, or 'custom' when it doesn't fit. */
export function rruleToPreset(rrule: string | undefined): RecurrencePreset {
  if (!rrule) return 'none';
  let rule: RRule;
  try {
    rule = rrulestr(rrule) as RRule;
  } catch {
    return 'custom';
  }
  // origOptions holds only what the rule EXPLICITLY specifies —
  // rule.options back-fills BY* parts from dtstart, which would
  // misclassify (e.g. bare FREQ=YEARLY gains a bymonthday).
  const o = rule.origOptions;
  if ((o.interval ?? 1) !== 1 || o.count || o.until) return 'custom';

  const weekdays = (
    o.byweekday === undefined ? [] : Array.isArray(o.byweekday) ? o.byweekday : [o.byweekday]
  ).map((d) => (typeof d === 'number' ? { weekday: d, n: undefined } : d)) as {
    weekday: number;
    n?: number | null;
  }[];
  const monthdays =
    o.bymonthday === undefined
      ? []
      : Array.isArray(o.bymonthday)
        ? o.bymonthday
        : [o.bymonthday];
  // "2nd Sunday" style rules are custom.
  if (weekdays.some((d) => d.n != null)) return 'custom';

  if (o.freq === RRule.DAILY) {
    return weekdays.length === 0 && monthdays.length === 0 ? 'daily' : 'custom';
  }
  if (o.freq === RRule.WEEKLY) {
    if (monthdays.length > 0) return 'custom';
    const nums = weekdays.map((d) => d.weekday);
    const weekdayNums = WEEKDAYS.map((d) => d.weekday);
    if (nums.length === 5 && weekdayNums.every((d) => nums.includes(d))) return 'weekdays';
    if (nums.length <= 1) return 'weekly';
    return 'custom';
  }
  if (o.freq === RRule.MONTHLY) {
    return weekdays.length === 0 && monthdays.length <= 1 ? 'monthly' : 'custom';
  }
  if (o.freq === RRule.YEARLY) {
    return weekdays.length === 0 && monthdays.length === 0 && !o.bymonth
      ? 'yearly'
      : 'custom';
  }
  return 'custom';
}

/** Human sentence for any rule ("every 2 weeks on Tuesday until…"). */
export function describeRrule(rrule: string | undefined): string {
  if (!rrule) return 'Does not repeat';
  try {
    return (rrulestr(rrule) as RRule).toText();
  } catch {
    return 'Repeats (custom rule)';
  }
}
