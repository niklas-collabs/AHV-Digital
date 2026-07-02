import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Download,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  User,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { useAnlage } from '@/hooks/useAnlagen';
import { useWartungsplan, useWartungsHistorie } from '@/hooks/useWartung';
import { useCreateAuftrag } from '@/hooks/useAuftraege';
import { AnlageDialog } from '@/components/anlage/AnlageDialog';

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Detail-Seite einer Anlage — sowohl /anlagen/:id (aus der Liste) als
 * auch /qr/:id (aus dem QR-Scan) zeigen das hier. Funktional identisch.
 */
export function AnlageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const { data: anlage, isLoading } = useAnlage(id ?? null);
  const { data: wartungsplan } = useWartungsplan(anlage?.wartungsplan_id ?? null);
  const { data: historie } = useWartungsHistorie(anlage?.wartungsplan_id ?? null);
  const create = useCreateAuftrag();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!anlage) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Anlage nicht gefunden. Möglicherweise wurde der QR-Code zu einer
          gelöschten Anlage ausgedruckt.
        </p>
      </div>
    );
  }

  const handleNeuerAuftrag = () => {
    const today = new Date().toISOString().slice(0, 10);
    create.mutate(
      {
        typ: 'arbeitszettel',
        titel: `${anlage.anlage} – Wartung`,
        datum: today,
        beschreibung: '',
        notiz_intern: '',
        kunde_id: anlage.kunde_id,
        objekt_adresse: anlage.standort ?? null,
        mitarbeiter: [],
        materialien: [],
        fotos: [],
        signature_data_url: null,
        teilleistungen: [],
      },
      {
        onSuccess: (a) => {
          toast.success('Arbeitszettel angelegt');
          navigate(`/auftraege/${a.id}/edit`);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Fehler'),
      },
    );
  };

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <Button asChild variant="ghost" size="icon" aria-label="Zurück">
            <Link to="/wartung">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="flex-1 truncate text-lg font-semibold">{anlage.anlage}</h1>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setEditing(true)}
            aria-label="Bearbeiten"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Anlage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {anlage.kunde_id ? (
              <Link
                to={`/kunden/${anlage.kunde_id}`}
                className="flex items-center gap-2 underline-offset-2 hover:underline"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                {anlage.kunde_name}
              </Link>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4" />
                {anlage.kunde_name || '—'}
              </div>
            )}
            {anlage.standort && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="whitespace-pre-line">{anlage.standort}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">QR-Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <img
              src={`/api/anlagen/${anlage.id}/qr.png`}
              alt="QR-Code"
              className="mx-auto block max-w-[200px] border border-border bg-white p-2"
            />
            <a
              href={`/api/anlagen/${anlage.id}/qr.png`}
              download={`qr-${anlage.anlage.slice(0, 30).replace(/\s+/g, '_')}.png`}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              <Download className="h-4 w-4" />
              QR-Code herunterladen
            </a>
            <p className="text-xs text-muted-foreground">
              Drucken und an die Anlage kleben. Scan landet wieder hier.
            </p>
          </CardContent>
        </Card>

        <Button
          type="button"
          className="w-full"
          size="lg"
          onClick={handleNeuerAuftrag}
          disabled={create.isPending}
        >
          <Plus className="h-5 w-5" />
          Neuer Arbeitszettel für diese Anlage
        </Button>

        {wartungsplan && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Wartungsplan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Intervall</span>
                <span>{wartungsplan.intervall_monate} Monate</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Letzte Wartung</span>
                <span>
                  {wartungsplan.letzte_wartung
                    ? formatDate(wartungsplan.letzte_wartung)
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nächste Wartung</span>
                <span className="font-semibold">
                  {formatDate(wartungsplan.naechste_wartung)}
                </span>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/wartung">Zum Wartungs-Tab</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {historie && historie.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Wartungs-Historie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border rounded-md border border-border">
                {historie.map((h) => (
                  <li key={h.id} className="p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{formatDate(h.durchgefuehrt_am)}</span>
                      {h.auftrag_id && (
                        <Link
                          to={`/auftraege/${h.auftrag_id}/edit`}
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Auftrag
                        </Link>
                      )}
                    </div>
                    {h.notiz && (
                      <p className="mt-1 text-xs text-muted-foreground">{h.notiz}</p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>

      {editing && <AnlageDialog anlage={anlage} onClose={() => setEditing(false)} />}
    </>
  );
}
