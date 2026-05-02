import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useConfig } from '@/hooks/useConfig';
import { FirmaForm } from '@/components/settings/FirmaForm';
import { ThemeSection } from '@/components/settings/ThemeSection';
import { LogoUploadSection } from '@/components/settings/LogoUploadSection';
import { PinChangeForm } from '@/components/settings/PinChangeForm';
import { StufenSection } from '@/components/settings/StufenSection';
import { PauschalenSection } from '@/components/settings/PauschalenSection';

export function SettingsPage() {
  const { data: config, isLoading } = useConfig();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <Button asChild variant="ghost" size="icon" aria-label="Zurück">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Einstellungen</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-12">
        <Card>
          <CardHeader>
            <CardTitle>Firma</CardTitle>
            <CardDescription>
              Stammdaten für den PDF-Header und die Fußzeile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Lade …</p>
            ) : (
              <FirmaForm initial={config?.firma ?? null} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>Erscheint im PDF-Header und in der App.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Lade …</p>
            ) : (
              <LogoUploadSection current={config?.logo ?? null} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mitarbeiter-Stufen</CardTitle>
            <CardDescription>
              Lohnstufen mit Stundenpreis. Reihenfolge bestimmt die Anzeige im Auftrag.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StufenSection />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pauschalen</CardTitle>
            <CardDescription>
              Vordefinierte Posten mit Festpreis (z.B. Anfahrt, Pressgeräteeinsatz).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PauschalenSection />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Erscheinungsbild</CardTitle>
            <CardDescription>
              Wirkt sofort und wird pro Gerät gespeichert.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeSection />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PIN ändern</CardTitle>
            <CardDescription>
              Drei Schritte: aktueller PIN, neuer PIN, neuer PIN bestätigen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PinChangeForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
