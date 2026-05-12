import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Auftrag, AuftragStatus, Teilleistung } from '@ahv/shared';
import { apiClient } from '@/lib/api';
import {
  createAuftragOnlineOrQueue,
  deleteAuftragOnlineOrQueue,
  updateAuftragOnlineOrQueue,
} from '@/lib/offline-mutation';
import { getPendingEntities } from '@/lib/offline-store';
import { QUEUE_LENGTH_KEY } from './useQueueLength';

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
    queryFn: async () => {
      // 1. Server-Liste — kann offline aus dem SW-Cache kommen
      let serverList: Auftrag[] = [];
      try {
        serverList = await apiClient<Auftrag[]>(`/api/auftraege${buildQuery(filter)}`);
      } catch {
        // offline: leeres Server-Array, dann zeigen wir wenigstens
        // die pending-Aufträge unten
      }

      // 2. Pending (offline-erzeugte) Aufträge dazu mergen, wenn sie zum
      //    Filter passen. Pending-Aufträge sind immer entwurf.
      if (!filter.status || filter.status === 'entwurf') {
        const pending = await getPendingEntities('auftrag');
        const pendingAuftraege = pending
          .map((p) => p.data as Auftrag)
          .filter((a) => {
            if (filter.kunde_id && a.kunde_id !== filter.kunde_id) return false;
            if (filter.query) {
              const q = filter.query.toLowerCase();
              return (
                a.titel.toLowerCase().includes(q) ||
                a.beschreibung.toLowerCase().includes(q)
              );
            }
            return true;
          });
        // Pending zuerst (frisch erstellt)
        return [...pendingAuftraege, ...serverList];
      }
      return serverList;
    },
    placeholderData: (prev) => prev,
  });
}

export function useAuftrag(id: string | null) {
  return useQuery({
    queryKey: [AUFTRAEGE_QUERY_KEY, id],
    queryFn: async () => {
      if (id && id.startsWith('tmp:')) {
        const pending = await getPendingEntities('auftrag');
        const match = pending.find((p) => p.id === id);
        if (match) return match.data as Auftrag;
        throw new Error('Pending-Auftrag nicht mehr in der Queue');
      }
      return apiClient<Auftrag>(`/api/auftraege/${encodeURIComponent(id!)}`);
    },
    enabled: !!id,
  });
}

export function useCreateAuftrag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AuftragInput) =>
      createAuftragOnlineOrQueue(input as unknown as Record<string, unknown>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: QUEUE_LENGTH_KEY });
    },
  });
}

export function useUpdateAuftrag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AuftragInput }) =>
      updateAuftragOnlineOrQueue(id, input as unknown as Record<string, unknown>),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY, id] });
      qc.invalidateQueries({ queryKey: QUEUE_LENGTH_KEY });
    },
  });
}

export function useDeleteAuftrag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAuftragOnlineOrQueue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: QUEUE_LENGTH_KEY });
    },
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
  pushToLexoffice?: boolean;
}

export interface AbschickenResult extends Auftrag {
  _mailResult?: { recipients: string[]; fotosAttached: number };
  _lexofficeResult?: { invoiceId: string };
  _lexofficeWarning?: string;
}

export function useAbschickenAuftrag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, options }: { id: string; options?: AbschickenOptions }) =>
      apiClient<AbschickenResult>(
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

export function usePushAuftragToLexoffice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ invoiceId: string; created: boolean }>(
        `/api/auftraege/${encodeURIComponent(id)}/lexoffice-push`,
        { method: 'POST', body: {} },
      ),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY, id] });
    },
  });
}

export function useResyncLexofficeFooter() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(
        `/api/auftraege/${encodeURIComponent(id)}/lexoffice-resync`,
        { method: 'POST', body: {} },
      ),
  });
}
