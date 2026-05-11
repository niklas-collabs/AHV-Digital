import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AuftragTyp, Vorlage } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useDeleteVorlage, useUpdateVorlage, useVorlagen } from '@/hooks/useVorlagen';

const TYP_LABEL: Record<AuftragTyp, string> = {
  arbeitszettel: 'Arbeitszettel',
  angebot: 'Angebot',
  lieferschein: 'Lieferschein',
};

export function VorlagenSection() {
  const { data, isLoading } = useVorlagen();
  const remove = useDeleteVorlage();
  const [editing, setEditing] = useState<Vorlage | null>(null);

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
    <>
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
              onClick={() => setEditing(v)}
              aria-label="Umbenennen"
            >
              <Pencil className="h-4 w-4" />
            </Button>
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

      {editing && (
        <VorlageRenameDialog vorlage={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function VorlageRenameDialog({
  vorlage,
  onClose,
}: {
  vorlage: Vorlage;
  onClose: () => void;
}) {
  const [name, setName] = useState(vorlage.name);
  const update = useUpdateVorlage();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name ist Pflicht');
      return;
    }
    update.mutate(
      {
        id: vorlage.id,
        input: {
          name: trimmed,
          typ: vorlage.typ,
          data: vorlage.data as Record<string, unknown>,
        },
      },
      {
        onSuccess: () => {
          toast.success('Vorlage umbenannt');
          onClose();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Fehler'),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !update.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vorlage umbenennen</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vorlage-rename">Name</Label>
            <Input
              id="vorlage-rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={update.isPending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Speichert …' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
