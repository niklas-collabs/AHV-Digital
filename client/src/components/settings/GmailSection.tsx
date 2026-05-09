import { useEffect, useState } from 'react';
import { CheckCircle2, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { GmailConfig } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useConfig, useDeleteConfig } from '@/hooks/useConfig';
import { useMailStatus, useSetGmailConfig, useTestMail } from '@/hooks/useGmail';

export function GmailSection() {
  const { data: config, isLoading } = useConfig();
  const { data: status } = useMailStatus();
  const setGmail = useSetGmailConfig();
  const deleteGmail = useDeleteConfig('gmail');
  const testMail = useTestMail();

  const [user, setUser] = useState('');
  const [appPasswort, setAppPasswort] = useState('');

  // Bei vorhandener Config: User vorbelegen, Passwort leer (wird nicht
  // zum Client geliefert; Anzeige nur "gesetzt").
  useEffect(() => {
    if (config?.gmail?.user) setUser(config.gmail.user);
  }, [config?.gmail?.user]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Lädt …</p>;
  }

  const gmailSet = status?.gmailSet ?? false;
  const firmaEmailSet = status?.firmaEmailSet ?? false;

  const handleSave = () => {
    if (!user.trim() || !appPasswort.trim()) {
      toast.error('Bitte E-Mail-Adresse und App-Passwort ausfüllen');
      return;
    }
    const value: GmailConfig = { user: user.trim(), app_passwort: appPasswort };
    setGmail.mutate(value, {
      onSuccess: () => {
        toast.success('Gmail-Konfiguration gespeichert');
        setAppPasswort('');
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen'),
    });
  };

  const handleDelete = () => {
    if (!confirm('Gmail-Konfiguration wirklich entfernen?')) return;
    deleteGmail.mutate(undefined, {
      onSuccess: () => {
        toast.success('Gmail-Konfiguration entfernt');
        setUser('');
        setAppPasswort('');
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Entfernen fehlgeschlagen'),
    });
  };

  const handleTest = () => {
    testMail.mutate(undefined, {
      onSuccess: (result) => toast.success(`Test-Mail an ${result.to} gesendet`),
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Test-Mail fehlgeschlagen'),
    });
  };

  return (
    <div className="space-y-3">
      {gmailSet && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Gmail aktiv ({config?.gmail?.user ?? '—'})
        </div>
      )}

      {!firmaEmailSet && gmailSet && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Firma-E-Mail unter „Firma" eintragen — sie wird beim Abschicken als Empfänger
          und Antwort-Adresse genutzt.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="gmail-user">Gmail-Adresse</Label>
        <Input
          id="gmail-user"
          type="email"
          autoComplete="off"
          placeholder="dein.account@gmail.com"
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gmail-pass">App-Passwort</Label>
        <Input
          id="gmail-pass"
          type="password"
          autoComplete="new-password"
          placeholder={gmailSet ? '••••••••••••••••' : 'xxxx xxxx xxxx xxxx'}
          value={appPasswort}
          onChange={(e) => setAppPasswort(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          <strong>Nicht</strong> dein normales Gmail-Passwort. App-Passwort generieren in
          Google-Account → Sicherheit → 2-Faktor-Auth → App-Passwörter.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={setGmail.isPending}>
          {setGmail.isPending ? 'Speichert …' : 'Speichern'}
        </Button>
        {gmailSet && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testMail.isPending}
            >
              <Send className="h-4 w-4" />
              {testMail.isPending ? 'Sendet …' : 'Test-Mail senden'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleteGmail.isPending}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
              Entfernen
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
