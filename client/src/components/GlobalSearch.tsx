import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  BookOpen,
  ClipboardList,
  FileText,
  Package,
  Search,
  User,
} from 'lucide-react';
import type { Auftrag, AuftragTyp, Kunde, Vorlage } from '@ahv/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuftraege } from '@/hooks/useAuftraege';
import { useKunden } from '@/hooks/useKunden';
import { useVorlagen } from '@/hooks/useVorlagen';
import { cn } from '@/lib/utils';

const TYP_ICON: Record<AuftragTyp, typeof FileText> = {
  arbeitszettel: ClipboardList,
  angebot: FileText,
  lieferschein: Package,
};

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

interface Hit {
  key: string;
  kind: 'auftrag' | 'kunde' | 'vorlage';
  icon: typeof Search;
  title: string;
  subtitle: string;
  to: string;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Bei open: Reset
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebounced('');
      setActive(0);
    }
  }, [open]);

  const { data: auftraege } = useAuftraege({ query: debounced || undefined });
  const { data: kunden } = useKunden(debounced || undefined);
  const { data: vorlagen } = useVorlagen();

  const hits: Hit[] = useMemo(() => {
    if (!debounced) return [];
    const q = debounced.toLowerCase();
    const list: Hit[] = [];

    for (const a of (auftraege ?? []).slice(0, 6)) {
      const snap = a.kunde_snapshot;
      const kundeName =
        snap.typ === 'firma'
          ? snap.firmenname ?? ''
          : [snap.vorname, snap.nachname].filter(Boolean).join(' ');
      list.push({
        key: `a-${a.id}`,
        kind: 'auftrag',
        icon: TYP_ICON[a.typ],
        title: a.titel || '(ohne Titel)',
        subtitle: `${a.datum} · ${kundeName || 'kein Kunde'}`,
        to: `/auftraege/${a.id}/edit`,
      });
    }

    for (const k of (kunden ?? []).slice(0, 6)) {
      const name =
        k.typ === 'firma'
          ? k.firmenname ?? '—'
          : [k.vorname, k.nachname].filter(Boolean).join(' ');
      list.push({
        key: `k-${k.id}`,
        kind: 'kunde',
        icon: k.typ === 'firma' ? Building2 : User,
        title: name,
        subtitle: [k.plz, k.ort].filter(Boolean).join(' ') || '—',
        to: `/kunden/${k.id}`,
      });
    }

    for (const v of (vorlagen ?? []).filter((x) => x.name.toLowerCase().includes(q)).slice(0, 4)) {
      list.push({
        key: `v-${v.id}`,
        kind: 'vorlage',
        icon: BookOpen,
        title: v.name,
        subtitle: 'Vorlage',
        to: `/auftraege`,
      });
    }

    return list;
  }, [debounced, auftraege, kunden, vorlagen]);

  // Active-Index nach Hits-Änderung clampen
  useEffect(() => {
    setActive(0);
  }, [hits.length]);

  const handleSelect = (hit: Hit) => {
    onClose();
    navigate(hit.to);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const hit = hits[active];
      if (hit) {
        e.preventDefault();
        handleSelect(hit);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 p-0">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Aufträge, Kunden, Vorlagen …"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-1">
          {!debounced ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              Tippe los — durchsucht Aufträge, Kunden und Vorlagen.
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              Keine Treffer für „{debounced}".
            </p>
          ) : (
            <ul className="space-y-0.5">
              {hits.map((hit, idx) => {
                const Icon = hit.icon;
                return (
                  <li key={hit.key}>
                    <button
                      type="button"
                      onClick={() => handleSelect(hit)}
                      onMouseEnter={() => setActive(idx)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left',
                        idx === active && 'bg-accent',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{hit.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {hit.subtitle}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {hit.kind}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          ↑↓ navigieren · ↵ öffnen · Esc schließen
        </div>
      </DialogContent>
    </Dialog>
  );
}
