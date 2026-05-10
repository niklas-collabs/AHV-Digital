import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AuftragTyp } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useDeleteVorlage, useVorlagen } from '@/hooks/useVorlagen';

const TYP_LABEL: Record<AuftragTyp, string> = {
  arbeitszettel: 'Arbeitszettel',
  angebot: 'Angebot',
  lieferschein: 'Lieferschein',
};

export function VorlagenSection() {
  const { data, isLoading } = useVorlagen();
  const remove = useDeleteVorlage();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Lädt …</p>;
  }

  const vorlagen = data ?? [];

  if (vorlagen.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine Vorlagen. In einem geöffneten Auftrag „Als Vorlage speichern"
        wählen, um wiederkehrende Aufträge schnell anzulegen.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {vorlagen.map((v) => (
        <li key={v.id} className="flex items-center gap-2 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{v.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {TYP_LABEL[v.typ]}
              {v.data.titel ? ` · ${v.data.titel}` : ''}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => {
              if (!confirm(`Vorlage "${v.name}" wirklich löschen?`)) return;
              remove.mutate(v.id, {
                onError: (err) =>
                  toast.error(err instanceof ApiError ? err.message : 'Fehler'),
              });
            }}
            aria-label="Löschen"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
