import { z } from 'zod';

/**
 * Member colors are token names, not hex — the theme decides how each
 * renders (saturated chip + pastel tint), so they work in every theme.
 */
export const FAMILY_COLORS = [
  'teal',
  'coral',
  'pink',
  'marigold',
  'lavender',
  'green',
  'blue',
  'slate',
] as const;

export const FamilyColorSchema = z.enum(FAMILY_COLORS);
export type FamilyColor = z.infer<typeof FamilyColorSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  color: FamilyColorSchema,
  /** A single emoji, or '' to show the name's initial. */
  avatar: z.string().max(8).default(''),
  isAdmin: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});
export type User = z.infer<typeof UserSchema>;

export const UserCreateSchema = UserSchema.omit({ id: true }).partial({
  avatar: true,
  isAdmin: true,
  sortOrder: true,
});
export type UserCreate = z.infer<typeof UserCreateSchema>;

export const UserPatchSchema = UserSchema.omit({ id: true }).partial().strict();
export type UserPatch = z.infer<typeof UserPatchSchema>;

export const UserListSchema = z.array(UserSchema);
