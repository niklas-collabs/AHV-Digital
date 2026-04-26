import { useEffect } from 'react';
import { useForm, type FieldError, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { FirmaConfig } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useSetConfig } from '@/hooks/useConfig';

const firmaSchema = z.object({
  name: z.string().min(1, 'Firmenname ist Pflicht'),
  strasse: z.string(),
  plz: z.string(),
  ort: z.string(),
  telefon: z.string(),
  email: z.string().email('Ungueltige E-Mail').or(z.literal('')),
  ust_nr: z.string(),
  iban: z.string(),
  bic: z.string(),
  bank: z.string(),
});

type FirmaFormValues = z.infer<typeof firmaSchema>;

const EMPTY: FirmaFormValues = {
  name: '',
  strasse: '',
  plz: '',
  ort: '',
  telefon: '',
  email: '',
  ust_nr: '',
  iban: '',
  bic: '',
  bank: '',
};

interface FirmaFormProps {
  initial: FirmaConfig | null;
}

export function FirmaForm({ initial }: FirmaFormProps) {
  const form = useForm<FirmaFormValues>({
    resolver: zodResolver(firmaSchema),
    defaultValues: initial ?? EMPTY,
  });

  // Wenn initial sich ändert (Daten kommen aus Query nach), Form neu setzen
  useEffect(() => {
    form.reset(initial ?? EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const setFirma = useSetConfig('firma');

  const onSubmit = form.handleSubmit((values) => {
    setFirma.mutate(values, {
      onSuccess: () => toast.success('Firmendaten gespeichert'),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen'),
    });
  });

  const errors = form.formState.errors;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Firmenname" register={form.register('name')} error={errors.name} />
      <Field label="Strasse + Hausnr." register={form.register('strasse')} error={errors.strasse} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="PLZ" register={form.register('plz')} error={errors.plz} />
        <div className="col-span-2">
          <Field label="Ort" register={form.register('ort')} error={errors.ort} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefon" register={form.register('telefon')} error={errors.telefon} />
        <Field
          label="E-Mail"
          type="email"
          register={form.register('email')}
          error={errors.email}
        />
      </div>
      <Field label="USt-Nr." register={form.register('ust_nr')} error={errors.ust_nr} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="IBAN" register={form.register('iban')} error={errors.iban} />
        <Field label="BIC" register={form.register('bic')} error={errors.bic} />
      </div>
      <Field label="Bank" register={form.register('bank')} error={errors.bank} />
      <Button type="submit" disabled={setFirma.isPending} className="w-full sm:w-auto">
        {setFirma.isPending ? 'Speichert …' : 'Speichern'}
      </Button>
    </form>
  );
}

interface FieldProps {
  label: string;
  type?: string;
  register: UseFormRegisterReturn;
  error?: FieldError;
}

function Field({ label, type = 'text', register, error }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={register.name}>{label}</Label>
      <Input id={register.name} type={type} {...register} />
      {error && <p className="text-xs text-destructive">{error.message}</p>}
    </div>
  );
}
