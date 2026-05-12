import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { LogEntry } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';

const ACTION_LABEL: Record<string, string> = {
  'auftrag.created': 'Auftrag angelegt',
  'auftrag.deleted': 'Auftrag gelöscht',
  'auftrag.duplicated': 'Auftrag dupliziert',
  'auftrag.converted': 'Auftrag konvertiert',
  'auftrag.abgeschickt': 'Auftrag abgeschickt',
  'auftrag.mail_sent': 'E-Mail versendet',
  'mail.test_sent': 'Test-Mail',
  'wartung.plan_created': 'Wartungsplan angelegt',
  'wartung.plan_deleted': 'Wartungsplan gelöscht',
  'wartung.erledigt': 'Wartung erledigt',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProtokollPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['log'],
    queryFn: () => apiClient<LogEntry[]>('/api/log?limit=200'),
  });
  const list = data ?? [];

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <Button asChild variant="ghost" size="icon" aria-label="Zurück">
            <Link to="/settings">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="flex-1 text-lg font-semibold">Aktionsprotokoll</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Einträge im Protokoll.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.map((e) => {
              const label = ACTION_LABEL[e.action] ?? e.action;
              const auftragLink = e.entity_type === 'auftrag' && e.entity_id;
              const wartungLink = e.entity_type === 'wartungsplan' && e.entity_id;
              return (
                <li key={e.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    {e.message && (
                      <p className="truncate text-xs text-muted-foreground">{e.message}</p>
                    )}
                    {auftragLink && (
                      <Link
                        to={`/auftraege/${e.entity_id}/edit`}
                        className="text-xs text-primary underline-offset-2 hover:underline"
                      >
                        Auftrag öffnen
                      </Link>
                    )}
                    {wartungLink && (
                      <Link
                        to={`/wartung`}
                        className="text-xs text-primary underline-offset-2 hover:underline"
                      >
                        Zur Wartung
                      </Link>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(e.timestamp)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
