import { z } from 'zod';
import { DATE_KEY_REGEX } from '../dates';

export const ListItemSchema = z.object({
  id: z.string().uuid(),
  listId: z.string().uuid(),
  text: z.string().trim().min(1).max(200),
  assigneeId: z.string().uuid().nullable().default(null),
  done: z.boolean().default(false),
});
export type ListItem = z.infer<typeof ListItemSchema>;

export const ShoppingListSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(60),
  emoji: z.string().max(8).default(''),
  items: z.array(ListItemSchema).default([]),
});
export type ShoppingList = z.infer<typeof ShoppingListSchema>;

export const ListCreateSchema = ShoppingListSchema.omit({ id: true, items: true }).partial({
  emoji: true,
});
export const ListPatchSchema = ListCreateSchema.partial().strict();

/** Bulk add (single quick-add and meal-ingredient push share this). */
export const ItemsAddSchema = z.object({
  items: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
});

export const ItemPatchSchema = z
  .object({
    text: z.string().trim().min(1).max(200),
    assigneeId: z.string().uuid().nullable(),
    done: z.boolean(),
  })
  .partial()
  .strict();

export const FrequentItemsSchema = z.array(z.string());

// ---- Meals -------------------------------------------------------------

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
export const MealSlotSchema = z.enum(MEAL_SLOTS);
export type MealSlot = z.infer<typeof MealSlotSchema>;

export const MealSchema = z.object({
  dateKey: z.string().regex(DATE_KEY_REGEX),
  slot: MealSlotSchema,
  name: z.string().trim().max(120),
  notes: z.string().trim().max(500).default(''),
});
export type Meal = z.infer<typeof MealSchema>;

export const MealWeekSchema = z.array(MealSchema);
