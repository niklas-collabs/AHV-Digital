import { useEffect, useState } from 'react';
import { CheckCircle2, Moon, Sun, Wrench, XCircle } from 'lucide-react';
import type { HealthResponse } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Toaster, toast } from '@/components/ui/sonner';

type HealthState =
  | { status: 'pending' }
  | { status: 'ok'; data: HealthResponse }
  | { status: 'error'; message: string };

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [health, setHealth] = useState<HealthState>({ status: 'pending' });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    fetch('/api/health')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as HealthResponse;
      })
      .then((data) => setHealth({ status: 'ok', data }))
      .catch((err: unknown) =>
        setHealth({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">AHV Arbeitszettel</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Theme wechseln"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Phase 1.2 — Datenbank-Foundation</CardTitle>
            <CardDescription>
              SQLite-Schema steht, Migrations laufen automatisch, tägliches Backup ist geplant.
              Auth, Settings und Aufträge folgen ab Phase 1.3.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <HealthRow health={health} />
            <Button onClick={() => toast.success('Toast funktioniert ✓')}>Toast-Smoketest</Button>
          </CardContent>
        </Card>
      </main>

      <Toaster />
    </div>
  );
}

function HealthRow({ health }: { health: HealthState }) {
  if (health.status === 'pending') {
    return <p className="text-sm text-muted-foreground">Server-Verbindung wird geprüft …</p>;
  }
  if (health.status === 'error') {
    return (
      <p className="flex items-center gap-2 text-sm text-destructive">
        <XCircle className="h-4 w-4" />
        Server nicht erreichbar: {health.message}
      </p>
    );
  }
  const dbBadge =
    health.data.db === 'ok' ? (
      <span className="text-emerald-500">DB ok</span>
    ) : (
      <span className="text-destructive">DB error</span>
    );
  return (
    <p className="flex items-center gap-2 text-sm text-emerald-500">
      <CheckCircle2 className="h-4 w-4" />
      Server OK ({health.data.service} v{health.data.version}) · {dbBadge}
    </p>
  );
}
