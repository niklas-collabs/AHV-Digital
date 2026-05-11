import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  FileDown,
  FileText,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  User,
} from 'lucide-react';
import { useState } from 'react';
import type { Auftrag, AuftragTyp, Kunde } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useKunde } from '@/hooks/useKunden';
import { useAuftraege } from '@/hooks/useAuftraege';
import { KundeFormDialog } from '@/components/kunden/KundeFormDialog';

const TYP_ICON: Record<AuftragTyp, typeof FileText> = {
  arbeitszettel: ClipboardList,
  angebot: FileText,
  lieferschein: Package,
};

const TYP_LABEL: Record<AuftragTyp, string> = {
  arbeitszettel: 'Arbeitszettel',
  angebot: 'Angebot',
  lieferschein: 'Lieferschein',
};

export function KundeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const { data: kunde, isLoading: kundeLoading } = useKunde(id ?? null);
  const { data: auftraege, isLoading: auftraegeLoading } = useAuftraege({
    kunde_id: id,
  });

  if (kundeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Lädt …</p>
      </div>
    );
  }

  if (!kunde) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Kunde nicht gefunden.</p>
      </div>
    );
  }

  const list = auftraege ?? [];
  const summe = list.reduce((s, a) => s + computeAuftragNetto(a), 0);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <Button asChild variant="ghost" size="icon" aria-label="Zurück">
            <Link to="/kunden">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="flex-1 truncate text-lg font-semibold">{displayName(kunde)}</h1>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setEditing(true)}
            aria-label="Kunde bearbeiten"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {kunde.typ === 'firma' ? (
                <Building2 className="h-5 w-5 text-muted-foreground" />
              ) : (
                <User className="h-5 w-5 text-muted-foreground" />
              )}
              Stammdaten
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>{displayName(kunde)}</div>
            {kunde.strasse && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div>{kunde.strasse}</div>
                  <div>{[kunde.plz, kunde.ort].filter(Boolean).join(' ')}</div>
                </div>
              </div>
            )}
            {kunde.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <a href={`mailto:${kunde.email}`} className="underline-offset-2 hover:underline">
                  {kunde.email}
                </a>
              </div>
            )}
            {kunde.telefon && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />
                <a href={`tel:${kunde.telefon}`} className="underline-offset-2 hover:underline">
                  {kunde.telefon}
                </a>
              </div>
            )}
            {kunde.notiz && (
              <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                {kunde.notiz}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Auftrags-Historie</span>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  navigate('/auftraege/neu', {
                    state: { vorlage: undefined, kundeId: kunde.id },
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Neuer Auftrag
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auftraegeLoading ? (
              <p className="text-sm text-muted-foreground">Lade …</p>
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Aufträge für diesen Kunden.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {list.map((a) => {
                    const Icon = TYP_ICON[a.typ];
                    const netto = computeAuftragNetto(a);
                    return (
                      <li key={a.id} className="flex items-center gap-3 p-3">
                        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <Link
                          to={`/auftraege/${a.id}/edit`}
                          className="min-w-0 flex-1"
                        >
                          <p className="truncate text-sm font-medium">
                            {a.titel || '(ohne Titel)'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {a.datum} · {TYP_LABEL[a.typ]} ·{' '}
                            <span
                              className={
                                a.status === 'abgeschickt'
                                  ? 'text-primary'
                                  : 'text-muted-foreground'
                              }
                            >
                              {a.status === 'abgeschickt' ? 'abgeschickt' : 'Entwurf'}
                            </span>
                          </p>
                        </Link>
                        <div className="text-right text-xs text-muted-foreground">
                          {netto.toFixed(2)} €
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            window.open(`/api/auftraege/${a.id}/pdf`, '_blank', 'noopener')
                          }
                          aria-label="PDF"
                          title="PDF öffnen"
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 flex justify-between text-sm text-muted-foreground">
                  <span>{list.length} Aufträge gesamt</span>
                  <span>
                    Summe netto:{' '}
                    <span className="font-semibold text-foreground">{summe.toFixed(2)} €</span>
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {editing && <KundeFormDialog kunde={kunde} onClose={() => setEditing(false)} />}
    </>
  );
}

function displayName(k: Kunde): string {
  if (k.typ === 'firma') {
    const ans =
      k.vorname || k.nachname
        ? ` (${[k.vorname, k.nachname].filter(Boolean).join(' ')})`
        : '';
    return `${k.firmenname ?? '—'}${ans}`;
  }
  return [k.vorname, k.nachname].filter(Boolean).join(' ');
}

function computeAuftragNetto(a: Auftrag): number {
  const ma = a.mitarbeiter.reduce((s, m) => s + m.stundenpreis * m.stunden, 0);
  const mat = a.materialien.reduce((s, m) => s + m.preis_netto * m.menge, 0);
  const tl = a.teilleistungen.reduce((s, t) => {
    return (
      s +
      t.mitarbeiter.reduce((mm, m) => mm + m.stundenpreis * m.stunden, 0) +
      t.materialien.reduce((mm, m) => mm + m.preis_netto * m.menge, 0)
    );
  }, 0);
  return ma + mat + tl;
}
