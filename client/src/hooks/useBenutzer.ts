import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Benutzer } from '@ahv/shared';
import { apiClient } from '@/lib/api';
import { AUTH_STATUS_QUERY_KEY } from './useAuthStatus';

export const BENUTZER_QUERY_KEY = ['benutzer'] as const;

export function useBenutzer() {
  return useQuery({
    queryKey: BENUTZER_QUERY_KEY,
    queryFn: () => apiClient<Benutzer[]>('/api/benutzer'),
  });
}

export function useCreateBenutzer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; pin: string }) =>
      apiClient<Benutzer>('/api/benutzer', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BENUTZER_QUERY_KEY });
      qc.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
    },
  });
}

export function useRenameBenutzer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient<Benutzer>(`/api/benutzer/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: { name },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BENUTZER_QUERY_KEY });
      qc.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
    },
  });
}

export function useDeleteBenutzer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(`/api/benutzer/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BENUTZER_QUERY_KEY });
      qc.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
    },
  });
}

export function useChangeOwnPin() {
  return useMutation({
    mutationFn: ({ id, oldPin, newPin }: { id: string; oldPin: string; newPin: string }) =>
      apiClient<{ ok: true }>(
        `/api/benutzer/${encodeURIComponent(id)}/change-pin`,
        { method: 'POST', body: { oldPin, newPin } },
      ),
  });
}
