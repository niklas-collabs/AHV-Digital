import { useState } from 'react';
import { toast } from 'sonner';
import type { Kunde, Wartungsplan } from '@ahv/shared';
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
  useCreateWartungsplan,
  useUpdateWartungsplan,
  type WartungsplanInput,
} from '@/hooks/useWartung';
import { KundeSelector } from '@/components/auftrag/KundeSelector';

interface WartungsplanDialogProps {
  plan: Wartungsplan | null;
  onClose: () => void;
}

interface FormState {
  kunde_id: string | null;
  kunde_name: string;
  anlage: string;
  standort: string;
  intervall_monate: number;
  erinnerung_tage: number;
  letzte_wartung: string;
  notiz: string;
}

function fromPlan(p: Wartungsplan): FormState {
  return {
    kunde_id: p.kunde_id,
    kunde_name: p.kunde_name,
    anlage: p.anlage,
    standort: p.standort ?? '',
    intervall_monate: p.intervall_monate,
    erinnerung_tage: p.erinnerung_tage,
    letzte_wartung: p.letzte_wartung ?? '',
    notiz: p.notiz ?? '',
  };
}

const EMPTY: FormState = {
  kunde_id: null,
  kunde_name: '',
  anlage: '',
  standort: '',
  intervall_monate: 12,
  erinnerung_tage: 14,
  letzte_wartung: '',
  notiz: '',
};

export function WartungsplanDialog({ plan, onClose }: WartungsplanDialogProps) {
  const [state, setState] = useState<FormState>(plan ? fromPlan(plan) : EMPTY);
  const create = useCreateWartungsplan();
  const update = useUpdateWartungsplan();
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
    const input: WartungsplanInput = {
      kunde_id: state.kunde_id,
      kunde_name: state.kunde_name.trim(),
      anlage: state.anlage.trim(),
      standort: state.standort.trim() || null,
      intervall_monate: state.intervall_monate,
      erinnerung_tage: state.erinnerung_tage,
      letzte_wartung: state.letzte_wartung || null,
      notiz: state.notiz.trim() || null,
    };
    const onSuccess = () => {
      toast.success(plan ? 'Aktualisiert' : 'Wartungsplan angelegt');
      onClose();
    };
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : 'Fehler');

    if (plan) {
      update.mutate({ id: plan.id, input }, { onSuccess, onError });
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
      // Standort als Default vorschlagen wenn leer
      standort: s.standort
        ? s.standort
        : [k.strasse, [k.plz, k.ort].filter(Boolean).join(' ')].filter(Boolean).join('\n'),
    }));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? 'Wartungsplan bearbeiten' : 'Neuer Wartungsplan'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="anlage">Anlage</Label>
            <Input
              id="anlage"
              placeholder="z.B. Gasheizung Keller"
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
              placeholder="oder Freitext-Name (wenn kein Kunde verknüpft)"
              value={state.kunde_name}
              onChange={(e) => setState((s) => ({ ...s, kunde_name: e.target.value }))}
              disabled={!!state.kunde_id}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="standort">Standort (optional)</Label>
            <Textarea
              id="standort"
              rows={2}
              placeholder="z.B. Wohnung Hofseite, 2. OG"
              value={state.standort}
              onChange={(e) => setState((s) => ({ ...s, standort: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="intervall">Intervall (Monate)</Label>
              <Input
                id="intervall"
                type="number"
                min="1"
                max="120"
                value={state.intervall_monate}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    intervall_monate: parseInt(e.target.value, 10) || 12,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="erinnerung">Erinnerung (Tage vorher)</Label>
              <Input
                id="erinnerung"
                type="number"
                min="0"
                max="365"
                value={state.erinnerung_tage}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    erinnerung_tage: parseInt(e.target.value, 10) || 14,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="letzte">Letzte Wartung (optional)</Label>
            <Input
              id="letzte"
              type="date"
              value={state.letzte_wartung}
              onChange={(e) => setState((s) => ({ ...s, letzte_wartung: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Wenn leer, wird der nächste Termin von heute aus gerechnet.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notiz">Notiz</Label>
            <Textarea
              id="notiz"
              rows={2}
              value={state.notiz}
              onChange={(e) => setState((s) => ({ ...s, notiz: e.target.value }))}
            />
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
