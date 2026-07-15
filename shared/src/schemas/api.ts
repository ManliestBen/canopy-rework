import { z } from 'zod';

/** Uniform error envelope returned by every API route. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  /** Machine-readable code for the client to branch on. */
  code: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  uptimeSeconds: z.number(),
  integrations: z.record(
    z.object({
      configured: z.boolean(),
      ok: z.boolean().nullable(),
      detail: z.string().optional(),
    }),
  ),
});
export type Health = z.infer<typeof HealthSchema>;
