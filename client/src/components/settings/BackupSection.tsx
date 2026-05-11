import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError, apiClient } from '@/lib/api';

interface BackupEntry {
  filename: string;
  size: number;
  mtime: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BackupSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => apiClient<BackupEntry[]>('/api/backups'),
  });

  const runNow = useMutation({
    mutationFn: () =>
      apiClient<{ backupFile: string | null; deleted: string[] }>('/api/backups/run', {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Backup erstellt');
      qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Backup fehlgeschlagen'),
  });

  const list = data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Tägliches automatisches Backup um 03:00 UTC. Aufbewahrung: 30 Tage. Manuelles
        Backup mit dem Knopf rechts, Download über die Liste unten.
      </p>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => runNow.mutate()}
        disabled={runNow.isPending}
      >
        <RefreshCw className={runNow.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        {runNow.isPending ? 'Erstelle …' : 'Backup jetzt erstellen'}
      </Button>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Backups vorhanden.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {list.map((b) => (
            <li key={b.filename} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.filename}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDate(b.mtime)} · {formatBytes(b.size)}
                </p>
              </div>
              <a
                href={`/api/backups/${encodeURIComponent(b.filename)}`}
                download
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent"
                aria-label="Herunterladen"
                title="Herunterladen"
              >
                <Download className="h-4 w-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
