import { z } from 'zod';
import { DATE_KEY_REGEX, TIME_REGEX } from '../dates';
import { FamilyColorSchema } from './users';

/** A calendar source: a shared Google calendar or a subscribed ICS feed. */
export const CalendarSourceSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  sourceType: z.enum(['google', 'ics']),
  /** Google calendar ID, or an ICS URL. */
  sourceRef: z.string().trim().min(3).max(500),
  color: FamilyColorSchema,
  /** Optionally link a family member — their chip shows on events. */
  userId: z.string().uuid().nullable().default(null),
});
export type CalendarSource = z.infer<typeof CalendarSourceSchema>;

export const CalendarCreateSchema = CalendarSourceSchema.omit({ id: true }).extend({
  userId: z.string().uuid().nullable().optional(),
});
export type CalendarCreate = z.infer<typeof CalendarCreateSchema>;

export const CalendarPatchSchema = CalendarSourceSchema.omit({
  id: true,
  sourceType: true,
}).partial().strict();
export type CalendarPatch = z.infer<typeof CalendarPatchSchema>;

/** Normalized event served by /api/events — identical for Google and ICS. */
export const CalendarEventSchema = z.object({
  id: z.string(),
  calendarId: z.string().uuid(),
  calendarTitle: z.string(),
  color: FamilyColorSchema,
  userId: z.string().uuid().nullable(),
  title: z.string(),
  allDay: z.boolean(),
  /** ISO instants for timed events; local midnights for all-day. */
  start: z.string(),
  end: z.string(),
  /** Local calendar days the event touches (inclusive) — precomputed. */
  startKey: z.string().regex(DATE_KEY_REGEX),
  endKey: z.string().regex(DATE_KEY_REGEX),
  location: z.string().optional(),
  description: z.string().optional(),
  /** Raw RRULE of the series master, if recurring. */
  rrule: z.string().optional(),
  /** ICS events (and Google events we can't write) are read-only. */
  readOnly: z.boolean(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const EventsResponseSchema = z.object({
  events: z.array(CalendarEventSchema),
  calendars: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      color: FamilyColorSchema,
      userId: z.string().uuid().nullable(),
      sourceType: z.enum(['google', 'ics']),
      status: z.enum(['ok', 'stale', 'error', 'pending']),
      fetchedAt: z.string().nullable(),
      error: z.string().optional(),
    }),
  ),
});
export type EventsResponse = z.infer<typeof EventsResponseSchema>;

/** Payload for creating/updating an event (Google calendars only). */
export const EventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    allDay: z.boolean(),
    startKey: z.string().regex(DATE_KEY_REGEX),
    endKey: z.string().regex(DATE_KEY_REGEX),
    /** Required for timed events, HH:MM 24h. */
    startTime: z.string().regex(TIME_REGEX).optional(),
    endTime: z.string().regex(TIME_REGEX).optional(),
    location: z.string().trim().max(300).optional(),
    description: z.string().trim().max(4000).optional(),
    /** Full RRULE line ("RRULE:FREQ=WEEKLY;BYDAY=MO"), or omitted. */
    rrule: z.string().startsWith('RRULE:').max(500).optional(),
  })
  .refine((v) => v.allDay || (v.startTime && v.endTime), {
    message: 'Timed events need start and end times',
  });
export type EventInput = z.infer<typeof EventInputSchema>;

export const GoogleStatusSchema = z.object({
  configured: z.boolean(),
  serviceAccountEmail: z.string().nullable(),
  reachable: z.boolean().nullable(),
});
export type GoogleStatus = z.infer<typeof GoogleStatusSchema>;
