import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Auftrag, AuftragStatus, Teilleistung } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const AUFTRAEGE_QUERY_KEY = 'auftraege';

export interface AuftraegeFilter {
  status?: AuftragStatus;
  kunde_id?: string;
  query?: string;
}

export interface AuftragInput {
  typ: 'arbeitszettel' | 'angebot' | 'lieferschein';
  titel: string;
  datum: string;
  beschreibung: string;
  notiz_intern: string;
  kunde_id: string | null;
  objekt_adresse?: string | null;
  mitarbeiter: Auftrag['mitarbeiter'];
  materialien: Auftrag['materialien'];
  fotos: string[];
  signature_data_url?: string | null;
  checkliste?: Auftrag['checkliste'];
  teilleistungen: Teilleistung[];
}

function buildQuery(filter: AuftraegeFilter): string {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.kunde_id) params.set('kunde_id', filter.kunde_id);
  if (filter.query?.trim()) params.set('q', filter.query.trim());
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function useAuftraege(filter: AuftraegeFilter = {}) {
  return useQuery({
    queryKey: [AUFTRAEGE_QUERY_KEY, filter],
    queryFn: () => apiClient<Auftrag[]>(`/api/auftraege${buildQuery(filter)}`),
    placeholderData: (prev) => prev,
  });
}

export function useAuftrag(id: string | null) {
  return useQuery({
    queryKey: [AUFTRAEGE_QUERY_KEY, id],
    queryFn: () => apiClient<Auftrag>(`/api/auftraege/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useCreateAuftrag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AuftragInput) =>
      apiClient<Auftrag>('/api/auftraege', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] }),
  });
}

export function useUpdateAuftrag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AuftragInput }) =>
      apiClient<Auftrag>(`/api/auftraege/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY, id] });
    },
  });
}

export function useDeleteAuftrag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(`/api/auftraege/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] }),
  });
}

export function useDuplicateAuftrag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, typ }: { id: string; typ?: 'arbeitszettel' | 'angebot' | 'lieferschein' }) =>
      apiClient<Auftrag>(`/api/auftraege/${encodeURIComponent(id)}/duplicate`, {
        method: 'POST',
        body: typ ? { typ } : {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] }),
  });
}

export interface AbschickenOptions {
  sendKunde?: boolean;
  sendFotos?: boolean;
}

export function useAbschickenAuftrag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, options }: { id: string; options?: AbschickenOptions }) =>
      apiClient<Auftrag & { _mailResult?: { recipients: string[]; fotosAttached: number } }>(
        `/api/auftraege/${encodeURIComponent(id)}/abschicken`,
        {
          method: 'POST',
          body: options ?? {},
        },
      ),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY, id] });
    },
  });
}
