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

type Step = 'enter' | 'confirm';

export function SetupPage() {
  const [step, setStep] = useState<Step>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const setupMutation = useMutation({
    mutationFn: (pin: string) =>
      apiClient('/api/auth/setup', { method: 'POST', body: { pin } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
      navigate('/', { replace: true });
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Setup fehlgeschlagen');
      reset();
    },
  });

  function reset() {
    setStep('enter');
    setPin('');
    setConfirmPin('');
  }

  // Schritt 1 → 2 wenn PIN komplett
  useEffect(() => {
    if (step === 'enter' && pin.length === 4) {
      setStep('confirm');
    }
  }, [pin, step]);

  // Schritt 2 abgeschlossen → entweder Match → Submit, oder Reset mit Hinweis
  useEffect(() => {
    if (step !== 'confirm' || confirmPin.length !== 4) return;
    if (confirmPin === pin) {
      setErrorMsg(null);
      setupMutation.mutate(pin);
    } else {
      setErrorMsg('PINs stimmen nicht überein, bitte neu eingeben');
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmPin, step]);

  const currentValue = step === 'enter' ? pin : confirmPin;
  const setCurrent = step === 'enter' ? setPin : setConfirmPin;
  const description =
    step === 'enter' ? 'Bitte einen 4-stelligen PIN setzen' : 'PIN bitte wiederholen';

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
