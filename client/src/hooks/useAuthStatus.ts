import { useQuery } from '@tanstack/react-query';
import type { AuthStatusResponse } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export const AUTH_STATUS_QUERY_KEY = ['auth', 'status'] as const;

export function useAuthStatus() {
  return useQuery({
    queryKey: AUTH_STATUS_QUERY_KEY,
    queryFn: () => apiClient<AuthStatusResponse>('/api/auth/status'),
    refetchInterval: 60_000,
    staleTime: 0,
  });
}
