import { useState } from 'react';
import { toast } from 'sonner';
import type { AnlageQr, Kunde } from '@ahv/shared';
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
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import {
  type AnlageInput,
  useCreateAnlage,
  useUpdateAnlage,
} from '@/hooks/useAnlagen';
import { useWartungsplaene } from '@/hooks/useWartung';
import { KundeSelector } from '@/components/auftrag/KundeSelector';

interface AnlageDialogProps {
  anlage: AnlageQr | null;
  onClose: () => void;
}

interface FormState {
  kunde_id: string | null;
  kunde_name: string;
  anlage: string;
  standort: string;
  wartungsplan_id: string | null;
}

const EMPTY: FormState = {
  kunde_id: null,
  kunde_name: '',
  anlage: '',
  standort: '',
  wartungsplan_id: null,
};

function fromAnlage(a: AnlageQr): FormState {
  return {
    kunde_id: a.kunde_id,
    kunde_name: a.kunde_name,
    anlage: a.anlage,
    standort: a.standort ?? '',
    wartungsplan_id: a.wartungsplan_id,
  };
}

export function AnlageDialog({ anlage, onClose }: AnlageDialogProps) {
  const [state, setState] = useState<FormState>(anlage ? fromAnlage(anlage) : EMPTY);
  const create = useCreateAnlage();
  const update = useUpdateAnlage();
  const { data: wartungsplaene } = useWartungsplaene();
  const isPending = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.anlage.trim()) {
      toast.error('Anlage ist Pflicht');
      return;
    }
    if (!state.kunde_id && !state.kunde_name.trim()) {
      toast.error('Kunde oder Kunden-Name ist Pflicht');
      return;
    }
    const input: AnlageInput = {
      kunde_id: state.kunde_id,
      kunde_name: state.kunde_name.trim(),
      anlage: state.anlage.trim(),
      standort: state.standort.trim() || null,
      wartungsplan_id: state.wartungsplan_id,
    };
    const onSuccess = () => {
      toast.success(anlage ? 'Anlage aktualisiert' : 'Anlage angelegt');
      onClose();
    };
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : 'Fehler');

    if (anlage) {
      update.mutate({ id: anlage.id, input }, { onSuccess, onError });
    } else {
      create.mutate(input, { onSuccess, onError });
    }
  };

  const handleSelectKunde = (k: Kunde) => {
    setState((s) => ({
      ...s,
      kunde_name:
        k.typ === 'firma'
          ? k.firmenname ?? ''
          : [k.vorname, k.nachname].filter(Boolean).join(' '),
      standort: s.standort
        ? s.standort
        : [k.strasse, [k.plz, k.ort].filter(Boolean).join(' ')].filter(Boolean).join('\n'),
    }));
  };

  // Wartungspläne die zum selben Kunden passen — als Vorauswahl
  const verfuegbarePlaene = (wartungsplaene ?? []).filter(
    (p) => !state.kunde_id || p.kunde_id === state.kunde_id,
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{anlage ? 'Anlage bearbeiten' : 'Neue Anlage'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="a-anlage">Anlage</Label>
            <Input
              id="a-anlage"
              placeholder="z.B. Gasheizung Keller, Klimaanlage Büro"
              value={state.anlage}
              onChange={(e) => setState((s) => ({ ...s, anlage: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Kunde</Label>
            <KundeSelector
              value={state.kunde_id}
              onChange={(kunde_id) => setState((s) => ({ ...s, kunde_id }))}
              onSelectKunde={handleSelectKunde}
            />
            <Input
              placeholder="oder Freitext-Name"
              value={state.kunde_name}
              onChange={(e) => setState((s) => ({ ...s, kunde_name: e.target.value }))}
              disabled={!!state.kunde_id}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-standort">Standort (optional)</Label>
            <Textarea
              id="a-standort"
              rows={2}
              placeholder="z.B. Keller, Heizungsraum"
              value={state.standort}
              onChange={(e) => setState((s) => ({ ...s, standort: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-wartungsplan">Wartungsplan (optional)</Label>
            <select
              id="a-wartungsplan"
              value={state.wartungsplan_id ?? ''}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  wartungsplan_id: e.target.value || null,
                }))
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">— kein Wartungsplan —</option>
              {verfuegbarePlaene.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.anlage} ({p.kunde_name})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Verknüpft den QR-Code mit einem bestehenden Wartungsplan —
              beim Scannen siehst du dann auch die Wartungs-Historie.
            </p>
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
