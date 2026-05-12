import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { syncQueue } from '@/lib/offline-sync';
import { QUEUE_LENGTH_KEY } from './useQueueLength';

/**
 * Globaler Sync-Trigger: arbeitet die Offline-Mutation-Queue ab
 *  - beim App-Mount (vergangene Sessions könnten Items hinterlassen haben)
 *  - bei jedem online-Event (Verbindung kommt zurück)
 *  - alle 30s als Sicherheitsnetz, falls online-Event übersehen wurde
 */
export function useOfflineSync(): void {
  const qc = useQueryClient();
  const runningRef = useRef(false);

  const triggerSync = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const result = await syncQueue();
      if (result.ok > 0) {
        toast.success(
          `${result.ok} Änderung${result.ok === 1 ? '' : 'en'} synchronisiert`,
        );
      }
      if (result.giveUp > 0) {
        toast.error(
          `${result.giveUp} Änderung${result.giveUp === 1 ? '' : 'en'} konnte${result.giveUp === 1 ? '' : 'n'} nicht synchronisiert werden`,
        );
      }
      if (result.ok > 0 || result.giveUp > 0) {
        qc.invalidateQueries({ queryKey: ['auftraege'] });
        qc.invalidateQueries({ queryKey: QUEUE_LENGTH_KEY });
      }
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    // Beim Mount einmal triggern
    void triggerSync();

    const onlineHandler = () => {
      void triggerSync();
    };
    window.addEventListener('online', onlineHandler);

    // Backup-Intervall: alle 30s prüfen (falls online-Event verpasst)
    const interval = setInterval(() => {
      if (navigator.onLine) void triggerSync();
    }, 30_000);

    return () => {
      window.removeEventListener('online', onlineHandler);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
