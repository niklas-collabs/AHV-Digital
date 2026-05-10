import { ClipboardList, Copy, FileText, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { AuftragTyp } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import { useDuplicateAuftrag } from '@/hooks/useAuftraege';

interface AuftragAktionenDialogProps {
  open: boolean;
  onClose: () => void;
  auftragId: string;
  currentTyp: AuftragTyp;
}

const TYP_LABELS: Record<AuftragTyp, { label: string; icon: typeof FileText }> = {
  arbeitszettel: { label: 'Arbeitszettel', icon: ClipboardList },
  angebot: { label: 'Angebot', icon: FileText },
  lieferschein: { label: 'Lieferschein', icon: Package },
};

export function AuftragAktionenDialog({
  open,
  onClose,
  auftragId,
  currentTyp,
}: AuftragAktionenDialogProps) {
  const navigate = useNavigate();
  const duplicate = useDuplicateAuftrag();

  const run = (typ?: AuftragTyp) => {
    duplicate.mutate(
      { id: auftragId, ...(typ ? { typ } : {}) },
      {
        onSuccess: (created) => {
          toast.success(typ ? `Als ${TYP_LABELS[typ].label} übernommen` : 'Dupliziert');
          onClose();
          navigate(`/auftraege/${created.id}/edit`, { replace: false });
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : 'Fehler');
        },
      },
    );
  };

  // Liste der Konvertierungs-Ziele = alle Typen außer dem aktuellen
  const konvertTargets: AuftragTyp[] = (['arbeitszettel', 'angebot', 'lieferschein'] as const).filter(
    (t) => t !== currentTyp,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !duplicate.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aktionen</DialogTitle>
          <DialogDescription>
            Erstellt jeweils eine neue Kopie als Entwurf — das Original bleibt
            unverändert. Fotos und Unterschrift werden nicht übernommen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            disabled={duplicate.isPending}
            onClick={() => run()}
          >
            <Copy className="h-4 w-4" />
            Duplizieren (gleicher Typ)
          </Button>

          {konvertTargets.map((t) => {
            const { label, icon: Icon } = TYP_LABELS[t];
            return (
              <Button
                key={t}
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={duplicate.isPending}
                onClick={() => run(t)}
              >
                <Icon className="h-4 w-4" />
                Als {label} übernehmen
              </Button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={duplicate.isPending}
          >
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
