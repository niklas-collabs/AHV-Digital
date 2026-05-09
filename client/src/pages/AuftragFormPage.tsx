import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  Auftrag,
  AuftragMaterial,
  AuftragMitarbeiter,
  AuftragTyp,
} from '@ahv/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import {
  useAbschickenAuftrag,
  useAuftrag,
  useCreateAuftrag,
  useDeleteAuftrag,
  useUpdateAuftrag,
  type AuftragInput,
} from '@/hooks/useAuftraege';
import { AuftragTypSelector } from '@/components/auftrag/AuftragTypSelector';
import { KundeSelector } from '@/components/auftrag/KundeSelector';
import { MitarbeiterRows } from '@/components/auftrag/MitarbeiterRows';
import { MaterialRows } from '@/components/auftrag/MaterialRows';
import { PauschalenChips } from '@/components/auftrag/PauschalenChips';
import { SignaturePad } from '@/components/auftrag/SignaturePad';

interface FormState {
  typ: AuftragTyp;
  titel: string;
  datum: string;
  beschreibung: string;
  notiz_intern: string;
  kunde_id: string | null;
  objekt_adresse: string;
  mitarbeiter: AuftragMitarbeiter[];
  materialien: AuftragMaterial[];
  signature_data_url: string | null;
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const EMPTY_STATE: FormState = {
  typ: 'arbeitszettel',
  titel: '',
  datum: todayIso(),
  beschreibung: '',
  notiz_intern: '',
  kunde_id: null,
  objekt_adresse: '',
  mitarbeiter: [],
  materialien: [],
  signature_data_url: null,
};

function fromAuftrag(a: Auftrag): FormState {
  return {
    typ: a.typ,
    titel: a.titel,
    datum: a.datum,
    beschreibung: a.beschreibung,
    notiz_intern: a.notiz_intern,
    kunde_id: a.kunde_id,
    objekt_adresse: a.objekt_adresse ?? '',
    mitarbeiter: a.mitarbeiter,
    materialien: a.materialien,
    signature_data_url: a.signature_data_url,
  };
}

function toInput(state: FormState): AuftragInput {
  return {
    typ: state.typ,
    titel: state.titel.trim(),
    datum: state.datum,
    beschreibung: state.beschreibung,
    notiz_intern: state.notiz_intern,
    kunde_id: state.kunde_id,
    objekt_adresse: state.objekt_adresse.trim() || null,
    mitarbeiter: state.mitarbeiter,
    materialien: state.materialien,
    fotos: [],
    // Unterschrift nur bei Arbeitszettel mitsenden — sonst leeren
    signature_data_url: state.typ === 'arbeitszettel' ? state.signature_data_url : null,
  };
}

export function AuftragFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const { data: existing, isLoading } = useAuftrag(id ?? null);
  const create = useCreateAuftrag();
  const update = useUpdateAuftrag();
  const remove = useDeleteAuftrag();
  const abschicken = useAbschickenAuftrag();

  const [state, setState] = useState<FormState>(EMPTY_STATE);

  useEffect(() => {
    if (existing) setState(fromAuftrag(existing));
  }, [existing]);

  const isAbgeschickt = existing?.status === 'abgeschickt';
  const disabled =
    isAbgeschickt ||
    create.isPending ||
    update.isPending ||
    abschicken.isPending ||
    remove.isPending;

  if (isEdit && isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Lade …</p>
      </div>
    );
  }

  const validate = (): string | null => {
    if (!state.titel.trim()) return 'Titel ist Pflicht';
    if (!state.datum) return 'Datum ist Pflicht';
    if (!state.kunde_id) return 'Kunde ist Pflicht';
    return null;
  };

  const handleSave = async (afterAbschicken: boolean) => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const input = toInput(state);
    try {
      let saved: Auftrag;
      if (isEdit && existing) {
        saved = await update.mutateAsync({ id: existing.id, input });
      } else {
        saved = await create.mutateAsync(input);
      }
      toast.success(isEdit ? 'Gespeichert' : 'Auftrag angelegt');
      if (afterAbschicken) {
        await abschicken.mutateAsync(saved.id);
        toast.success('Abgeschickt');
      }
      navigate('/auftraege', { replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.message : 'Speichern fehlgeschlagen');
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    if (!confirm(`"${existing.titel || '(ohne Titel)'}" wirklich löschen?`)) return;
    remove.mutate(existing.id, {
      onSuccess: () => {
        toast.success('Gelöscht');
        navigate('/auftraege', { replace: true });
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Fehler'),
    });
  };

  const totalMitarbeiter = state.mitarbeiter.reduce(
    (sum, m) => sum + m.stundenpreis * m.stunden,
    0,
  );
  const totalMaterial = state.materialien.reduce((sum, m) => sum + m.preis_netto * m.menge, 0);
  const totalNetto = totalMitarbeiter + totalMaterial;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <Button asChild variant="ghost" size="icon" aria-label="Zurück">
            <Link to="/auftraege">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="flex-1 truncate text-lg font-semibold">
            {isEdit ? state.titel || '(ohne Titel)' : 'Neuer Auftrag'}
            {isAbgeschickt && (
              <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                abgeschickt
              </span>
            )}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-32">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Typ und Eckdaten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <AuftragTypSelector
              value={state.typ}
              onChange={(typ) => setState((s) => ({ ...s, typ }))}
              disabled={disabled}
            />
            <div className="space-y-1.5">
              <Label htmlFor="titel">Titel / Auftragsnummer</Label>
              <Input
                id="titel"
                value={state.titel}
                onChange={(e) => setState((s) => ({ ...s, titel: e.target.value }))}
                placeholder="z.B. Heizungswartung Musterstr. 5"
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="datum">Datum</Label>
              <Input
                id="datum"
                type="date"
                value={state.datum}
                onChange={(e) => setState((s) => ({ ...s, datum: e.target.value }))}
                disabled={disabled}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Kunde</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <KundeSelector
              value={state.kunde_id}
              onChange={(kunde_id) => setState((s) => ({ ...s, kunde_id }))}
              disabled={disabled}
            />
            <div className="space-y-1.5">
              <Label htmlFor="objekt">Einsatzort (falls abweichend)</Label>
              <Textarea
                id="objekt"
                rows={2}
                value={state.objekt_adresse}
                onChange={(e) => setState((s) => ({ ...s, objekt_adresse: e.target.value }))}
                placeholder="Strasse + Hausnr.&#10;PLZ Ort"
                disabled={disabled}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Beschreibung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={3}
              value={state.beschreibung}
              onChange={(e) => setState((s) => ({ ...s, beschreibung: e.target.value }))}
              placeholder="Was wurde gemacht?"
              disabled={disabled}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mitarbeiter</CardTitle>
          </CardHeader>
          <CardContent>
            <MitarbeiterRows
              rows={state.mitarbeiter}
              onChange={(mitarbeiter) => setState((s) => ({ ...s, mitarbeiter }))}
              disabled={disabled}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Material</CardTitle>
            <CardDescription className="text-xs">
              Pauschalen-Schnellauswahl unten — fuegt eine Material-Zeile hinzu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <PauschalenChips
              onAdd={(material) =>
                setState((s) => ({ ...s, materialien: [...s.materialien, material] }))
              }
              disabled={disabled}
            />
            <MaterialRows
              rows={state.materialien}
              onChange={(materialien) => setState((s) => ({ ...s, materialien }))}
              disabled={disabled}
            />
          </CardContent>
        </Card>

        {state.typ === 'arbeitszettel' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Unterschrift Kunde</CardTitle>
              <CardDescription className="text-xs">
                Mit Finger unterschreiben — erscheint im PDF unter „Unterschrift Kunde".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignaturePad
                value={state.signature_data_url}
                onChange={(signature_data_url) =>
                  setState((s) => ({ ...s, signature_data_url }))
                }
                disabled={disabled}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Interne Notiz</CardTitle>
            <CardDescription className="text-xs">
              Erscheint nicht im PDF.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={2}
              value={state.notiz_intern}
              onChange={(e) => setState((s) => ({ ...s, notiz_intern: e.target.value }))}
              disabled={disabled}
            />
          </CardContent>
        </Card>

        <div className="text-right text-sm text-muted-foreground">
          Summe netto: <span className="font-semibold text-foreground">{totalNetto.toFixed(2)} €</span>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {isEdit && !isAbgeschickt && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={disabled}
              aria-label="Löschen"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
          {isEdit && existing && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() =>
                window.open(`/api/auftraege/${existing.id}/pdf`, '_blank', 'noopener')
              }
              aria-label="PDF öffnen"
              title="PDF öffnen"
            >
              <FileDown className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={disabled}
            className="flex-1"
          >
            {isAbgeschickt ? 'Abgeschickt' : isEdit ? 'Speichern' : 'Als Entwurf speichern'}
          </Button>
          {!isAbgeschickt && (
            <Button
              type="button"
              onClick={() => handleSave(true)}
              disabled={disabled}
              className="flex-1"
            >
              <Send className="h-4 w-4" />
              Abschicken
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
