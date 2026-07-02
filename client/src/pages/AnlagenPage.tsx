import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, Plus, QrCode, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AnlageQr } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useAnlagen, useDeleteAnlage } from '@/hooks/useAnlagen';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { ListSkeleton } from '@/components/ui/skeleton';
import { AnlageDialog } from '@/components/anlage/AnlageDialog';

export function AnlagenPage() {
  const { data, isLoading } = useAnlagen();
  const remove = useDeleteAnlage();
  const [creating, setCreating] = useState(false);

  const list = data ?? [];

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <Button asChild variant="ghost" size="icon" aria-label="Zurück">
            <Link to="/wartung">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="flex-1 text-lg font-semibold">Anlagen / QR-Codes</h1>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Neu
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-2 p-4">
        {isLoading ? (
          <ListSkeleton />
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Noch keine Anlagen. Lege eine an, drucke den QR-Code aus und
              klebe ihn an die Anlage — beim Scan kommst du direkt zur
              Anlagen-Übersicht.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.map((a) => (
              <AnlageRow
                key={a.id}
                anlage={a}
                onDelete={async () => {
                  const ok = await confirmDialog({
                    title: 'Anlage löschen?',
                    description: `„${a.anlage}“ wird endgültig gelöscht.`,
                    confirmLabel: 'Löschen',
                    destructive: true,
                  });
                  if (!ok) return;
                  remove.mutate(a.id, {
                    onError: (err) =>
                      toast.error(err instanceof ApiError ? err.message : 'Fehler'),
                  });
                }}
              />
            ))}
          </ul>
        )}
      </main>

      {creating && <AnlageDialog anlage={null} onClose={() => setCreating(false)} />}
    </>
  );
}

function AnlageRow({
  anlage,
  onDelete,
}: {
  anlage: AnlageQr;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 p-3">
      <QrCode className="h-5 w-5 shrink-0 text-muted-foreground" />
      <Link to={`/anlagen/${anlage.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{anlage.anlage}</p>
        <p className="truncate text-xs text-muted-foreground">
          {anlage.kunde_name || 'kein Kunde'}
          {anlage.standort ? ` · ${anlage.standort.split('\n')[0]}` : ''}
        </p>
      </Link>
      <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Löschen">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  );
}
