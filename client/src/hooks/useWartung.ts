import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Auftrag, Wartungsplan, WartungsHistorie } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const WARTUNG_QUERY_KEY = 'wartung';

export interface WartungsplanInput {
  kunde_id?: string | null;
  kunde_name?: string;
  anlage: string;
  standort?: string | null;
  intervall_monate: number;
  erinnerung_tage: number;
  letzte_wartung?: string | null;
  notiz?: string | null;
}

export function useWartungsplaene() {
  return useQuery({
    queryKey: [WARTUNG_QUERY_KEY],
    queryFn: () => apiClient<Wartungsplan[]>('/api/wartung'),
    placeholderData: (prev) => prev,
  });
}

export function useWartungsplan(id: string | null) {
  return useQuery({
    queryKey: [WARTUNG_QUERY_KEY, id],
    queryFn: () => apiClient<Wartungsplan>(`/api/wartung/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useWartungsHistorie(id: string | null) {
  return useQuery({
    queryKey: [WARTUNG_QUERY_KEY, id, 'historie'],
    queryFn: () =>
      apiClient<WartungsHistorie[]>(`/api/wartung/${encodeURIComponent(id!)}/historie`),
    enabled: !!id,
  });
}

export function useCreateWartungsplan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WartungsplanInput) =>
      apiClient<Wartungsplan>('/api/wartung', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [WARTUNG_QUERY_KEY] }),
  });
}

export function useUpdateWartungsplan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: WartungsplanInput }) =>
      apiClient<Wartungsplan>(`/api/wartung/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [WARTUNG_QUERY_KEY] }),
  });
}

export function useDeleteWartungsplan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(`/api/wartung/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [WARTUNG_QUERY_KEY] }),
  });
}

export interface ErledigtInput {
  durchgefuehrt_am: string;
  notiz?: string | null;
  createAuftrag?: boolean;
}

export interface ErledigtResult {
  plan: Wartungsplan;
  historie: WartungsHistorie;
  auftrag?: Auftrag;
}

export function useMarkErledigt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ErledigtInput }) =>
      apiClient<ErledigtResult>(`/api/wartung/${encodeURIComponent(id)}/erledigt`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [WARTUNG_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['auftraege'] });
    },
  });
}
