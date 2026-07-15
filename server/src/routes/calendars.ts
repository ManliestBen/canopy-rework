import { Router } from 'express';
import { z } from 'zod';
import { wrap } from '../lib/asyncRoute.js';
import {
  createCalendar,
  deleteCalendar,
  getCalendar,
  listCalendars,
  patchCalendar,
} from '../services/calendars.js';
import { refreshCalendar } from '../services/eventCache.js';
import { googleStatus, probeCalendar } from '../services/googleCalendar.js';
import { fetchIcsText } from '../services/icsFeed.js';

export const calendarsRouter = Router();

const IdParam = z.string().uuid();

calendarsRouter.get('/', (_req, res) => {
  res.json(listCalendars());
});

calendarsRouter.get('/google-status', (_req, res) => {
  const s = googleStatus();
  res.json({
    configured: s.configured,
    serviceAccountEmail: s.serviceAccountEmail,
    reachable: s.initError ? false : s.configured ? true : null,
  });
});

const VerifySchema = z.object({
  sourceType: z.enum(['google', 'ics']),
  sourceRef: z.string().trim().min(3).max(500),
});

/**
 * Setup UX: the client verifies a source BEFORE saving it, so users get
 * "✓ Found: Smith Family Calendar" instead of a silent failure later.
 */
calendarsRouter.post(
  '/verify',
  wrap(async (req, res) => {
    const { sourceType, sourceRef } = VerifySchema.parse(req.body);
    if (sourceType === 'google') {
      res.json(await probeCalendar(sourceRef));
      return;
    }
    try {
      const text = await fetchIcsText(sourceRef);
      if (!text.includes('BEGIN:VCALENDAR')) {
        res.json({ ok: false, error: 'That URL is not an ICS calendar feed.' });
        return;
      }
      const nameMatch = text.match(/X-WR-CALNAME:(.+)/);
      res.json({ ok: true, summary: nameMatch?.[1]?.trim() });
    } catch {
      res.json({ ok: false, error: 'Could not fetch that URL.' });
    }
  }),
);

calendarsRouter.post('/', (req, res) => {
  const created = createCalendar(req.body);
  res.status(201).json(created);
  // Fetch its events right away so the calendar fills in seconds.
  void refreshCalendar(created);
});

calendarsRouter.patch('/:id', (req, res) => {
  const updated = patchCalendar(IdParam.parse(req.params.id), req.body);
  res.json(updated);
  void refreshCalendar(updated);
});

calendarsRouter.delete('/:id', (req, res) => {
  deleteCalendar(IdParam.parse(req.params.id));
  res.json({ ok: true });
});

calendarsRouter.get('/:id', (req, res) => {
  res.json(getCalendar(IdParam.parse(req.params.id)));
});
