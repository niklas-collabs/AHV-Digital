import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuftragTyp, Vorlage } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const VORLAGEN_QUERY_KEY = 'vorlagen';

export interface VorlageInput {
  name: string;
  typ: AuftragTyp;
  data: Record<string, unknown>;
}

export function useVorlagen(typ?: AuftragTyp) {
  return useQuery({
    queryKey: [VORLAGEN_QUERY_KEY, typ ?? null],
    queryFn: () => {
      const qs = typ ? `?typ=${encodeURIComponent(typ)}` : '';
      return apiClient<Vorlage[]>(`/api/vorlagen${qs}`);
    },
  });
}

export function useCreateVorlage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VorlageInput) =>
      apiClient<Vorlage>('/api/vorlagen', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [VORLAGEN_QUERY_KEY] }),
  });
}

export function useUpdateVorlage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VorlageInput }) =>
      apiClient<Vorlage>(`/api/vorlagen/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [VORLAGEN_QUERY_KEY] }),
  });
}

export function useDeleteVorlage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(`/api/vorlagen/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [VORLAGEN_QUERY_KEY] }),
  });
}
