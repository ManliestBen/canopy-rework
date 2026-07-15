import { z } from 'zod';

export const AnnouncementSchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(1).max(300),
  authorId: z.string().uuid().nullable().default(null),
  emoji: z.string().max(8).default('📌'),
  createdAt: z.string(),
  /** null = stays until someone takes it down. */
  expiresAt: z.string().nullable().default(null),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

export const AnnouncementCreateSchema = z.object({
  text: z.string().trim().min(1).max(300),
  authorId: z.string().uuid().nullable().optional(),
  emoji: z.string().max(8).optional(),
  /** Hours until it disappears; omit for sticky-until-removed. */
  expiresInHours: z.number().min(0.25).max(168).optional(),
  /** Also email it to the family digest recipients. */
  alsoEmail: z.boolean().optional(),
});
export type AnnouncementCreate = z.infer<typeof AnnouncementCreateSchema>;

export const AnnouncementListSchema = z.array(AnnouncementSchema);
