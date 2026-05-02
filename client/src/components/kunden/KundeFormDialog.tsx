import { useEffect } from 'react';
import { useForm, type FieldError, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { Kunde, KundeTyp } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { type KundeInput, useCreateKunde, useUpdateKunde } from '@/hooks/useKunden';
import { cn } from '@/lib/utils';

// Discriminated-Union analog Backend.
const baseFields = {
  email: z.string().email('Ungültige E-Mail').or(z.literal('')).optional(),
  telefon: z.string().optional(),
  strasse: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  notiz: z.string().optional(),
};

const kundeFormSchema = z.discriminatedUnion('typ', [
  z.object({
    typ: z.literal('privat'),
    vorname: z.string().min(1, 'Vorname ist Pflicht'),
    nachname: z.string().min(1, 'Nachname ist Pflicht'),
    firmenname: z.string().optional(),
    ...baseFields,
  }),
  z.object({
    typ: z.literal('firma'),
    firmenname: z.string().min(1, 'Firmenname ist Pflicht'),
    vorname: z.string().optional(),
    nachname: z.string().optional(),
    ...baseFields,
  }),
]);

type KundeFormValues = z.infer<typeof kundeFormSchema>;

interface KundeFormDialogProps {
  kunde: Kunde | null;
  onClose: () => void;
}

const EMPTY_PRIVAT: KundeFormValues = {
  typ: 'privat',
  vorname: '',
  nachname: '',
  firmenname: '',
  email: '',
  telefon: '',
  strasse: '',
  plz: '',
  ort: '',
  notiz: '',
};

function fromKunde(k: Kunde): KundeFormValues {
  if (k.typ === 'firma') {
    return {
      typ: 'firma',
      firmenname: k.firmenname ?? '',
      vorname: k.vorname ?? '',
      nachname: k.nachname ?? '',
      email: k.email ?? '',
      telefon: k.telefon ?? '',
      strasse: k.strasse ?? '',
      plz: k.plz ?? '',
      ort: k.ort ?? '',
      notiz: k.notiz ?? '',
    };
  }
  return {
    typ: 'privat',
    vorname: k.vorname ?? '',
    nachname: k.nachname ?? '',
    firmenname: k.firmenname ?? '',
    email: k.email ?? '',
    telefon: k.telefon ?? '',
    strasse: k.strasse ?? '',
    plz: k.plz ?? '',
    ort: k.ort ?? '',
    notiz: k.notiz ?? '',
  };
}

export function KundeFormDialog({ kunde, onClose }: KundeFormDialogProps) {
  const create = useCreateKunde();
  const update = useUpdateKunde();

  const form = useForm<KundeFormValues>({
    resolver: zodResolver(kundeFormSchema),
    defaultValues: kunde ? fromKunde(kunde) : EMPTY_PRIVAT,
  });

  const typ = form.watch('typ');

  // Wenn Typ wechselt, leere die jeweils irrelevanten Pflichtfelder nicht —
  // RHF behält die Werte, validiert aber nach dem neuen Schema.
  useEffect(() => {
    form.clearErrors();
  }, [typ, form]);

  const isPending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    const payload = values as KundeInput;
    const onSuccess = () => {
      toast.success(kunde ? 'Kunde aktualisiert' : 'Kunde angelegt');
      onClose();
    };
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : 'Fehler');

    if (kunde) {
      update.mutate({ id: kunde.id, input: payload }, { onSuccess, onError });
    } else {
      create.mutate(payload, { onSuccess, onError });
    }
  });

  const errors = form.formState.errors;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kunde ? 'Kunde bearbeiten' : 'Neuer Kunde'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <TypButton
              active={typ === 'privat'}
              onClick={() => form.setValue('typ', 'privat')}
              label="Privat"
            />
            <TypButton
              active={typ === 'firma'}
              onClick={() => form.setValue('typ', 'firma')}
              label="Firma"
            />
          </div>

          {typ === 'firma' && (
            <Field
              label="Firmenname"
              register={form.register('firmenname')}
              error={errors.firmenname as FieldError | undefined}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field
              label={typ === 'firma' ? 'Vorname (Ansprechpartner)' : 'Vorname'}
              register={form.register('vorname')}
              error={errors.vorname as FieldError | undefined}
            />
            <Field
              label={typ === 'firma' ? 'Nachname (Ansprechpartner)' : 'Nachname'}
              register={form.register('nachname')}
              error={errors.nachname as FieldError | undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="E-Mail"
              type="email"
              register={form.register('email')}
              error={errors.email as FieldError | undefined}
            />
            <Field
              label="Telefon"
              register={form.register('telefon')}
              error={errors.telefon as FieldError | undefined}
            />
          </div>

          <Field
            label="Strasse + Hausnr."
            register={form.register('strasse')}
            error={errors.strasse as FieldError | undefined}
          />
          <div className="grid grid-cols-3 gap-3">
            <Field
              label="PLZ"
              register={form.register('plz')}
              error={errors.plz as FieldError | undefined}
            />
            <div className="col-span-2">
              <Field
                label="Ort"
                register={form.register('ort')}
                error={errors.ort as FieldError | undefined}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notiz">Notiz (intern)</Label>
            <Textarea id="notiz" rows={2} {...form.register('notiz')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Speichert …' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface TypButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function TypButton({ active, onClick, label }: TypButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      className={cn('h-10 text-sm font-medium')}
    >
      {label}
    </Button>
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
