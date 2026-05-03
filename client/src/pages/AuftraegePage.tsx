import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  FileDown,
  FileText,
  Package,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Auftrag, AuftragStatus, AuftragTyp } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useAuftraege, useDeleteAuftrag } from '@/hooks/useAuftraege';
import { cn } from '@/lib/utils';

const TYP_ICON: Record<AuftragTyp, typeof FileText> = {
  arbeitszettel: ClipboardList,
  angebot: FileText,
  lieferschein: Package,
};

const TYP_LABEL: Record<AuftragTyp, string> = {
  arbeitszettel: 'AZ',
  angebot: 'AG',
  lieferschein: 'LS',
};

export function AuftraegePage() {
  const [tab, setTab] = useState<AuftragStatus>('entwurf');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useAuftraege({ status: tab, query: debounced || undefined });
  const remove = useDeleteAuftrag();

  const auftraege = data ?? [];

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <h1 className="flex-1 text-lg font-semibold">Aufträge</h1>
          <Button asChild>
            <Link to="/auftraege/neu">
              <Plus className="h-4 w-4" />
              Neu
            </Link>
          </Button>
        </div>
        <div className="mx-auto flex max-w-3xl">
          <TabBtn active={tab === 'entwurf'} onClick={() => setTab('entwurf')} label="Entwürfe" />
          <TabBtn
            active={tab === 'abgeschickt'}
            onClick={() => setTab('abgeschickt')}
            label="Archiv"
          />
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Suchen … (Titel, Kunde)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-2 p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : auftraege.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {tab === 'entwurf' ? 'Keine Entwürfe.' : 'Keine archivierten Aufträge.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {auftraege.map((a) => (
              <AuftragRow
                key={a.id}
                auftrag={a}
                onDelete={() => {
                  if (confirm(`"${a.titel || '(ohne Titel)'}" wirklich löschen?`)) {
                    remove.mutate(a.id, {
                      onError: (err) =>
                        toast.error(err instanceof ApiError ? err.message : 'Fehler'),
                    });
                  }
                }}
              />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

interface TabBtnProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function TabBtn({ active, onClick, label }: TabBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

interface AuftragRowProps {
  auftrag: Auftrag;
  onDelete: () => void;
}

function AuftragRow({ auftrag, onDelete }: AuftragRowProps) {
  const Icon = TYP_ICON[auftrag.typ];
  const kundeName = formatKunde(auftrag);

  return (
    <li className="flex items-center gap-3 p-3">
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <span className="text-[10px] font-bold text-muted-foreground">
          {TYP_LABEL[auftrag.typ]}
        </span>
      </div>
      <Link to={`/auftraege/${auftrag.id}/edit`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{auftrag.titel || '(ohne Titel)'}</p>
        <p className="truncate text-xs text-muted-foreground">
          {auftrag.datum} · {kundeName || 'Kein Kunde'}
        </p>
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => window.open(`/api/auftraege/${auftrag.id}/pdf`, '_blank', 'noopener')}
        aria-label="PDF öffnen"
        title="PDF öffnen"
      >
        <FileDown className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Löschen">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  );
}

function formatKunde(a: Auftrag): string {
  const s = a.kunde_snapshot;
  if (s.typ === 'firma') return s.firmenname ?? '';
  return [s.vorname, s.nachname].filter(Boolean).join(' ');
}
