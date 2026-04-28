import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, LogOut, Moon, Settings, Sun, Users, Wrench, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { HealthResponse } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { AUTH_STATUS_QUERY_KEY } from '@/hooks/useAuthStatus';
import { useThemeStore } from '@/stores/theme-store';

export function HomePage() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient<HealthResponse>('/api/health'),
    refetchInterval: 30_000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiClient('/api/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
      navigate('/login', { replace: true });
    },
    onError: () => toast.error('Logout fehlgeschlagen'),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">AHV Arbeitszettel</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Theme wechseln"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Einstellungen">
              <Link to="/settings">
                <Settings className="h-5 w-5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              aria-label="Abmelden"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Phase 1.6 — Kunden</CardTitle>
            <CardDescription>
              Kunden-Verwaltung mit Suche, Privat/Firma-Toggle und FK-Schutz beim Loeschen.
              Aufträge folgen ab 1.7.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <HealthRow
              status={healthQuery.status}
              data={healthQuery.data}
              error={healthQuery.error}
            />
            <Button asChild>
              <Link to="/kunden">
                <Users className="h-4 w-4" />
                Kunden verwalten
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

interface HealthRowProps {
  status: 'pending' | 'error' | 'success';
  data: HealthResponse | undefined;
  error: unknown;
}

function HealthRow({ status, data, error }: HealthRowProps) {
  if (status === 'pending') {
    return <p className="text-sm text-muted-foreground">Server-Verbindung wird geprüft …</p>;
  }
  if (status === 'error' || !data) {
    const msg = error instanceof Error ? error.message : 'unbekannter Fehler';
    return (
      <p className="flex items-center gap-2 text-sm text-destructive">
        <XCircle className="h-4 w-4" />
        Server nicht erreichbar: {msg}
      </p>
    );
  }
  const dbBadge =
    data.db === 'ok' ? (
      <span className="text-emerald-500">DB ok</span>
    ) : (
      <span className="text-destructive">DB error</span>
    );
  return (
    <p className="flex items-center gap-2 text-sm text-emerald-500">
      <CheckCircle2 className="h-4 w-4" />
      Server OK ({data.service} v{data.version}) · {dbBadge}
    </p>
  );
}
