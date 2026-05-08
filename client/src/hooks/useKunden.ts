import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Kunde, KundeTyp } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const KUNDEN_QUERY_KEY = 'kunden';

export interface KundeInput {
  typ: KundeTyp;
  firmenname?: string;
  vorname?: string;
  nachname?: string;
  email?: string;
  telefon?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  notiz?: string;
}

export function useKunden(query?: string) {
  return useQuery({
    queryKey: [KUNDEN_QUERY_KEY, query ?? ''],
    queryFn: () => {
      const url = query ? `/api/kunden?q=${encodeURIComponent(query)}` : '/api/kunden';
      return apiClient<Kunde[]>(url);
    },
    placeholderData: (prev) => prev,
  });
}

export function useCreateKunde() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      syncToLexoffice,
    }: {
      input: KundeInput;
      syncToLexoffice?: boolean;
    }) => {
      const url = syncToLexoffice
        ? '/api/kunden?syncToLexoffice=true'
        : '/api/kunden';
      return apiClient<Kunde & { _lexofficeWarning?: string }>(url, {
        method: 'POST',
        body: input,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KUNDEN_QUERY_KEY] }),
  });
}

export function useUpdateKunde() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: KundeInput }) =>
      apiClient<Kunde>(`/api/kunden/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KUNDEN_QUERY_KEY] }),
  });
}

export function useDeleteKunde() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(`/api/kunden/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KUNDEN_QUERY_KEY] }),
  });
}
