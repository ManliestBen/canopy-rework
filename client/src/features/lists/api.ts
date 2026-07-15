import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FrequentItemsSchema,
  MealWeekSchema,
  OkSchema,
  ShoppingListSchema,
  type DateKey,
  type Meal,
  type ShoppingList,
} from '@canopy/shared';
import { z } from 'zod';
import { apiGet, apiSend } from '../../lib/api';

const ListArraySchema = z.array(ShoppingListSchema);

export function useLists() {
  return useQuery({
    queryKey: ['lists'],
    queryFn: () => apiGet(ListArraySchema, '/api/lists'),
    refetchInterval: 30_000, // lists change from phones; keep the panel fresh
  });
}

export function useFrequentItems(listId: string | null) {
  return useQuery({
    queryKey: ['frequent', listId],
    queryFn: () => apiGet(FrequentItemsSchema, `/api/lists/${listId}/frequent`),
    enabled: listId !== null,
  });
}

export function useListMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['lists'] });
    void qc.invalidateQueries({ queryKey: ['frequent'] });
  };
  const createList = useMutation({
    mutationFn: (input: { title: string; emoji?: string }) =>
      apiSend(ShoppingListSchema, 'POST', '/api/lists', input),
    onSettled: invalidate,
  });
  const patchList = useMutation({
    mutationFn: ({ id, ...input }: { id: string; title?: string; emoji?: string }) =>
      apiSend(ShoppingListSchema, 'PATCH', `/api/lists/${id}`, input),
    onSettled: invalidate,
  });
  const removeList = useMutation({
    mutationFn: (id: string) => apiSend(OkSchema, 'DELETE', `/api/lists/${id}`),
    onSettled: invalidate,
  });
  const addItems = useMutation({
    mutationFn: ({ listId, items }: { listId: string; items: string[] }) =>
      apiSend(
        z.object({ ok: z.literal(true), added: z.number() }),
        'POST',
        `/api/lists/${listId}/items`,
        { items },
      ),
    onSettled: invalidate,
  });
  const toggleItem = useMutation({
    mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) =>
      apiSend(OkSchema, 'PATCH', `/api/lists/items/${itemId}`, { done }),
    // Optimistic check-off.
    onMutate: async ({ itemId, done }) => {
      await qc.cancelQueries({ queryKey: ['lists'] });
      const previous = qc.getQueryData<ShoppingList[]>(['lists']);
      if (previous) {
        qc.setQueryData(
          ['lists'],
          previous.map((l) => ({
            ...l,
            items: l.items.map((i) => (i.id === itemId ? { ...i, done } : i)),
          })),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(['lists'], ctx.previous);
    },
    onSettled: invalidate,
  });
  const assignItem = useMutation({
    mutationFn: ({ itemId, assigneeId }: { itemId: string; assigneeId: string | null }) =>
      apiSend(OkSchema, 'PATCH', `/api/lists/items/${itemId}`, { assigneeId }),
    onSettled: invalidate,
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => apiSend(OkSchema, 'DELETE', `/api/lists/items/${itemId}`),
    onSettled: invalidate,
  });
  const clearCompleted = useMutation({
    mutationFn: (listId: string) =>
      apiSend(
        z.object({ ok: z.literal(true), cleared: z.number() }),
        'POST',
        `/api/lists/${listId}/clear-completed`,
      ),
    onSettled: invalidate,
  });
  return {
    createList,
    patchList,
    removeList,
    addItems,
    toggleItem,
    assignItem,
    removeItem,
    clearCompleted,
  };
}

// ---- Meals -------------------------------------------------------------

export function useMealsWeek(weekAnchor: DateKey) {
  return useQuery({
    queryKey: ['meals', weekAnchor],
    queryFn: () => apiGet(MealWeekSchema, `/api/meals?week=${weekAnchor}`),
  });
}

export function useSetMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meal: Meal) => apiSend(OkSchema, 'PUT', '/api/meals', meal),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['meals'] }),
  });
}
