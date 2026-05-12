import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChecklistenVorlage, ChecklistenVorlageTyp } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const CHECKLISTEN_QUERY_KEY = 'checklisten';

export interface ChecklisteInput {
  name: string;
  typ: ChecklistenVorlageTyp;
  items: { text: string }[];
}

export function useChecklisten(typ?: ChecklistenVorlageTyp) {
  return useQuery({
    queryKey: [CHECKLISTEN_QUERY_KEY, typ ?? null],
    queryFn: () => {
      const qs = typ ? `?typ=${encodeURIComponent(typ)}` : '';
      return apiClient<ChecklistenVorlage[]>(`/api/checklisten${qs}`);
    },
  });
}

export function useCreateCheckliste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChecklisteInput) =>
      apiClient<ChecklistenVorlage>('/api/checklisten', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHECKLISTEN_QUERY_KEY] }),
  });
}

export function useUpdateCheckliste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChecklisteInput }) =>
      apiClient<ChecklistenVorlage>(`/api/checklisten/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHECKLISTEN_QUERY_KEY] }),
  });
}

export function useDeleteCheckliste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(`/api/checklisten/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHECKLISTEN_QUERY_KEY] }),
  });
}
