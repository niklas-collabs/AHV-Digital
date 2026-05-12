import { CloudOff, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useQueueLength } from '@/hooks/useQueueLength';
import { cn } from '@/lib/utils';

/**
 * Schmaler Banner ganz oben, wenn der Browser offline ist oder noch
 * ungespeicherte Mutationen in der Queue stehen.
 */
export function OfflineIndicator() {
  const online = useOnlineStatus();
  const { data: queueLen } = useQueueLength();
  const pending = queueLen ?? 0;

  if (online && pending === 0) return null;

  return (
    <div
      className={cn(
        'sticky top-0 z-40 flex items-center gap-2 px-3 py-1.5 text-xs font-medium',
        online ? 'bg-amber-500/90 text-amber-50' : 'bg-destructive text-destructive-foreground',
      )}
      role="status"
    >
      {online ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CloudOff className="h-3.5 w-3.5" />
      )}
      <span className="flex-1">
        {online
          ? `Synchronisiere ${pending} ausstehende Änderung${pending === 1 ? '' : 'en'} …`
          : pending > 0
            ? `Offline — ${pending} Änderung${pending === 1 ? '' : 'en'} werden synchronisiert, sobald wieder online`
            : 'Offline — Aktionen werden lokal gespeichert und nach Verbindung synchronisiert'}
      </span>
    </div>
  );
}
