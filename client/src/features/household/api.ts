import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChoreDaySchema,
  ChoreSchema,
  OkSchema,
  RewardsSummarySchema,
  TaskListSchema,
  TaskSchema,
  type ChoreCreate,
  type ChoreDay,
  type ChorePatch,
  type DateKey,
  type TaskCreate,
  type TaskPatch,
} from '@canopy/shared';
import { z } from 'zod';
import { apiGet, apiSend } from '../../lib/api';

// ---- Tasks ------------------------------------------------------------

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiGet(TaskListSchema, '/api/tasks'),
    refetchInterval: 60_000,
  });
}

export function useTaskMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['tasks'] });
  const create = useMutation({
    mutationFn: (input: TaskCreate) => apiSend(TaskSchema, 'POST', '/api/tasks', input),
    onSettled: invalidate,
  });
  const patch = useMutation({
    mutationFn: ({ id, ...input }: TaskPatch & { id: string }) =>
      apiSend(TaskSchema, 'PATCH', `/api/tasks/${id}`, input),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiSend(OkSchema, 'DELETE', `/api/tasks/${id}`),
    onSettled: invalidate,
  });
  const toggle = useMutation({
    mutationFn: ({ id, dateKey }: { id: string; dateKey: string | null }) =>
      apiSend(TaskSchema, 'POST', `/api/tasks/${id}/toggle`, { dateKey }),
    onSettled: invalidate,
  });
  return { create, patch, remove, toggle };
}

// ---- Chores -----------------------------------------------------------

const ChoreListSchema = z.array(ChoreSchema);

export function useChoreDay(dateKey: DateKey) {
  return useQuery({
    queryKey: ['chore-day', dateKey],
    queryFn: () => apiGet(ChoreDaySchema, `/api/chores/day?date=${dateKey}`),
    refetchInterval: 60_000,
  });
}

export function useChores() {
  return useQuery({
    queryKey: ['chores'],
    queryFn: () => apiGet(ChoreListSchema, '/api/chores'),
  });
}

export function useChoreMutations(dateKey: DateKey) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['chore-day'] });
    void qc.invalidateQueries({ queryKey: ['chores'] });
    void qc.invalidateQueries({ queryKey: ['rewards'] });
  };
  const create = useMutation({
    mutationFn: (input: ChoreCreate) => apiSend(ChoreSchema, 'POST', '/api/chores', input),
    onSettled: invalidate,
  });
  const patch = useMutation({
    mutationFn: ({ id, ...input }: ChorePatch & { id: string }) =>
      apiSend(ChoreSchema, 'PATCH', `/api/chores/${id}`, input),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiSend(OkSchema, 'DELETE', `/api/chores/${id}`),
    onSettled: invalidate,
  });
  const toggle = useMutation({
    mutationFn: (id: string) =>
      apiSend(ChoreDaySchema, 'POST', `/api/chores/${id}/toggle`, { date: dateKey }),
    // Optimistic: the check appears the instant a kid taps it.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['chore-day', dateKey] });
      const previous = qc.getQueryData<ChoreDay>(['chore-day', dateKey]);
      if (previous) {
        qc.setQueryData<ChoreDay>(['chore-day', dateKey], {
          ...previous,
          chores: previous.chores.map((c) =>
            c.id === id ? { ...c, done: !c.done } : c,
          ),
        });
      }
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(['chore-day', dateKey], ctx.previous);
    },
    onSettled: invalidate,
  });
  return { create, patch, remove, toggle };
}

// ---- Rewards ----------------------------------------------------------

export function useRewards() {
  return useQuery({
    queryKey: ['rewards'],
    queryFn: () => apiGet(RewardsSummarySchema, '/api/rewards'),
    refetchInterval: 60_000,
  });
}

export function useRedeem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; points: number; note: string }) =>
      apiSend(OkSchema, 'POST', '/api/rewards/redeem', input),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['rewards'] }),
  });
}
