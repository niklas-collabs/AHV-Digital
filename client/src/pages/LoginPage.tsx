import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Wrench } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PinPad } from '@/components/auth/PinPad';
import { ApiError, apiClient } from '@/lib/api';
import { AUTH_STATUS_QUERY_KEY, useAuthStatus } from '@/hooks/useAuthStatus';

/**
 * Zwei-Schritt-Login (Identity Lite, Option A):
 *  1. Benutzer auswählen
 *  2. PIN eintippen — Auto-Submit nach 4 Ziffern
 *
 * Vorteil gegenüber „nur PIN": gleicher PIN bei beiden Inhabern erlaubt,
 * der Mensch wählt explizit „ich bin Niklas" oder „ich bin Tobi".
 */
export function LoginPage() {
  const { data: status } = useAuthStatus();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: (params: { userId: string; pin: string }) =>
      apiClient('/api/auth/login', { method: 'POST', body: params }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
      navigate('/', { replace: true });
    },
    onError: (err: unknown) => {
      setErrorMsg(formatLoginError(err));
      setPin('');
    },
  });

  // Auto-Single-Select: wenn nur ein Benutzer existiert, direkt auswählen
  useEffect(() => {
    if (!selectedUserId && status?.benutzer.length === 1) {
      setSelectedUserId(status.benutzer[0]!.id);
    }
  }, [status?.benutzer, selectedUserId]);

  // Auto-submit, sobald 4 Ziffern eingegeben sind
  useEffect(() => {
    if (pin.length === 4 && selectedUserId && !loginMutation.isPending) {
      setErrorMsg(null);
      loginMutation.mutate({ userId: selectedUserId, pin });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const isLocked =
    loginMutation.error instanceof ApiError && loginMutation.error.code === 'LOCKED';

  const benutzer = status?.benutzer ?? [];
  const selectedUser = benutzer.find((b) => b.id === selectedUserId);

  // Schritt 1: Benutzer-Auswahl
  if (!selectedUserId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Wrench className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>AHV Arbeitszettel</CardTitle>
            <CardDescription>Wer bist du?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {benutzer.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Lädt …
              </p>
            ) : (
              benutzer.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedUserId(b.id)}
                  className="flex w-full items-center gap-3 rounded-md border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-base font-medium">{b.name}</span>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Schritt 2: PIN-Pad
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <User className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{selectedUser?.name ?? '—'}</CardTitle>
          <CardDescription>PIN eingeben</CardDescription>
        </CardHeader>
        <CardContent>
          <PinPad value={pin} onChange={setPin} disabled={loginMutation.isPending || isLocked} />
          {errorMsg && (
            <p className="mt-4 text-center text-sm text-destructive">{errorMsg}</p>
          )}
          {benutzer.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-4 w-full"
              onClick={() => {
                setSelectedUserId(null);
                setPin('');
                setErrorMsg(null);
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              Anderer Benutzer
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatLoginError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Verbindung zum Server fehlgeschlagen';
  }
  if (err.code === 'LOCKED') {
    const until = err.data.lockedUntil as string | undefined;
    if (until) {
      const time = new Date(until).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `Zu viele Fehlversuche — gesperrt bis ${time} Uhr`;
    }
    return 'Zu viele Fehlversuche — gesperrt';
  }
  if (err.code === 'INVALID_PIN') {
    const left = err.data.attemptsLeft;
    if (typeof left === 'number' && left <= 2) {
      return `Falscher PIN — noch ${left} ${left === 1 ? 'Versuch' : 'Versuche'}`;
    }
    return 'Falscher PIN';
  }
  return err.message;
}
