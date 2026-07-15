import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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

// Tight, dedicated limiter: this sends from the family's real Gmail identity,
// so cap it hard regardless of the looser global write limit.
const emailTestLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many test emails. Try again later.', code: 'rate_limited' },
});

// Sends only to the already-configured digest recipients — never an arbitrary
// address supplied in the request (which would be an authenticated send-to-
// anyone trigger on a reputation-bearing sender).
emailRouter.post(
  '/test',
  emailTestLimiter,
  wrap(async (_req, res) => {
    const recipients = digestRecipients();
    if (recipients.length === 0) {
      res.status(400).json({ error: 'Add a digest recipient first', code: 'no_recipient' });
      return;
    }
    await sendEmail(
      recipients,
      'Canopy test email 🌳',
      'If you can read this, Canopy can send email. All set!',
    );
    res.json({ ok: true });
  }),
);
