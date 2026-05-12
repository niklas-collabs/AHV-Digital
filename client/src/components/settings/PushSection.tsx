import { Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  usePushState,
  useSubscribePush,
  useUnsubscribePush,
} from '@/hooks/usePush';

export function PushSection() {
  const { state, refresh } = usePushState();
  const subscribe = useSubscribePush();
  const unsubscribe = useUnsubscribePush();

  if (!state.supported) {
    return (
      <p className="text-sm text-muted-foreground">
        Dieser Browser unterstützt keine Push-Notifications. Auf iOS muss
        die App vorher zum Home-Bildschirm hinzugefügt werden.
      </p>
    );
  }

  if (state.permission === 'denied') {
    return (
      <p className="text-sm text-muted-foreground">
        Benachrichtigungen sind in den Browser-Einstellungen blockiert.
        Aktiviere sie dort manuell, um Erinnerungen zu erhalten.
      </p>
    );
  }

  const handleSubscribe = () => {
    subscribe.mutate(undefined, {
      onSuccess: async () => {
        toast.success('Push aktiviert — du bekommst Wartungs-Erinnerungen');
        await refresh();
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : err.message),
    });
  };

  const handleUnsubscribe = () => {
    unsubscribe.mutate(undefined, {
      onSuccess: async () => {
        toast.success('Push deaktiviert');
        await refresh();
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : err.message),
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Täglich um 07:00 Uhr prüft der Server fällige Wartungen und schickt
        eine Erinnerung auf alle aktivierten Geräte.
      </p>

      {state.subscribed ? (
        <>
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            <Bell className="h-4 w-4" />
            Push ist auf diesem Gerät aktiv.
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleUnsubscribe}
            disabled={unsubscribe.isPending}
          >
            <BellOff className="h-4 w-4" />
            {unsubscribe.isPending ? 'Deaktiviere …' : 'Push deaktivieren'}
          </Button>
        </>
      ) : (
        <Button type="button" onClick={handleSubscribe} disabled={subscribe.isPending}>
          <Bell className="h-4 w-4" />
          {subscribe.isPending ? 'Aktiviere …' : 'Push aktivieren'}
        </Button>
      )}

      {state.serverCount !== null && state.serverCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {state.serverCount} Gerät{state.serverCount === 1 ? '' : 'e'} insgesamt
          aktiviert.
        </p>
      )}
    </div>
  );
}
