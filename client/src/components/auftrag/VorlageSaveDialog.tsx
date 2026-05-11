import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AuftragTyp } from '@ahv/shared';
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
import { useCreateVorlage } from '@/hooks/useVorlagen';

/** Felder eines Auftrags, die in einer Vorlage Sinn machen.
 *  Bewusst weggelassen: datum, kunde_id/_snapshot, objekt_adresse,
 *  fotos, signature_data_url, status, id, erstellt/geändert_am. */
export interface VorlageDataPayload {
  titel?: string;
  beschreibung?: string;
  notiz_intern?: string;
  mitarbeiter?: unknown[];
  materialien?: unknown[];
  teilleistungen?: unknown[];
}

interface VorlageSaveDialogProps {
  open: boolean;
  onClose: () => void;
  typ: AuftragTyp;
  data: VorlageDataPayload;
  /** Default-Vorschlag für den Vorlagennamen (z.B. der aktuelle Auftragstitel). */
  defaultName?: string;
}

export function VorlageSaveDialog({
  open,
  onClose,
  typ,
  data,
  defaultName = '',
}: VorlageSaveDialogProps) {
  const [name, setName] = useState(defaultName);
  const create = useCreateVorlage();

  // Bei jedem Öffnen den Namen auf den aktuellen Vorschlag setzen,
  // sonst bleibt der Wert vom letzten Mal stehen.
  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name ist Pflicht');
      return;
    }
    create.mutate(
      { name: trimmed, typ, data: data as Record<string, unknown> },
      {
        onSuccess: () => {
          toast.success('Vorlage gespeichert');
          setName('');
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : 'Fehler');
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !create.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Als Vorlage speichern</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vorlage-name">Name der Vorlage</Label>
            <Input
              id="vorlage-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Heizungswartung Standard"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Gespeichert werden: Titel, Beschreibung, interne Notiz, Mitarbeiter-
              und Material-Zeilen. Kunde, Datum, Fotos und Unterschrift werden
              nicht übernommen.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={create.isPending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Speichert …' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
