import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GmailConfig } from '@ahv/shared';
import { apiClient } from '@/lib/api';
import { CONFIG_QUERY_KEY, useSetConfig } from './useConfig';

export interface MailReadiness {
  gmailSet: boolean;
  firmaEmailSet: boolean;
}

export const MAIL_STATUS_KEY = ['mail', 'status'] as const;

export function useMailStatus() {
  return useQuery({
    queryKey: MAIL_STATUS_KEY,
    queryFn: () => apiClient<MailReadiness>('/api/mail/status'),
  });
}

export function useSetGmailConfig() {
  const setConfig = useSetConfig('gmail');
  const qc = useQueryClient();
  return {
    ...setConfig,
    mutate: (
      value: GmailConfig,
      opts?: Parameters<typeof setConfig.mutate>[1],
    ) =>
      setConfig.mutate(value, {
        ...opts,
        onSuccess: (...args) => {
          qc.invalidateQueries({ queryKey: MAIL_STATUS_KEY });
          qc.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
          opts?.onSuccess?.(...args);
        },
      }),
  };
}

export function useTestMail() {
  return useMutation({
    mutationFn: () =>
      apiClient<{ ok: true; to: string }>('/api/mail/test', {
        method: 'POST',
        body: {},
      }),
  });
}
