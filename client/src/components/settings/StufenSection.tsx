import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Stufe } from '@ahv/shared';
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
  type StufeInput,
  useCreateStufe,
  useDeleteStufe,
  useMoveStufe,
  useStufen,
  useUpdateStufe,
} from '@/hooks/useStufen';

const stufeFormSchema = z.object({
  bezeichnung: z.string().min(1, 'Bezeichnung ist Pflicht'),
  stundenpreis: z
    .number({ invalid_type_error: 'Zahl erforderlich' })
    .min(0, 'Nicht negativ')
    .finite(),
});

type StufeFormValues = z.infer<typeof stufeFormSchema>;

export function StufenSection() {
  const { data, isLoading } = useStufen();
  const move = useMoveStufe();
  const remove = useDeleteStufe();

  const [editing, setEditing] = useState<Stufe | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Lade …</p>;
  }

  const stufen = data ?? [];

  return (
    <div className="space-y-3">
      {stufen.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Stufen angelegt.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {stufen.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 p-3">
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{s.bezeichnung}</p>
                <p className="text-xs text-muted-foreground">
                  {formatEuro(s.stundenpreis)} / Std netto
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={i === 0 || move.isPending}
                onClick={() => move.mutate({ id: s.id, direction: 'up' })}
                aria-label="Nach oben"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={i === stufen.length - 1 || move.isPending}
                onClick={() => move.mutate({ id: s.id, direction: 'down' })}
                aria-label="Nach unten"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setEditing(s)}
                aria-label="Bearbeiten"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Stufe löschen?',
                    description: `„${s.bezeichnung}“ wird endgültig gelöscht.`,
                    confirmLabel: 'Löschen',
                    destructive: true,
                  });
                  if (!ok) return;
                  remove.mutate(s.id, {
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

      <Button type="button" variant="outline" onClick={() => setCreating(true)}>
        <Plus className="h-4 w-4" />
        Stufe hinzufügen
      </Button>

      {creating && (
        <StufeDialog
          stufe={null}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <StufeDialog
          stufe={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

interface StufeDialogProps {
  stufe: Stufe | null;
  onClose: () => void;
}

function StufeDialog({ stufe, onClose }: StufeDialogProps) {
  const create = useCreateStufe();
  const update = useUpdateStufe();

  const form = useForm<StufeFormValues>({
    resolver: zodResolver(stufeFormSchema),
    defaultValues: {
      bezeichnung: stufe?.bezeichnung ?? '',
      stundenpreis: stufe?.stundenpreis ?? 0,
    },
  });

  const isPending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    const payload: StufeInput = {
      bezeichnung: values.bezeichnung,
      stundenpreis: values.stundenpreis,
    };
    const onSuccess = () => {
      toast.success(stufe ? 'Stufe aktualisiert' : 'Stufe angelegt');
      onClose();
    };
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : 'Fehler');

    if (stufe) {
      update.mutate({ id: stufe.id, input: payload }, { onSuccess, onError });
    } else {
      create.mutate(payload, { onSuccess, onError });
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{stufe ? 'Stufe bearbeiten' : 'Neue Stufe'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bezeichnung">Bezeichnung</Label>
            <Input
              id="bezeichnung"
              placeholder="Geselle"
              {...form.register('bezeichnung')}
            />
            {form.formState.errors.bezeichnung && (
              <p className="text-xs text-destructive">
                {form.formState.errors.bezeichnung.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stundenpreis">Stundenpreis (EUR netto)</Label>
            <Input
              id="stundenpreis"
              type="number"
              step="0.01"
              min="0"
              {...form.register('stundenpreis', { valueAsNumber: true })}
            />
            {form.formState.errors.stundenpreis && (
              <p className="text-xs text-destructive">
                {form.formState.errors.stundenpreis.message}
              </p>
            )}
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

function formatEuro(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}
