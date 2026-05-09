import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMailStatus } from '@/hooks/useGmail';

export interface AbschickenOptions {
  sendKunde: boolean;
  sendFotos: boolean;
}

interface AbschickenDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (options: AbschickenOptions) => void;
  /** E-Mail des Kunden aus dem Snapshot — für die Anzeige */
  kundeEmail: string | null;
  /** Anzahl der Fotos am Auftrag */
  fotoCount: number;
  isPending?: boolean;
}

export function AbschickenDialog({
  open,
  onClose,
  onConfirm,
  kundeEmail,
  fotoCount,
  isPending,
}: AbschickenDialogProps) {
  const { data: status } = useMailStatus();

  const mailReady = (status?.gmailSet ?? false) && (status?.firmaEmailSet ?? false);
  const canSendKunde = mailReady && !!kundeEmail;

  const [sendKunde, setSendKunde] = useState(canSendKunde);
  const [sendFotos, setSendFotos] = useState(false);

  useEffect(() => {
    if (open) {
      setSendKunde(canSendKunde);
      setSendFotos(false);
    }
  }, [open, canSendKunde]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Auftrag abschicken</DialogTitle>
          <DialogDescription>
            Status wird auf „abgeschickt" gesetzt. Der Auftrag wandert ins Archiv und ist
            nur noch lesbar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!mailReady && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {status?.gmailSet === false
                ? 'Gmail-Konfiguration fehlt — kein Mail-Versand möglich. Konfigurieren unter „Mehr → Gmail-Versand".'
                : 'Firma-E-Mail fehlt — kein Mail-Versand möglich. Eintragen unter „Mehr → Firma".'}
            </p>
          )}

          {mailReady && !kundeEmail && (
            <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Der Kunde hat keine E-Mail-Adresse — er kann nicht angeschrieben werden.
              Du kannst trotzdem nur den Auftrag abschließen.
            </p>
          )}

          {canSendKunde && (
            <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <input
                type="checkbox"
                checked={sendKunde}
                onChange={(e) => setSendKunde(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                E-Mail mit PDF an Kunde senden
                <span className="block text-xs text-muted-foreground">{kundeEmail}</span>
              </span>
            </label>
          )}

          {sendKunde && fotoCount > 0 && (
            <label className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <input
                type="checkbox"
                checked={sendFotos}
                onChange={(e) => setSendFotos(e.target.checked)}
                className="h-4 w-4"
              />
              <span>
                {fotoCount} Foto{fotoCount === 1 ? '' : 's'} als Anhang mitsenden
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm({ sendKunde, sendFotos })}
            disabled={isPending}
          >
            <Send className="h-4 w-4" />
            {isPending ? 'Wird abgeschickt …' : sendKunde ? 'Abschicken & Mail' : 'Abschicken'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
