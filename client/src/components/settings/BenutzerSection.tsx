import { useState } from 'react';
import { Pencil, Plus, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import type { Benutzer } from '@ahv/shared';
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
import { ApiError } from '@/lib/api';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useCurrentUser } from '@/hooks/useAuthStatus';
import {
  useBenutzer,
  useCreateBenutzer,
  useDeleteBenutzer,
  useRenameBenutzer,
} from '@/hooks/useBenutzer';

export function BenutzerSection() {
  const { data, isLoading } = useBenutzer();
  const me = useCurrentUser();
  const remove = useDeleteBenutzer();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Benutzer | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground">Lädt …</p>;
  const list = data ?? [];

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-md border border-border">
        {list.map((b) => {
          const isMe = b.id === me?.id;
          return (
            <li key={b.id} className="flex items-center gap-2 p-3">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {b.name}
                  {isMe && (
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                      (du)
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Seit {formatDate(b.erstellt_am)}
                  {b.lockedUntil && ` · gesperrt bis ${formatTime(b.lockedUntil)}`}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setEditing(b)}
                aria-label="Umbenennen"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={remove.isPending || list.length <= 1}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Benutzer entfernen?',
                    description: `„${b.name}“ wird entfernt.${
                      isMe ? ' Du wirst danach ausgeloggt.' : ''
                    }`,
                    confirmLabel: 'Entfernen',
                    destructive: true,
                  });
                  if (!ok) return;
                  remove.mutate(b.id, {
                    onError: (err) =>
                      toast.error(err instanceof ApiError ? err.message : 'Fehler'),
                  });
                }}
                aria-label="Entfernen"
                title={list.length <= 1 ? 'Der letzte Benutzer kann nicht entfernt werden' : 'Entfernen'}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
        <Plus className="h-4 w-4" />
        Benutzer hinzufügen
      </Button>

      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      {editing && <RenameDialog benutzer={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateBenutzer();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name ist Pflicht');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      toast.error('PIN muss genau 4 Ziffern haben');
      return;
    }
    if (pin !== confirmPin) {
      toast.error('PINs stimmen nicht überein');
      return;
    }
    create.mutate(
      { name: name.trim(), pin },
      {
        onSuccess: () => {
          toast.success('Benutzer angelegt');
          onClose();
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Fehler'),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuer Benutzer</DialogTitle>
          <DialogDescription>
            Gleicher PIN wie bei dir ist erlaubt — beim Login wird vorher die Person gewählt.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-user-name">Name</Label>
            <Input
              id="new-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Tobi"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-user-pin">PIN (4 Ziffern)</Label>
              <Input
                id="new-user-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-pin-confirm">PIN wiederholen</Label>
              <Input
                id="new-user-pin-confirm"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Legt an …' : 'Anlegen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ benutzer, onClose }: { benutzer: Benutzer; onClose: () => void }) {
  const rename = useRenameBenutzer();
  const [name, setName] = useState(benutzer.name);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name ist Pflicht');
      return;
    }
    rename.mutate(
      { id: benutzer.id, name: name.trim() },
      {
        onSuccess: () => {
          toast.success('Umbenannt');
          onClose();
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Fehler'),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !rename.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Benutzer umbenennen</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rename">Name</Label>
            <Input
              id="rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={rename.isPending}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={rename.isPending}>
              {rename.isPending ? 'Speichert …' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
