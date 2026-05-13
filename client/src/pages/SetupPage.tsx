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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PinPad } from '@/components/auth/PinPad';
import { ApiError, apiClient } from '@/lib/api';
import { AUTH_STATUS_QUERY_KEY } from '@/hooks/useAuthStatus';

type Step = 'name' | 'pin' | 'confirm';

/**
 * Erstmaliger Setup: Name + 4-stelliger PIN (2× zur Bestätigung).
 * Wird vom Server-Endpoint nur akzeptiert wenn noch KEIN Benutzer existiert.
 * Weitere Benutzer werden später über die Settings → Benutzer angelegt.
 */
export function SetupPage() {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const setupMutation = useMutation({
    mutationFn: (input: { name: string; pin: string }) =>
      apiClient('/api/auth/setup', { method: 'POST', body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
      navigate('/', { replace: true });
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Setup fehlgeschlagen');
      setStep('pin');
      setPin('');
      setConfirmPin('');
    },
  });

  useEffect(() => {
    if (step === 'pin' && pin.length === 4) {
      setStep('confirm');
    }
  }, [pin, step]);

  useEffect(() => {
    if (step !== 'confirm' || confirmPin.length !== 4) return;
    if (confirmPin === pin) {
      setErrorMsg(null);
      setupMutation.mutate({ name: name.trim(), pin });
    } else {
      setErrorMsg('PINs stimmen nicht überein, bitte neu eingeben');
      setPin('');
      setConfirmPin('');
      setStep('pin');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmPin, step]);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Name ist Pflicht');
      return;
    }
    setErrorMsg(null);
    setStep('pin');
  };

  if (step === 'name') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Wrench className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Erste Einrichtung</CardTitle>
            <CardDescription>Wie ist dein Name?</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleNameSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="setup-name">Dein Name</Label>
                <Input
                  id="setup-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Niklas"
                  autoFocus
                />
              </div>
              {errorMsg && (
                <p className="text-center text-sm text-destructive">{errorMsg}</p>
              )}
              <Button type="submit" className="w-full">
                Weiter
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Erscheint im Login-Bildschirm und im Aktionsprotokoll.
                Weitere Benutzer kannst du später in den Einstellungen anlegen.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentValue = step === 'pin' ? pin : confirmPin;
  const setCurrent = step === 'pin' ? setPin : setConfirmPin;
  const description = step === 'pin' ? `Hallo ${name}! 4-stelligen PIN setzen` : 'PIN wiederholen';

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Wrench className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Erste Einrichtung</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <PinPad value={currentValue} onChange={setCurrent} disabled={setupMutation.isPending} />
          {errorMsg && (
            <p className="mt-4 text-center text-sm text-destructive">{errorMsg}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
