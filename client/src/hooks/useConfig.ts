import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfigKey, ConfigValueByKey } from '@ahv/shared';
import { apiClient } from '@/lib/api';

export type ConfigMap = {
  [K in ConfigKey]: ConfigValueByKey[K] | null;
};

export const CONFIG_QUERY_KEY = ['config'] as const;

export function useConfig() {
  return useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: () => apiClient<ConfigMap>('/api/config'),
  });
}

export function useSetConfig<K extends ConfigKey>(key: K) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: ConfigValueByKey[K]) =>
      apiClient<{ key: K; value: ConfigValueByKey[K] }>('/api/config', {
        method: 'PUT',
        body: { key, value },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY }),
  });
}

export function useDeleteConfig(key: ConfigKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ ok: true }>(`/api/config/${encodeURIComponent(key)}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY }),
  });
}
