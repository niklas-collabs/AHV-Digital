import { useState } from 'react';
import { ClipboardList, FileText, Package } from 'lucide-react';
import type { AuftragTyp, Vorlage } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useVorlagen } from '@/hooks/useVorlagen';
import { cn } from '@/lib/utils';

const TYP_OPTIONS: Array<{ typ: AuftragTyp; label: string; icon: typeof FileText }> = [
  { typ: 'arbeitszettel', label: 'Arbeitszettel', icon: ClipboardList },
  { typ: 'angebot', label: 'Angebot', icon: FileText },
  { typ: 'lieferschein', label: 'Lieferschein', icon: Package },
];

const TYP_LABEL: Record<AuftragTyp, string> = {
  arbeitszettel: 'Arbeitszettel',
  angebot: 'Angebot',
  lieferschein: 'Lieferschein',
};

interface VorlageListDialogProps {
  open: boolean;
  onClose: () => void;
  /** Wird aufgerufen, sobald der Nutzer eine Vorlage gewählt hat. */
  onPick: (vorlage: Vorlage) => void;
}

export function VorlageListDialog({ open, onClose, onPick }: VorlageListDialogProps) {
  const [filter, setFilter] = useState<AuftragTyp | 'alle'>('alle');
  const { data, isLoading } = useVorlagen(filter === 'alle' ? undefined : filter);

  const vorlagen = data ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aus Vorlage anlegen</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2">
          <Button
            type="button"
            variant={filter === 'alle' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('alle')}
            className="h-auto py-2 text-xs"
          >
            Alle
          </Button>
          {TYP_OPTIONS.map(({ typ, label, icon: Icon }) => (
            <Button
              key={typ}
              type="button"
              variant={filter === typ ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(typ)}
              className="h-auto flex-col gap-1 py-2 text-xs"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Lädt …</p>
          ) : vorlagen.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Keine Vorlagen vorhanden. In einem geöffneten Auftrag „Als Vorlage
                speichern" wählen.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {vorlagen.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onPick(v)}
                    className={cn(
                      'flex w-full items-center gap-3 p-3 text-left transition-colors',
                      'hover:bg-accent focus:bg-accent focus:outline-none',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{v.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {TYP_LABEL[v.typ]}
                        {v.data.titel ? ` · ${v.data.titel}` : ''}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
