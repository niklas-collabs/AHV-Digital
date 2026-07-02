import { useState } from 'react';
import { CheckCircle2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import {
  useDeleteLexofficeApiKey,
  useLexofficeStatus,
  useSetLexofficeApiKey,
  useSyncLexoffice,
  useTestLexofficeConnection,
} from '@/hooks/useLexoffice';

export function LexofficeSection() {
  const { data: status, isLoading } = useLexofficeStatus();
  const setKey = useSetLexofficeApiKey();
  const deleteKey = useDeleteLexofficeApiKey();
  const testConnection = useTestLexofficeConnection();
  const sync = useSyncLexoffice();

  const [apiKey, setApiKey] = useState('');

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Lädt …</p>;
  }

  const apiKeySet = status?.apiKeySet ?? false;
  const lastSync = status?.lastSync ?? null;

  const handleSetKey = () => {
    if (apiKey.trim().length < 20) {
      toast.error('API-Key zu kurz (mind. 20 Zeichen)');
      return;
    }
    setKey.mutate(apiKey.trim(), {
      onSuccess: () => {
        toast.success('API-Key gespeichert');
        setApiKey('');
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen'),
    });
  };

  const handleDeleteKey = async () => {
    const ok = await confirmDialog({
      title: 'API-Key löschen?',
      description: 'Sync mit Lexoffice ist danach nicht mehr möglich.',
      confirmLabel: 'Löschen',
      destructive: true,
    });
    if (!ok) return;
    deleteKey.mutate(undefined, {
      onSuccess: () => toast.success('API-Key entfernt'),
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Löschen fehlgeschlagen'),
    });
  };

  const handleTest = () => {
    testConnection.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(
          `Verbindung OK — ${result.contactsTotal} Kontakt(e) in Lexoffice`,
        );
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Verbindungstest fehlgeschlagen'),
    });
  };

  const handleSync = async () => {
    const ok = await confirmDialog({
      title: 'Lexoffice-Sync starten?',
      description: 'Alle Lexoffice-Kunden werden in die App synchronisiert.',
      confirmLabel: 'Synchronisieren',
    });
    if (!ok) return;
    sync.mutate(undefined, {
      onSuccess: (result) => {
        const parts = [
          `${result.added} neu`,
          `${result.updated} aktualisiert`,
          `${result.skipped} übersprungen`,
        ];
        if (result.errors.length > 0) {
          parts.push(`${result.errors.length} Fehler`);
        }
        toast.success(`Sync fertig — ${parts.join(', ')}`);
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Sync fehlgeschlagen'),
    });
  };

  if (!apiKeySet) {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="lexoffice-key">API-Key</Label>
          <Input
            id="lexoffice-key"
            type="password"
            autoComplete="off"
            placeholder="lxof_…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Erzeugen unter „Einstellungen → Öffentliche API" in Lexoffice. Wird nur server-seitig
            gespeichert und nie zum Browser zurückgeschickt.
          </p>
        </div>
        <Button onClick={handleSetKey} disabled={setKey.isPending}>
          {setKey.isPending ? 'Speichert …' : 'API-Key speichern'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          API-Key ist gesetzt
        </p>
        {lastSync && (
          <p className="mt-1 text-xs text-muted-foreground">
            Letzte Synchronisierung: {formatDateTime(lastSync)}
          </p>
        )}
        {!lastSync && (
          <p className="mt-1 text-xs text-muted-foreground">Noch nie synchronisiert</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleTest}
          disabled={testConnection.isPending}
        >
          {testConnection.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Verbindung prüfen
        </Button>
        <Button type="button" onClick={handleSync} disabled={sync.isPending}>
          {sync.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {sync.isPending ? 'Synchronisiere …' : 'Kunden synchronisieren'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleDeleteKey}
          disabled={deleteKey.isPending}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
          API-Key entfernen
        </Button>
      </div>

      {sync.data && sync.data.errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <XCircle className="h-4 w-4" />
            {sync.data.errors.length} Datensätze konnten nicht übernommen werden
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {sync.data.errors.slice(0, 5).map((e) => (
              <li key={e.lexofficeId}>
                {e.lexofficeId.slice(0, 8)}: {e.reason}
              </li>
            ))}
            {sync.data.errors.length > 5 && (
              <li>… und {sync.data.errors.length - 5} weitere</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('de-DE') +
    ' ' +
    d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  );
}
