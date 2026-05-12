import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, apiClient } from '@/lib/api';

const PUSH_QUERY_KEY = ['push', 'subscription'] as const;

interface VapidKeyResponse {
  publicKey: string;
}

interface PushStatusResponse {
  count: number;
}

/** Konvertiert Base64-URL nach Uint8Array (für applicationServerKey). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export interface PushState {
  /** Browser unterstützt überhaupt Push (PushManager + Notification API)? */
  supported: boolean;
  /** Aktuelle Permission ("default", "granted", "denied") */
  permission: NotificationPermission;
  /** Lokale Subscription vorhanden (Browser-State)? */
  subscribed: boolean;
  /** Anzahl Subscriptions die der Server kennt (alle Geräte) */
  serverCount: number | null;
}

async function getLocalSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Liest den aktuellen Zustand (Permission + lokale Subscription). */
export function usePushState(): {
  state: PushState;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<PushState>({
    supported:
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
    permission:
      typeof window !== 'undefined' && 'Notification' in window
        ? Notification.permission
        : 'default',
    subscribed: false,
    serverCount: null,
  });

  const refresh = async (): Promise<void> => {
    if (!state.supported) return;
    const sub = await getLocalSubscription();
    let serverCount: number | null = null;
    try {
      const s = await apiClient<PushStatusResponse>('/api/push/status');
      serverCount = s.count;
    } catch {
      // ignore — Status ist nice-to-have
    }
    setState((s) => ({
      ...s,
      permission: Notification.permission,
      subscribed: !!sub,
      serverCount,
    }));
  };

  useEffect(() => {
    if (!state.supported) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, refresh };
}

export function useSubscribePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push wird in diesem Browser nicht unterstützt');
      }

      // 1. Permission anfragen
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        throw new Error('Berechtigung für Benachrichtigungen verweigert');
      }

      // 2. VAPID-Public-Key holen
      const { publicKey } = await apiClient<VapidKeyResponse>(
        '/api/push/vapid-public-key',
      );

      // 3. Beim PushManager subscriben
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 4. Subscription beim Backend hinterlegen
      const json = sub.toJSON();
      await apiClient('/api/push/subscribe', {
        method: 'POST',
        body: {
          endpoint: sub.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
          },
          user_agent: navigator.userAgent,
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PUSH_QUERY_KEY }),
  });
}

export function useUnsubscribePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const sub = await getLocalSubscription();
      if (!sub) return;
      try {
        await apiClient('/api/push/unsubscribe', {
          method: 'POST',
          body: { endpoint: sub.endpoint },
        });
      } catch (err) {
        // Server-Fehler tolerieren — wir wollen die lokale Subscription
        // trotzdem entfernen
        if (!(err instanceof ApiError)) throw err;
      }
      await sub.unsubscribe();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PUSH_QUERY_KEY }),
  });
}

/** Schickt einen lokalen Test-Push-Status — eigentlich nur Convenience. */
export function usePushStatus() {
  return useQuery({
    queryKey: PUSH_QUERY_KEY,
    queryFn: () => apiClient<PushStatusResponse>('/api/push/status'),
  });
}
