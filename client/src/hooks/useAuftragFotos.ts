import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Auftrag } from '@ahv/shared';
import { ApiError, apiClient } from '@/lib/api';
import { AUFTRAEGE_QUERY_KEY } from './useAuftraege';

/**
 * Lädt eine Foto-Datei zu einem Auftrag hoch (multipart/form-data).
 * Server komprimiert sharp-seitig auf max. 1600 px Kante / JPEG 80%.
 */
export function useUploadFoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ auftragId, file }: { auftragId: string; file: File }) => {
      const fd = new FormData();
      fd.append('foto', file);
      const res = await fetch(`/api/auftraege/${encodeURIComponent(auftragId)}/fotos`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new ApiError(
          res.status,
          (data.code as string) ?? 'UNKNOWN',
          (data.error as string) ?? 'Foto-Upload fehlgeschlagen',
          data,
        );
      }
      return data as Auftrag;
    },
    onSuccess: (_data, { auftragId }) => {
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY, auftragId] });
    },
  });
}

export function useDeleteFoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ auftragId, filename }: { auftragId: string; filename: string }) =>
      apiClient<Auftrag>(
        `/api/auftraege/${encodeURIComponent(auftragId)}/fotos/${encodeURIComponent(filename)}`,
        { method: 'DELETE' },
      ),
    onSuccess: (_data, { auftragId }) => {
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [AUFTRAEGE_QUERY_KEY, auftragId] });
    },
  });
}
