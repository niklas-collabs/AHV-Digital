import { useQuery } from '@tanstack/react-query';
import { ClipboardList, FileText, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api';

interface AuftragStats {
  total: number;
  draft: number;
  abgeschickt: number;
  byTyp: { arbeitszettel: number; angebot: number; lieferschein: number };
  count: { heute: number; woche: number; monat: number };
}

export function StatistikPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['auftrag-stats'],
    queryFn: () => apiClient<AuftragStats>('/api/auftraege/stats'),
    staleTime: 30_000,
  });

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <h1 className="text-lg font-semibold">Statistik</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        {isLoading || !data ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KPI label="Heute" count={data.count.heute} />
              <KPI label="Diese Woche" count={data.count.woche} />
              <KPI label="Dieser Monat" count={data.count.monat} />
              <KPI label="Gesamt" count={data.total} />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Bar label="Entwürfe" value={data.draft} total={data.total} />
                  <Bar label="Abgeschickt" value={data.abgeschickt} total={data.total} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Auftragstypen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <TypRow
                  icon={ClipboardList}
                  label="Arbeitszettel"
                  count={data.byTyp.arbeitszettel}
                  total={data.total}
                />
                <TypRow
                  icon={FileText}
                  label="Angebot"
                  count={data.byTyp.angebot}
                  total={data.total}
                />
                <TypRow
                  icon={Package}
                  label="Lieferschein"
                  count={data.byTyp.lieferschein}
                  total={data.total}
                />
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </>
  );
}

function KPI({ label, count }: { label: string; count: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{count}</p>
        <p className="text-xs text-muted-foreground">
          {count === 1 ? 'Auftrag' : 'Aufträge'}
        </p>
      </CardContent>
    </Card>
  );
}

function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {value} ({pct}%)
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TypRow({
  icon: Icon,
  label,
  count,
  total,
}: {
  icon: typeof ClipboardList;
  label: string;
  count: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div className="flex-1">
        <div className="flex justify-between text-sm">
          <span>{label}</span>
          <span className="text-muted-foreground">{count}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary/60" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
