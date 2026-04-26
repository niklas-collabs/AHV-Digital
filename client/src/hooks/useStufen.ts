import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Stufe } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const STUFEN_QUERY_KEY = ['stufen'] as const;

export interface StufeInput {
  bezeichnung: string;
  stundenpreis: number;
  reihenfolge?: number;
}

export function useStufen() {
  return useQuery({
    queryKey: STUFEN_QUERY_KEY,
    queryFn: () => apiClient<Stufe[]>('/api/stufen'),
  });
}

export function useCreateStufe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StufeInput) =>
      apiClient<Stufe>('/api/stufen', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: STUFEN_QUERY_KEY }),
  });
}

export function useUpdateStufe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: StufeInput }) =>
      apiClient<Stufe>(`/api/stufen/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: STUFEN_QUERY_KEY }),
  });
}

export function useDeleteStufe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(`/api/stufen/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: STUFEN_QUERY_KEY }),
  });
}

export function useMoveStufe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) =>
      apiClient<Stufe[]>(`/api/stufen/${encodeURIComponent(id)}/move`, {
        method: 'POST',
        body: { direction },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: STUFEN_QUERY_KEY }),
  });
}
