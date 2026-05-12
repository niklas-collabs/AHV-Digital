import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookmarkPlus, FileDown, MoreVertical, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  Auftrag,
  AuftragMaterial,
  AuftragMitarbeiter,
  AuftragTyp,
  ChecklistenItem,
  Teilleistung,
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
  usePushAuftragToLexoffice,
  useResyncLexofficeFooter,
  useUpdateAuftrag,
  type AuftragInput,
} from '@/hooks/useAuftraege';
import { useLexofficeStatus } from '@/hooks/useLexoffice';
import { AuftragTypSelector } from '@/components/auftrag/AuftragTypSelector';
import { KundeSelector } from '@/components/auftrag/KundeSelector';
import { MitarbeiterRows } from '@/components/auftrag/MitarbeiterRows';
import { MaterialRows } from '@/components/auftrag/MaterialRows';
import { PauschalenChips } from '@/components/auftrag/PauschalenChips';
import { SignaturePad } from '@/components/auftrag/SignaturePad';
import { FotoGrid } from '@/components/auftrag/FotoGrid';
import {
  AbschickenDialog,
  type AbschickenOptions,
} from '@/components/auftrag/AbschickenDialog';
import {
  VorlageSaveDialog,
  type VorlageDataPayload,
} from '@/components/auftrag/VorlageSaveDialog';
import { AuftragAktionenDialog } from '@/components/auftrag/AuftragAktionenDialog';
import { TeilleistungenSection } from '@/components/auftrag/TeilleistungenSection';
import { ChecklisteSection } from '@/components/auftrag/ChecklisteSection';
import { useAutosaveDraft } from '@/hooks/useAutosaveDraft';

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
  teilleistungen: Teilleistung[];
  checkliste: ChecklistenItem[] | null;
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
  teilleistungen: [],
  checkliste: null,
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
    teilleistungen: a.teilleistungen,
    checkliste: a.checkliste,
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
    teilleistungen: state.teilleistungen,
    checkliste: state.checkliste,
  };
}

/** Hilfsfunktion: liefert Save-Payload OHNE fotos-Feld, damit der
 *  PUT-Endpoint die Server-seitigen Fotos nicht überschreibt. */
function toUpdateInput(state: FormState): AuftragInput {
  const input = toInput(state);
  // Fotos werden über separate Endpoints verwaltet (siehe FotoGrid)
  delete (input as Partial<AuftragInput>).fotos;
  return input;
}

interface VorlageNavState {
  vorlage?: { typ: AuftragTyp; data: Partial<Auftrag> };
}

export function AuftragFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isEdit = !!id;

  const { data: existing, isLoading } = useAuftrag(id ?? null);
  const create = useCreateAuftrag();
  const update = useUpdateAuftrag();
  const remove = useDeleteAuftrag();
  const abschicken = useAbschickenAuftrag();
  const pushLexoffice = usePushAuftragToLexoffice();
  const resyncLexoffice = useResyncLexofficeFooter();
  const { data: lexofficeStatus } = useLexofficeStatus();

  const [state, setState] = useState<FormState>(EMPTY_STATE);
  const [showVorlageSaveDialog, setShowVorlageSaveDialog] = useState(false);
  const [showAktionenDialog, setShowAktionenDialog] = useState(false);
  const [autosaveOffered, setAutosaveOffered] = useState(false);

  useEffect(() => {
    if (existing) setState(fromAuftrag(existing));
  }, [existing]);

  // Autosave: speichert state in localStorage nach 1 s Inaktivität.
  // Bei abgeschickten Aufträgen NICHT aktiv, weil sie read-only sind.
  const draftId = isEdit ? id! : 'new';
  const isAbgeschicktForDraft = existing?.status === 'abgeschickt';
  const { lastSavedAt, clear: clearDraft, getStoredDraft } = useAutosaveDraft(
    draftId,
    state,
    { enabled: !isAbgeschicktForDraft },
  );

  // Beim ersten Render: gibt es einen lokalen Entwurf? Wenn ja und er ist
  // jünger als die Server-Version (oder es gibt keine), Übernahme anbieten.
  useEffect(() => {
    if (autosaveOffered) return;
    if (isEdit && isLoading) return;
    const stored = getStoredDraft();
    if (!stored) {
      setAutosaveOffered(true);
      return;
    }
    // Bei existing: nur übernehmen, wenn Entwurf NACH geaendert_am gespeichert
    if (existing && stored.savedAt <= existing.geaendert_am) {
      clearDraft();
      setAutosaveOffered(true);
      return;
    }
    const when = new Date(stored.savedAt).toLocaleString('de-DE');
    if (confirm(`Es gibt einen lokal gespeicherten Entwurf vom ${when}. Übernehmen?`)) {
      setState(stored.data);
    } else {
      clearDraft();
    }
    setAutosaveOffered(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, existing, autosaveOffered]);

  // Beim Anlegen aus einer Vorlage: location.state übernehmen
  useEffect(() => {
    if (isEdit) return;
    const navState = location.state as VorlageNavState | null;
    const vorlage = navState?.vorlage;
    if (!vorlage) return;
    const d = vorlage.data;
    // Teilleistungen aus der Vorlage mit frischen IDs, sonst kollidiert
    // jede aus der Vorlage erzeugte Instanz mit den anderen
    const teilleistungen = (d.teilleistungen ?? []).map((t) => ({
      ...t,
      id: crypto.randomUUID(),
    }));
    setState((s) => ({
      ...s,
      typ: vorlage.typ,
      titel: d.titel ?? s.titel,
      beschreibung: d.beschreibung ?? s.beschreibung,
      notiz_intern: d.notiz_intern ?? s.notiz_intern,
      mitarbeiter: d.mitarbeiter ?? s.mitarbeiter,
      materialien: d.materialien ?? s.materialien,
      teilleistungen,
    }));
    // location.state einmal verbrauchen, damit beim Reload nicht nochmal angewendet
    navigate(location.pathname, { replace: true, state: null });
  }, [isEdit, location.state, location.pathname, navigate]);

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

  const [showAbschickenDialog, setShowAbschickenDialog] = useState(false);

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    try {
      if (isEdit && existing) {
        await update.mutateAsync({ id: existing.id, input: toUpdateInput(state) });
      } else {
        await create.mutateAsync(toInput(state));
      }
      clearDraft();
      toast.success(isEdit ? 'Gespeichert' : 'Auftrag angelegt');
      navigate('/auftraege', { replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.message : 'Speichern fehlgeschlagen');
    }
  };

  const handleAbschicken = async (options: AbschickenOptions) => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    try {
      // Erst speichern (mit aktuellen Form-Werten), dann abschicken
      let saved: Auftrag;
      if (isEdit && existing) {
        saved = await update.mutateAsync({ id: existing.id, input: toUpdateInput(state) });
      } else {
        saved = await create.mutateAsync(toInput(state));
      }
      const result = await abschicken.mutateAsync({ id: saved.id, options });
      clearDraft();

      // Erfolgs-Meldung zusammensetzen: Mail-Hinweis + Lexoffice-Hinweis
      const parts: string[] = [];
      if (options.sendKunde && result._mailResult) {
        parts.push(`Mail an ${result._mailResult.recipients.length} Empfänger`);
      }
      if (result._lexofficeResult) {
        parts.push('als Rechnungs-Entwurf in Lexoffice angelegt');
      }
      toast.success(parts.length > 0 ? `Abgeschickt — ${parts.join(', ')}` : 'Abgeschickt');

      if (result._lexofficeWarning) {
        toast.warning('Lexoffice-Push fehlgeschlagen', {
          description: result._lexofficeWarning,
        });
      }

      setShowAbschickenDialog(false);
      navigate('/auftraege', { replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.message : 'Abschicken fehlgeschlagen');
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    if (!confirm(`"${existing.titel || '(ohne Titel)'}" wirklich löschen?`)) return;
    remove.mutate(existing.id, {
      onSuccess: () => {
        clearDraft();
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
  // Teilleistungen aufsummieren — Mitarbeiter UND Material je Teilleistung
  const totalTeilleistungen = state.teilleistungen.reduce((sum, t) => {
    const ma = t.mitarbeiter.reduce((s, m) => s + m.stundenpreis * m.stunden, 0);
    const mat = t.materialien.reduce((s, m) => s + m.preis_netto * m.menge, 0);
    return sum + ma + mat;
  }, 0);
  const totalNetto = totalMitarbeiter + totalMaterial + totalTeilleistungen;

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
          {isEdit && existing && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowAktionenDialog(true)}
              aria-label="Weitere Aktionen"
              title="Aktionen (Duplizieren, Konvertieren)"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          )}
        </div>
        {existing?.urspruenglicher_auftrag_id && (
          <div className="mx-auto max-w-3xl px-4 pb-2 text-xs text-muted-foreground">
            Aus{' '}
            <Link
              to={`/auftraege/${existing.urspruenglicher_auftrag_id}/edit`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              vorherigem Auftrag
            </Link>{' '}
            übernommen
          </div>
        )}
        {existing && (lexofficeStatus?.apiKeySet ?? false) && (
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 pb-2 text-xs">
            {existing.lexoffice_invoice_id ? (
              <>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                  In Lexoffice
                </span>
                <button
                  type="button"
                  onClick={() => {
                    resyncLexoffice.mutate(existing.id, {
                      onSuccess: () => toast.success('Lohnkosten-Footer aktualisiert'),
                      onError: (err) =>
                        toast.error(err instanceof ApiError ? err.message : 'Fehler'),
                    });
                  }}
                  disabled={resyncLexoffice.isPending}
                  className="text-primary underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {resyncLexoffice.isPending ? 'Synchronisiere …' : 'Footer neu rechnen'}
                </button>
              </>
            ) : isAbgeschickt ? (
              <button
                type="button"
                onClick={() => {
                  pushLexoffice.mutate(existing.id, {
                    onSuccess: () => toast.success('Als Rechnungs-Entwurf in Lexoffice angelegt'),
                    onError: (err) =>
                      toast.error(err instanceof ApiError ? err.message : 'Fehler'),
                  });
                }}
                disabled={pushLexoffice.isPending}
                className="rounded-full border border-border bg-background px-3 py-1 hover:border-primary/50 disabled:opacity-50"
              >
                {pushLexoffice.isPending ? 'Wird gesendet …' : 'Jetzt zu Lexoffice senden'}
              </button>
            ) : null}
          </div>
        )}
        {!isAbgeschickt && lastSavedAt && (
          <div className="mx-auto max-w-3xl px-4 pb-2 text-[10px] text-muted-foreground">
            Lokal gespeichert{' '}
            {new Date(lastSavedAt).toLocaleTimeString('de-DE', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
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
              onSelectKunde={(k) =>
                setState((s) => {
                  // Einsatzort als Default vorschlagen, wenn das Feld noch
                  // leer ist — der Nutzer kann es überschreiben.
                  if (s.objekt_adresse.trim()) return s;
                  const lines: string[] = [];
                  if (k.strasse) lines.push(k.strasse);
                  const ortLine = [k.plz, k.ort].filter(Boolean).join(' ');
                  if (ortLine) lines.push(ortLine);
                  return { ...s, objekt_adresse: lines.join('\n') };
                })
              }
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

        {state.typ !== 'lieferschein' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Checkliste</CardTitle>
              <CardDescription className="text-xs">
                Optional. Aus einer Vorlage laden oder eigene Punkte ergänzen.
                Abgehakte Punkte erscheinen im PDF.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChecklisteSection
                value={state.checkliste}
                onChange={(checkliste) => setState((s) => ({ ...s, checkliste }))}
                auftragTyp={state.typ}
                disabled={disabled}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Teilleistungen</CardTitle>
            <CardDescription className="text-xs">
              Optional. Bei Etappen-Aufträgen pro Etappe eine Teilleistung mit
              eigenem Datum, Mitarbeitern und Material. Im PDF werden alle
              aufsummiert.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TeilleistungenSection
              rows={state.teilleistungen}
              onChange={(teilleistungen) => setState((s) => ({ ...s, teilleistungen }))}
              disabled={disabled}
            />
          </CardContent>
        </Card>

        {isEdit && existing && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Fotos</CardTitle>
              <CardDescription className="text-xs">
                Mit der Kamera aufnehmen oder aus der Galerie wählen. Bilder werden
                serverseitig auf max. 1600 px komprimiert (JPEG). Maximal 20 Fotos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FotoGrid
                auftragId={existing.id}
                fotos={existing.fotos}
                disabled={isAbgeschickt}
              />
            </CardContent>
          </Card>
        )}

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

      <AbschickenDialog
        open={showAbschickenDialog}
        onClose={() => setShowAbschickenDialog(false)}
        onConfirm={handleAbschicken}
        kundeEmail={existing?.kunde_snapshot.email?.trim() || null}
        fotoCount={existing?.fotos.length ?? 0}
        isPending={create.isPending || update.isPending || abschicken.isPending}
      />

      <VorlageSaveDialog
        open={showVorlageSaveDialog}
        onClose={() => setShowVorlageSaveDialog(false)}
        typ={state.typ}
        defaultName={state.titel.trim()}
        data={
          {
            titel: state.titel.trim(),
            beschreibung: state.beschreibung,
            notiz_intern: state.notiz_intern,
            mitarbeiter: state.mitarbeiter,
            materialien: state.materialien,
            teilleistungen: state.teilleistungen,
          } satisfies VorlageDataPayload
        }
      />

      {existing && (
        <AuftragAktionenDialog
          open={showAktionenDialog}
          onClose={() => setShowAktionenDialog(false)}
          auftragId={existing.id}
          currentTyp={state.typ}
        />
      )}

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
          {!isAbgeschickt && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowVorlageSaveDialog(true)}
              disabled={disabled}
              aria-label="Als Vorlage speichern"
              title="Als Vorlage speichern"
            >
              <BookmarkPlus className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleSave}
            disabled={disabled}
            className="flex-1"
          >
            {isAbgeschickt ? 'Abgeschickt' : isEdit ? 'Speichern' : 'Als Entwurf speichern'}
          </Button>
          {!isAbgeschickt && (
            <Button
              type="button"
              onClick={() => setShowAbschickenDialog(true)}
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
