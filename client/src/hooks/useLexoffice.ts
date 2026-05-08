import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LexofficeStatusResponse,
  LexofficeSyncResult,
  LexofficeTestResponse,
} from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const LEXOFFICE_STATUS_KEY = ['lexoffice', 'status'] as const;

export function useLexofficeStatus() {
  return useQuery({
    queryKey: LEXOFFICE_STATUS_KEY,
    queryFn: () => apiClient<LexofficeStatusResponse>('/api/lexoffice/status'),
  });
}

export function useSetLexofficeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) =>
      apiClient<{ ok: true }>('/api/lexoffice/api-key', {
        method: 'POST',
        body: { apiKey },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEXOFFICE_STATUS_KEY }),
  });
}

export function useDeleteLexofficeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ ok: true }>('/api/lexoffice/api-key', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEXOFFICE_STATUS_KEY }),
  });
}

export function useTestLexofficeConnection() {
  return useMutation({
    mutationFn: () =>
      apiClient<LexofficeTestResponse>('/api/lexoffice/test', {
        method: 'POST',
        body: {},
      }),
  });
}

export function useSyncLexoffice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<LexofficeSyncResult>('/api/lexoffice/sync', {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEXOFFICE_STATUS_KEY });
      qc.invalidateQueries({ queryKey: ['kunden'] });
    },
  });
}
