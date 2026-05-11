import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export interface MaterialNameSuggestion {
  name: string;
  count: number;
  letzterPreis: number | null;
  letzteEinheit: string | null;
}

/**
 * Vorschlagsliste mit Material-Bezeichnungen aus früheren Aufträgen.
 * Wird in der Datalist von MaterialRows angezeigt — der Nutzer sieht
 * beim Tippen Vorschläge, kann aber jeden freien Text eingeben.
 *
 * staleTime hoch (5 Min): die Liste ändert sich nicht so schnell.
 */
export function useMaterialNamen() {
  return useQuery({
    queryKey: ['material-namen'],
    queryFn: () => apiClient<MaterialNameSuggestion[]>('/api/auftraege/material-namen'),
    staleTime: 5 * 60 * 1000,
  });
}
