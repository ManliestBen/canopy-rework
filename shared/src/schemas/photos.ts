import { z } from 'zod';

export const PhotoSchema = z.object({
  id: z.string(),
  /** Full delivery URL, already sized for the panel. */
  url: z.string(),
});
export type Photo = z.infer<typeof PhotoSchema>;

export const PhotosResponseSchema = z.object({
  configured: z.boolean(),
  photos: z.array(PhotoSchema),
  fetchedAt: z.string().nullable(),
  error: z.string().optional(),
});
export type PhotosResponse = z.infer<typeof PhotosResponseSchema>;

export const PhotoFoldersSchema = z.array(z.string());
