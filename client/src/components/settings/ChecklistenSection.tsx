import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ChecklistenVorlage, ChecklistenVorlageTyp } from '@ahv/shared';
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
import { confirmDialog } from '@/components/ui/confirm-dialog';
import {
  type ChecklisteInput,
  useChecklisten,
  useCreateCheckliste,
  useDeleteCheckliste,
  useUpdateCheckliste,
} from '@/hooks/useChecklisten';

const TYP_LABEL: Record<ChecklistenVorlageTyp, string> = {
  wartung: 'Wartung',
  arbeitszettel: 'Arbeitszettel',
  angebot: 'Angebot',
};

export function ChecklistenSection() {
  const { data, isLoading } = useChecklisten();
  const remove = useDeleteCheckliste();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ChecklistenVorlage | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground">Lädt …</p>;
  const list = data ?? [];

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Checklisten — z.B. „Heizungs-Inspektion" mit Standard-
          Punkten anlegen und im Auftrag mit einem Klick laden.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {TYP_LABEL[c.typ]} · {c.items.length} Punkte
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setEditing(c)}
                aria-label="Bearbeiten"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={remove.isPending}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Checkliste löschen?',
                    description: `„${c.name}“ wird endgültig gelöscht.`,
                    confirmLabel: 'Löschen',
                    destructive: true,
                  });
                  if (!ok) return;
                  remove.mutate(c.id, {
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
      )}

      <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
        <Plus className="h-4 w-4" />
        Checkliste anlegen
      </Button>

      {creating && <ChecklisteDialog item={null} onClose={() => setCreating(false)} />}
      {editing && <ChecklisteDialog item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ChecklisteDialog({
  item,
  onClose,
}: {
  item: ChecklistenVorlage | null;
  onClose: () => void;
}) {
  const create = useCreateCheckliste();
  const update = useUpdateCheckliste();
  const [name, setName] = useState(item?.name ?? '');
  const [typ, setTyp] = useState<ChecklistenVorlageTyp>(item?.typ ?? 'wartung');
  const [items, setItems] = useState<{ text: string }[]>(item?.items ?? []);
  const isPending = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name ist Pflicht');
      return;
    }
    const cleanItems = items
      .map((i) => ({ text: i.text.trim() }))
      .filter((i) => i.text.length > 0);
    if (cleanItems.length === 0) {
      toast.error('Mindestens ein Punkt erforderlich');
      return;
    }
    const input: ChecklisteInput = { name: name.trim(), typ, items: cleanItems };
    const onSuccess = () => {
      toast.success(item ? 'Aktualisiert' : 'Angelegt');
      onClose();
    };
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : 'Fehler');

    if (item) update.mutate({ id: item.id, input }, { onSuccess, onError });
    else create.mutate(input, { onSuccess, onError });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Checkliste bearbeiten' : 'Neue Checkliste'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cl-name">Name</Label>
            <Input
              id="cl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Heizungs-Wartung Standard"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-typ">Typ</Label>
            <select
              id="cl-typ"
              value={typ}
              onChange={(e) => setTyp(e.target.value as ChecklistenVorlageTyp)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="wartung">Wartung</option>
              <option value="arbeitszettel">Arbeitszettel</option>
              <option value="angebot">Angebot</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Punkte</Label>
            {items.map((it, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  value={it.text}
                  onChange={(e) =>
                    setItems((arr) =>
                      arr.map((x, i) => (i === idx ? { text: e.target.value } : x)),
                    )
                  }
                  placeholder={`Punkt ${idx + 1}`}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}
                  aria-label="Entfernen"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((arr) => [...arr, { text: '' }])}
            >
              <Plus className="h-4 w-4" />
              Punkt hinzufügen
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Speichert …' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
