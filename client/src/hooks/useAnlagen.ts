import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnlageQr } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const ANLAGEN_QUERY_KEY = 'anlagen';

export interface AnlageInput {
  kunde_id?: string | null;
  kunde_name?: string;
  anlage: string;
  standort?: string | null;
  wartungsplan_id?: string | null;
}

export function useAnlagen() {
  return useQuery({
    queryKey: [ANLAGEN_QUERY_KEY],
    queryFn: () => apiClient<AnlageQr[]>('/api/anlagen'),
  });
}

export function useAnlage(id: string | null) {
  return useQuery({
    queryKey: [ANLAGEN_QUERY_KEY, id],
    queryFn: () => apiClient<AnlageQr>(`/api/anlagen/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useCreateAnlage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AnlageInput) =>
      apiClient<AnlageQr>('/api/anlagen', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ANLAGEN_QUERY_KEY] }),
  });
}

export function useUpdateAnlage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AnlageInput }) =>
      apiClient<AnlageQr>(`/api/anlagen/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ANLAGEN_QUERY_KEY] }),
  });
}

export function useDeleteAnlage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(`/api/anlagen/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ANLAGEN_QUERY_KEY] }),
  });
}
