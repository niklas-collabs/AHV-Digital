import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Wartungsplan } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useMarkErledigt } from '@/hooks/useWartung';

interface ErledigtDialogProps {
  plan: Wartungsplan;
  onClose: () => void;
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

export function ErledigtDialog({ plan, onClose }: ErledigtDialogProps) {
  const navigate = useNavigate();
  const [datum, setDatum] = useState(todayIso());
  const [notiz, setNotiz] = useState('');
  const [createAuftrag, setCreateAuftrag] = useState(true);
  const mutation = useMarkErledigt();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!datum) {
      toast.error('Datum ist Pflicht');
      return;
    }
    mutation.mutate(
      {
        id: plan.id,
        input: {
          durchgefuehrt_am: datum,
          notiz: notiz.trim() || null,
          createAuftrag,
        },
      },
      {
        onSuccess: (result) => {
          toast.success(
            createAuftrag && result.auftrag
              ? 'Wartung erledigt — Arbeitszettel angelegt'
              : 'Wartung erledigt',
          );
          onClose();
          if (createAuftrag && result.auftrag) {
            navigate(`/auftraege/${result.auftrag.id}/edit`);
          }
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Fehler'),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Wartung erledigt</DialogTitle>
          <DialogDescription>
            {plan.anlage} · {plan.kunde_name}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="erledigt-datum">Durchgeführt am</Label>
            <Input
              id="erledigt-datum"
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="erledigt-notiz">Notiz (optional)</Label>
            <Textarea
              id="erledigt-notiz"
              rows={3}
              placeholder="z.B. Filter gewechselt, Druck geprüft"
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={createAuftrag}
              onChange={(e) => setCreateAuftrag(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Arbeitszettel-Entwurf anlegen
              <span className="block text-xs text-muted-foreground">
                Springt direkt in den neuen Auftrag, vorbefüllt mit Kunde und Anlage.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Speichert …' : 'Erledigt'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
