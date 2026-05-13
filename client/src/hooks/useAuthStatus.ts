import { useQuery } from '@tanstack/react-query';
import type { AuthStatusResponse } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const AUTH_STATUS_QUERY_KEY = ['auth', 'status'] as const;

/**
 * Auth-Status: einmal beim Mount, dann nochmal beim Window-Focus oder
 * beim Reconnect. Kein 1-Minuten-Polling — das war pro Tab eine Request
 * pro Minute, das summiert sich bei vielen offenen Tabs sinnlos.
 *
 * Wenn der Server den User durch Token-Ablauf rauswirft, sieht das
 * Frontend das spätestens beim nächsten API-Call (401 → ApiError).
 */
export function useAuthStatus() {
  return useQuery({
    queryKey: AUTH_STATUS_QUERY_KEY,
    queryFn: () => apiClient<AuthStatusResponse>('/api/auth/status'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/** Praktischer Helper für „aktueller User" — gibt null wenn nicht eingeloggt. */
export function useCurrentUser(): { id: string; name: string } | null {
  const { data } = useAuthStatus();
  return data?.user ?? null;
}
