import { useQuery } from '@tanstack/react-query';
import { queueLength } from '@/lib/offline-store';

export const QUEUE_LENGTH_KEY = ['offline', 'queue-length'] as const;

/**
 * Liest die Anzahl der wartenden Offline-Mutationen aus IndexedDB.
 * Wird invalidiert nachdem etwas eingefügt oder synchronisiert wurde.
 */
export function useQueueLength() {
  return useQuery({
    queryKey: QUEUE_LENGTH_KEY,
    queryFn: queueLength,
    staleTime: 0,
    refetchInterval: 5000,
  });
}
