import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { LogoConfig } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { ApiError, apiClient } from '@/lib/api';
import { CONFIG_QUERY_KEY } from '@/hooks/useConfig';

interface LogoUploadSectionProps {
  current: LogoConfig | null;
}

export function LogoUploadSection({ current }: LogoUploadSectionProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cacheBust, setCacheBust] = useState(0);

  const upload = useMutation({
    mutationFn: async (file: File): Promise<LogoConfig> => {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch('/api/logo', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new ApiError(
          res.status,
          (data.code as string) ?? 'UNKNOWN',
          (data.error as string) ?? 'Upload fehlgeschlagen',
          data,
        );
      }
      return data as LogoConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
      setCacheBust(Date.now());
      toast.success('Logo gespeichert');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Upload fehlgeschlagen');
    },
  });

  const remove = useMutation({
    mutationFn: () => apiClient('/api/logo', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
      setCacheBust(Date.now());
      toast.success('Logo entfernt');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Loeschen fehlgeschlagen');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error('Datei zu gross (max 1 MB)');
      return;
    }
    upload.mutate(file);
    e.target.value = '';
  };

  const isPending = upload.isPending || remove.isPending;
  const logoSrc = current ? `/api/logo?v=${cacheBust}` : null;

  return (
    <div className="space-y-3">
      {logoSrc ? (
        <div className="flex items-center justify-center rounded-md border border-border bg-muted/30 p-4">
          <img
            src={logoSrc}
            alt="Firmenlogo"
            className="max-h-32 max-w-full object-contain"
            onError={() => setCacheBust(Date.now())}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-8 text-sm text-muted-foreground">
          Kein Logo gesetzt
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
        >
          <Upload className="h-4 w-4" />
          {current ? 'Logo austauschen' : 'Logo hochladen'}
        </Button>
        {current && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={isPending}
          >
            <Trash2 className="h-4 w-4" />
            Entfernen
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">PNG oder JPEG, max 1 MB.</p>
    </div>
  );
}
