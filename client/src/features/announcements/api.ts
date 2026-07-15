import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AnnouncementListSchema,
  AnnouncementSchema,
  OkSchema,
  type AnnouncementCreate,
} from '@canopy/shared';
import { z } from 'zod';
import { apiGet, apiSend } from '../../lib/api';

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: () => apiGet(AnnouncementListSchema, '/api/announcements'),
    refetchInterval: 30_000,
  });
}

export function useAnnouncementMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['announcements'] });
  const create = useMutation({
    mutationFn: (input: AnnouncementCreate) =>
      apiSend(AnnouncementSchema, 'POST', '/api/announcements', input),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiSend(OkSchema, 'DELETE', `/api/announcements/${id}`),
    onSettled: invalidate,
  });
  return { create, remove };
}

export function useEmailStatus() {
  return useQuery({
    queryKey: ['email-status'],
    queryFn: () =>
      apiGet(
        z.object({ configured: z.boolean(), recipients: z.array(z.string()) }),
        '/api/email/status',
      ),
    staleTime: 60_000,
  });
}
