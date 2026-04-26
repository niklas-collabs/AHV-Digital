import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PinPad } from '@/components/auth/PinPad';
import { ApiError, apiClient } from '@/lib/api';
import { AUTH_STATUS_QUERY_KEY } from '@/hooks/useAuthStatus';

export function LoginPage() {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: (pin: string) => apiClient('/api/auth/login', { method: 'POST', body: { pin } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
      navigate('/', { replace: true });
    },
    onError: (err: unknown) => {
      setErrorMsg(formatLoginError(err));
      setPin('');
    },
  });

  // Auto-submit, sobald 4 Ziffern eingegeben sind
  useEffect(() => {
    if (pin.length === 4 && !loginMutation.isPending) {
      setErrorMsg(null);
      loginMutation.mutate(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const isLocked =
    loginMutation.error instanceof ApiError && loginMutation.error.code === 'LOCKED';

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Wrench className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>AHV Arbeitszettel</CardTitle>
          <CardDescription>PIN eingeben</CardDescription>
        </CardHeader>
        <CardContent>
          <PinPad value={pin} onChange={setPin} disabled={loginMutation.isPending || isLocked} />
          {errorMsg && (
            <p className="mt-4 text-center text-sm text-destructive">{errorMsg}</p>
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
  if (err.code === 'NEEDS_SETUP') {
    return 'Es ist noch kein PIN gesetzt';
  }
  return err.message;
}
