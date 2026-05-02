import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Pauschale } from '@ahv/shared';
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
import { cn } from '@/lib/utils';
import {
  type PauschaleInput,
  useCreatePauschale,
  useDeletePauschale,
  usePauschalen,
  useUpdatePauschale,
} from '@/hooks/usePauschalen';

const STANDARD_EINHEITEN = ['Psch', 'Stk', 'm', 'm²', 'l', 'kg', 'Std'];
const STANDARD_MWST = [0, 7, 19];

const pauschaleFormSchema = z.object({
  name: z.string().min(1, 'Name ist Pflicht'),
  preis_netto: z
    .number({ invalid_type_error: 'Zahl erforderlich' })
    .min(0, 'Nicht negativ')
    .finite(),
  einheit: z.string().min(1, 'Einheit ist Pflicht'),
  mwst_prozent: z.number().min(0).max(100),
  ist_lohnkosten: z.boolean(),
});

type PauschaleFormValues = z.infer<typeof pauschaleFormSchema>;

export function PauschalenSection() {
  const { data, isLoading } = usePauschalen();
  const remove = useDeletePauschale();

  const [editing, setEditing] = useState<Pauschale | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Lade …</p>;
  }

  const pauschalen = data ?? [];

  return (
    <div className="space-y-3">
      {pauschalen.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Pauschalen angelegt.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {pauschalen.map((p) => (
            <li key={p.id} className="flex items-center gap-2 p-3">
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatEuro(p.preis_netto)} / {p.einheit} · {p.mwst_prozent}% MwSt
                  {p.ist_lohnkosten && (
                    <span className="ml-2 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      Lohnkosten §35a
                    </span>
                  )}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setEditing(p)}
                aria-label="Bearbeiten"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (confirm(`"${p.name}" wirklich löschen?`)) {
                    remove.mutate(p.id, {
                      onError: (err) =>
                        toast.error(err instanceof ApiError ? err.message : 'Fehler'),
                    });
                  }
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
        Pauschale hinzufügen
      </Button>

      {creating && (
        <PauschaleDialog pauschale={null} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <PauschaleDialog pauschale={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

interface PauschaleDialogProps {
  pauschale: Pauschale | null;
  onClose: () => void;
}

function PauschaleDialog({ pauschale, onClose }: PauschaleDialogProps) {
  const create = useCreatePauschale();
  const update = useUpdatePauschale();

  const form = useForm<PauschaleFormValues>({
    resolver: zodResolver(pauschaleFormSchema),
    defaultValues: {
      name: pauschale?.name ?? '',
      preis_netto: pauschale?.preis_netto ?? 0,
      einheit: pauschale?.einheit ?? 'Psch',
      mwst_prozent: pauschale?.mwst_prozent ?? 19,
      ist_lohnkosten: pauschale?.ist_lohnkosten ?? false,
    },
  });

  const isLohnkosten = form.watch('ist_lohnkosten');
  const isPending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    const payload: PauschaleInput = values;
    const onSuccess = () => {
      toast.success(pauschale ? 'Pauschale aktualisiert' : 'Pauschale angelegt');
      onClose();
    };
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : 'Fehler');

    if (pauschale) {
      update.mutate({ id: pauschale.id, input: payload }, { onSuccess, onError });
    } else {
      create.mutate(payload, { onSuccess, onError });
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pauschale ? 'Pauschale bearbeiten' : 'Neue Pauschale'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" placeholder="Anfahrt" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-preis">Preis netto (EUR)</Label>
              <Input
                id="p-preis"
                type="number"
                step="0.01"
                min="0"
                {...form.register('preis_netto', { valueAsNumber: true })}
              />
              {form.formState.errors.preis_netto && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.preis_netto.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-einheit">Einheit</Label>
              <Input
                id="p-einheit"
                list="einheit-opts"
                {...form.register('einheit')}
              />
              <datalist id="einheit-opts">
                {STANDARD_EINHEITEN.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-mwst">MwSt %</Label>
            <Input
              id="p-mwst"
              type="number"
              step="1"
              min="0"
              max="100"
              list="mwst-opts"
              {...form.register('mwst_prozent', { valueAsNumber: true })}
            />
            <datalist id="mwst-opts">
              {STANDARD_MWST.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <button
            type="button"
            onClick={() => form.setValue('ist_lohnkosten', !isLohnkosten)}
            className={cn(
              'flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
              isLohnkosten
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-accent/30',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2',
                isLohnkosten ? 'border-primary bg-primary' : 'border-muted-foreground/40',
              )}
            >
              {isLohnkosten && (
                <svg viewBox="0 0 12 12" className="h-3 w-3 fill-primary-foreground">
                  <path d="M5 8.5L2.5 6l-.7.7L5 9.9l6.2-6.2-.7-.7z" />
                </svg>
              )}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">Als Lohnkosten zaehlen</span>
              <span className="block text-xs text-muted-foreground">
                Für Steuer-Reporting nach §35a EStG
              </span>
            </span>
          </button>
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
