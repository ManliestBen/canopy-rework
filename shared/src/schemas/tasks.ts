import { z } from 'zod';
import { DATE_KEY_REGEX } from '../dates';
import { SCHEDULES } from '../schedule';

const DateKeyField = z.string().regex(DATE_KEY_REGEX);

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(1000).default(''),
  userId: z.string().uuid().nullable().default(null),
  category: z.string().trim().max(40).default(''),
  dueKey: DateKeyField.nullable().default(null),
  schedule: z.enum(SCHEDULES).default('none'),
  /** Set for completed one-time tasks. Recurring completion is per-day. */
  completedAt: z.string().nullable().default(null),
  /** Days this recurring task was completed (within the queried range). */
  completedKeys: z.array(DateKeyField).default([]),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskCreateSchema = TaskSchema.omit({
  id: true,
  completedAt: true,
  completedKeys: true,
}).partial({ notes: true, userId: true, category: true, dueKey: true, schedule: true });
export type TaskCreate = z.infer<typeof TaskCreateSchema>;

export const TaskPatchSchema = TaskCreateSchema.partial().strict();
export type TaskPatch = z.infer<typeof TaskPatchSchema>;

export const TaskListSchema = z.array(TaskSchema);

export const ChoreSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  icon: z.string().max(8).default(''),
  userId: z.string().uuid(),
  points: z.number().int().min(1).max(100).default(1),
  schedule: z.enum(['daily', 'weekdays', 'weekly']).default('daily'),
  anchorKey: z.string().regex(DATE_KEY_REGEX),
});
export type Chore = z.infer<typeof ChoreSchema>;

export const ChoreCreateSchema = ChoreSchema.omit({ id: true }).partial({
  icon: true,
  points: true,
  schedule: true,
});
export type ChoreCreate = z.infer<typeof ChoreCreateSchema>;

export const ChorePatchSchema = ChoreSchema.omit({ id: true }).partial().strict();
export type ChorePatch = z.infer<typeof ChorePatchSchema>;

/** Chore chart for one day: chores due + completion state. */
export const ChoreDaySchema = z.object({
  dateKey: DateKeyField,
  chores: z.array(
    ChoreSchema.extend({
      done: z.boolean(),
    }),
  ),
});
export type ChoreDay = z.infer<typeof ChoreDaySchema>;

export const RewardsSummarySchema = z.object({
  users: z.array(
    z.object({
      userId: z.string().uuid(),
      earnedTotal: z.number().int(),
      earnedThisWeek: z.number().int(),
      redeemedTotal: z.number().int(),
      balance: z.number().int(),
    }),
  ),
  recentRedemptions: z.array(
    z.object({
      id: z.string().uuid(),
      userId: z.string().uuid(),
      points: z.number().int(),
      note: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type RewardsSummary = z.infer<typeof RewardsSummarySchema>;

export const RedeemSchema = z.object({
  userId: z.string().uuid(),
  points: z.number().int().min(1).max(10000),
  note: z.string().trim().max(200).default(''),
});
