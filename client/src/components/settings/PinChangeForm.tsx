import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PinPad } from '@/components/auth/PinPad';
import { ApiError } from '@/lib/api';
import { useCurrentUser } from '@/hooks/useAuthStatus';
import { useChangeOwnPin } from '@/hooks/useBenutzer';

type Step = 'old' | 'new' | 'confirm';

const STEP_LABELS: Record<Step, string> = {
  old: 'Aktueller PIN',
  new: 'Neuer PIN',
  confirm: 'Neuer PIN bestätigen',
};

export function PinChangeForm() {
  const [step, setStep] = useState<Step>('old');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const me = useCurrentUser();
  const change = useChangeOwnPin();

  const handleSuccess = () => {
    toast.success('PIN gesetzt');
    reset();
  };

  const handleError = (err: unknown) => {
    if (err instanceof ApiError) {
      setErrorMsg(translateError(err));
    } else {
      setErrorMsg('Fehler beim PIN-Wechsel');
    }
    reset();
  };

  const reset = () => {
    setStep('old');
    setOldPin('');
    setNewPin('');
    setConfirmPin('');
  };

  // Schrittwechsel: bei voller Eingabe weiter
  useEffect(() => {
    if (step === 'old' && oldPin.length === 4) setStep('new');
  }, [oldPin, step]);
  useEffect(() => {
    if (step === 'new' && newPin.length === 4) setStep('confirm');
  }, [newPin, step]);
  useEffect(() => {
    if (step === 'confirm' && confirmPin.length === 4) {
      if (confirmPin !== newPin) {
        setErrorMsg('PINs stimmen nicht überein');
        reset();
        return;
      }
      if (!me) {
        setErrorMsg('Nicht eingeloggt');
        return;
      }
      setErrorMsg(null);
      change.mutate(
        { id: me.id, oldPin, newPin },
        { onSuccess: handleSuccess, onError: handleError },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmPin, step]);

  const currentValue = step === 'old' ? oldPin : step === 'new' ? newPin : confirmPin;
  const setCurrent = step === 'old' ? setOldPin : step === 'new' ? setNewPin : setConfirmPin;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{STEP_LABELS[step]}</p>
      <PinPad value={currentValue} onChange={setCurrent} disabled={change.isPending} />
      {errorMsg && <p className="text-center text-sm text-destructive">{errorMsg}</p>}
      <div className="flex justify-center">
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={change.isPending}>
          Zurücksetzen
        </Button>
      </div>
    </div>
  );
}

function translateError(err: ApiError): string {
  if (err.code === 'OLD_PIN_INCORRECT') return 'Aktueller PIN ist falsch';
  if (err.code === 'INVALID_FORMAT') return 'PIN muss 4 Ziffern haben';
  return err.message;
}
