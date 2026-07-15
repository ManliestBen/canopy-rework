import { Router } from 'express';
import { z } from 'zod';
import { DATE_KEY_REGEX, EventInputSchema, type EventInput } from '@canopy/shared';
import type { calendar_v3 } from 'googleapis';
import { wrap } from '../lib/asyncRoute.js';
import { getCalendar, listCalendars } from '../services/calendars.js';
import { getEvents, refreshAll, refreshCalendar } from '../services/eventCache.js';
import {
  deleteGoogleEvent,
  insertGoogleEvent,
  patchGoogleEvent,
} from '../services/googleCalendar.js';

export const eventsRouter = Router();

const RangeSchema = z.object({
  from: z.string().regex(DATE_KEY_REGEX),
  to: z.string().regex(DATE_KEY_REGEX),
});

eventsRouter.get('/', (req, res) => {
  const { from, to } = RangeSchema.parse(req.query);
  res.json(getEvents(from, to));
});

eventsRouter.post(
  '/refresh',
  wrap(async (_req, res) => {
    await refreshAll();
    res.json({ ok: true, calendars: listCalendars().length });
  }),
);

const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Map our validated EventInput to a Google event body. */
function toGoogleBody(input: EventInput): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {
    summary: input.title,
    location: input.location || undefined,
    description: input.description || undefined,
    recurrence: input.rrule ? [input.rrule] : undefined,
  };
  if (input.allDay) {
    // Google all-day end dates are EXCLUSIVE.
    const endExclusive = new Date(`${input.endKey}T00:00:00`);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const y = endExclusive.getFullYear();
    const m = String(endExclusive.getMonth() + 1).padStart(2, '0');
    const d = String(endExclusive.getDate()).padStart(2, '0');
    body.start = { date: input.startKey };
    body.end = { date: `${y}-${m}-${d}` };
  } else {
    body.start = {
      dateTime: `${input.startKey}T${input.startTime}:00`,
      timeZone: localTimeZone,
    };
    body.end = {
      dateTime: `${input.endKey}T${input.endTime}:00`,
      timeZone: localTimeZone,
    };
  }
  return body;
}

function requireWritable(calendarId: string) {
  const cal = getCalendar(calendarId);
  if (cal.sourceType !== 'google') {
    throw Object.assign(new Error('Subscribed (ICS) calendars are read-only.'), {
      status: 403,
    });
  }
  return cal;
}

eventsRouter.post(
  '/:calendarId',
  wrap(async (req, res) => {
    const cal = requireWritable(z.string().uuid().parse(req.params.calendarId));
    const input = EventInputSchema.parse(req.body);
    const created = await insertGoogleEvent(cal.sourceRef, toGoogleBody(input));
    await refreshCalendar(cal);
    res.status(201).json({ ok: true, id: created.id });
  }),
);

eventsRouter.patch(
  '/:calendarId/:eventId',
  wrap(async (req, res) => {
    const cal = requireWritable(z.string().uuid().parse(req.params.calendarId));
    const eventId = z.string().min(1).max(1024).parse(req.params.eventId);
    const input = EventInputSchema.parse(req.body);
    await patchGoogleEvent(cal.sourceRef, eventId, toGoogleBody(input));
    await refreshCalendar(cal);
    res.json({ ok: true });
  }),
);

eventsRouter.delete(
  '/:calendarId/:eventId',
  wrap(async (req, res) => {
    const cal = requireWritable(z.string().uuid().parse(req.params.calendarId));
    const eventId = z.string().min(1).max(1024).parse(req.params.eventId);
    await deleteGoogleEvent(cal.sourceRef, eventId);
    await refreshCalendar(cal);
    res.json({ ok: true });
  }),
);
