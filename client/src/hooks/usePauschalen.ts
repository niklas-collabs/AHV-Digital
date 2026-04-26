import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Pauschale } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const PAUSCHALEN_QUERY_KEY = ['pauschalen'] as const;

export interface PauschaleInput {
  name: string;
  preis_netto: number;
  einheit: string;
  mwst_prozent: number;
  ist_lohnkosten: boolean;
}

export function usePauschalen() {
  return useQuery({
    queryKey: PAUSCHALEN_QUERY_KEY,
    queryFn: () => apiClient<Pauschale[]>('/api/pauschalen'),
  });
}

export function useCreatePauschale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PauschaleInput) =>
      apiClient<Pauschale>('/api/pauschalen', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PAUSCHALEN_QUERY_KEY }),
  });
}

export function useUpdatePauschale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PauschaleInput }) =>
      apiClient<Pauschale>(`/api/pauschalen/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PAUSCHALEN_QUERY_KEY }),
  });
}

export function useDeletePauschale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(`/api/pauschalen/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PAUSCHALEN_QUERY_KEY }),
  });
}
