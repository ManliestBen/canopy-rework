import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarSourceSchema,
  EventsResponseSchema,
  GoogleStatusSchema,
  OkSchema,
  type CalendarCreate,
  type CalendarPatch,
  type DateKey,
  type EventInput,
} from '@canopy/shared';
import { z } from 'zod';
import { apiGet, apiSend } from '../../lib/api';

const CalendarListSchema = z.array(CalendarSourceSchema);
const VerifyResultSchema = z.object({
  ok: z.boolean(),
  summary: z.string().optional(),
  error: z.string().optional(),
});

export function useEventsRange(from: DateKey, to: DateKey) {
  return useQuery({
    queryKey: ['events', from, to],
    queryFn: () => apiGet(EventsResponseSchema, `/api/events?from=${from}&to=${to}`),
    // The server serves from cache instantly; poll to pick up
    // background refreshes. Query keeps last-good data on failures.
    refetchInterval: 60_000,
  });
}

export function useCalendarSources() {
  return useQuery({
    queryKey: ['calendars'],
    queryFn: () => apiGet(CalendarListSchema, '/api/calendars'),
  });
}

export function useGoogleStatus() {
  return useQuery({
    queryKey: ['google-status'],
    queryFn: () => apiGet(GoogleStatusSchema, '/api/calendars/google-status'),
    staleTime: 60_000,
  });
}

export function useVerifySource() {
  return useMutation({
    mutationFn: (input: { sourceType: 'google' | 'ics'; sourceRef: string }) =>
      apiSend(VerifyResultSchema, 'POST', '/api/calendars/verify', input),
  });
}

export function useCalendarMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['calendars'] });
    void qc.invalidateQueries({ queryKey: ['events'] });
  };
  const create = useMutation({
    mutationFn: (input: CalendarCreate) =>
      apiSend(CalendarSourceSchema, 'POST', '/api/calendars', input),
    onSettled: invalidate,
  });
  const patch = useMutation({
    mutationFn: ({ id, ...input }: CalendarPatch & { id: string }) =>
      apiSend(CalendarSourceSchema, 'PATCH', `/api/calendars/${id}`, input),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiSend(OkSchema, 'DELETE', `/api/calendars/${id}`),
    onSettled: invalidate,
  });
  return { create, patch, remove };
}

const CreatedSchema = z.object({ ok: z.literal(true), id: z.string().optional() });

export function useEventMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['events'] });
  const create = useMutation({
    mutationFn: ({ calendarId, input }: { calendarId: string; input: EventInput }) =>
      apiSend(CreatedSchema, 'POST', `/api/events/${calendarId}`, input),
    onSettled: invalidate,
  });
  const update = useMutation({
    mutationFn: ({
      calendarId,
      eventId,
      input,
    }: {
      calendarId: string;
      eventId: string;
      input: EventInput;
    }) =>
      apiSend(OkSchema, 'PATCH', `/api/events/${calendarId}/${encodeURIComponent(eventId)}`, input),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ calendarId, eventId }: { calendarId: string; eventId: string }) =>
      apiSend(OkSchema, 'DELETE', `/api/events/${calendarId}/${encodeURIComponent(eventId)}`),
    onSettled: invalidate,
  });
  return { create, update, remove };
}
