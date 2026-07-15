import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OkSchema,
  UserListSchema,
  UserSchema,
  type User,
  type UserCreate,
  type UserPatch,
} from '@canopy/shared';
import { apiGet, apiSend } from './api';

export const usersQuery = {
  queryKey: ['users'] as const,
  queryFn: () => apiGet(UserListSchema, '/api/users'),
};

export function useUsers(): User[] {
  const { data } = useQuery(usersQuery);
  return data ?? [];
}

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: usersQuery.queryKey });

  const create = useMutation({
    mutationFn: (input: UserCreate) => apiSend(UserSchema, 'POST', '/api/users', input),
    onSettled: invalidate,
  });
  const patch = useMutation({
    mutationFn: ({ id, ...input }: UserPatch & { id: string }) =>
      apiSend(UserSchema, 'PATCH', `/api/users/${id}`, input),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiSend(OkSchema, 'DELETE', `/api/users/${id}`),
    onSettled: invalidate,
  });
  return { create, patch, remove };
}
