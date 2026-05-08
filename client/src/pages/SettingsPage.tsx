import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ApiError, apiClient } from '@/lib/api';
import { AUTH_STATUS_QUERY_KEY } from '@/hooks/useAuthStatus';
import { useConfig } from '@/hooks/useConfig';
import { FirmaForm } from '@/components/settings/FirmaForm';
import { ThemeSection } from '@/components/settings/ThemeSection';
import { LogoUploadSection } from '@/components/settings/LogoUploadSection';
import { PinChangeForm } from '@/components/settings/PinChangeForm';
import { StufenSection } from '@/components/settings/StufenSection';
import { PauschalenSection } from '@/components/settings/PauschalenSection';
import { LexofficeSection } from '@/components/settings/LexofficeSection';

export function SettingsPage() {
  const { data: config, isLoading } = useConfig();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: () => apiClient('/api/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
      navigate('/login', { replace: true });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Abmelden fehlgeschlagen');
    },
  });

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <h1 className="text-lg font-semibold">Einstellungen</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Firma</CardTitle>
            <CardDescription>
              Stammdaten für den PDF-Header und die Fußzeile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Lädt …</p>
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
              <p className="text-sm text-muted-foreground">Lädt …</p>
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
            <CardTitle>Lexoffice-Sync</CardTitle>
            <CardDescription>
              Kunden aus Lexoffice in die App ziehen. API-Key wird ausschließlich
              server-seitig gespeichert.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LexofficeSection />
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

        <Card>
          <CardHeader>
            <CardTitle>Abmelden</CardTitle>
            <CardDescription>
              Beendet die Session auf diesem Gerät. Beim nächsten Aufruf ist der PIN nötig.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="h-4 w-4" />
              {logoutMutation.isPending ? 'Wird abgemeldet …' : 'Abmelden'}
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
