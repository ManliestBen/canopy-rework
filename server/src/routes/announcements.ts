import { Router } from 'express';
import { z } from 'zod';
import { AnnouncementCreateSchema } from '@canopy/shared';
import { wrap } from '../lib/asyncRoute.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
} from '../services/announcements.js';
import { digestRecipients } from '../services/digest.js';
import { gmailConfigured, sendEmail } from '../services/gmail.js';
import { getSettings } from '../services/settings.js';
import { logger } from '../logger.js';

export const announcementsRouter = Router();
export const emailRouter = Router();

announcementsRouter.get('/', (_req, res) => {
  res.json(listAnnouncements());
});

announcementsRouter.post(
  '/',
  wrap(async (req, res) => {
    const input = AnnouncementCreateSchema.parse(req.body);
    const created = createAnnouncement(input);
    res.status(201).json(created);

    // Optional email fan-out; failures never block the sticky note.
    if (input.alsoEmail && gmailConfigured()) {
      const to = digestRecipients();
      if (to.length > 0) {
        try {
          await sendEmail(
            to,
            `Canopy note: ${created.text.slice(0, 60)}`,
            `${created.emoji} ${created.text}\n\n— posted on the ${getSettings().familyName} panel`,
          );
        } catch (err) {
          logger.warn({ err }, 'announcement email failed');
        }
      }
    }
  }),
);

announcementsRouter.delete('/:id', (req, res) => {
  deleteAnnouncement(z.string().uuid().parse(req.params.id));
  res.json({ ok: true });
});

// ---- Email utility -----------------------------------------------------

emailRouter.get('/status', (_req, res) => {
  res.json({ configured: gmailConfigured(), recipients: digestRecipients() });
});

const TestSchema = z.object({ to: z.string().email() });

emailRouter.post(
  '/test',
  wrap(async (req, res) => {
    const { to } = TestSchema.parse(req.body);
    await sendEmail(
      [to],
      'Canopy test email 🌳',
      'If you can read this, Canopy can send email. All set!',
    );
    res.json({ ok: true });
  }),
);
