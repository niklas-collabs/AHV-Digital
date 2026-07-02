import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Roter Bestätigen-Button für Lösch-Aktionen */
  destructive?: boolean;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

let notifyHost: ((pending: PendingConfirm) => void) | null = null;

/**
 * Promise-basierter Ersatz für window.confirm() — zeigt einen App-Dialog
 * statt des nativen Browser-Popups. Der <ConfirmDialogHost /> muss dafür
 * einmal in App.tsx gemountet sein; falls nicht (z.B. in Tests), fällt die
 * Funktion auf window.confirm zurück.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!notifyHost) {
    const text = [options.title, options.description].filter(Boolean).join('\n');
    return Promise.resolve(window.confirm(text));
  }
  return new Promise<boolean>((resolve) => {
    notifyHost?.({ options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    notifyHost = (next) => {
      setPending((prev) => {
        // Falls schon ein Confirm offen ist: das alte als "abgebrochen" auflösen
        prev?.resolve(false);
        return next;
      });
    };
    return () => {
      notifyHost = null;
    };
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{pending?.options.title}</DialogTitle>
          {pending?.options.description ? (
            <DialogDescription>{pending.options.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {pending?.options.cancelLabel ?? 'Abbrechen'}
          </Button>
          <Button
            type="button"
            variant={pending?.options.destructive ? 'destructive' : 'default'}
            onClick={() => close(true)}
          >
            {pending?.options.confirmLabel ?? 'OK'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
