import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  QrCode,
  Trash2,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Wartungsplan } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  useDeleteWartungsplan,
  useWartungsplaene,
} from '@/hooks/useWartung';
import { cn } from '@/lib/utils';
import { WartungsplanDialog } from '@/components/wartung/WartungsplanDialog';
import { ErledigtDialog } from '@/components/wartung/ErledigtDialog';

type StatusFilter = 'alle' | 'ueberfaellig' | 'bald' | 'ok';

function statusOf(plan: Wartungsplan): 'ok' | 'bald' | 'ueberfaellig' {
  const today = new Date().toISOString().slice(0, 10);
  if (plan.naechste_wartung < today) return 'ueberfaellig';
  const grenze = new Date();
  grenze.setDate(grenze.getDate() + plan.erinnerung_tage);
  const grenzeIso = grenze.toISOString().slice(0, 10);
  if (plan.naechste_wartung <= grenzeIso) return 'bald';
  return 'ok';
}

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

const STATUS_LABEL: Record<'ok' | 'bald' | 'ueberfaellig', string> = {
  ok: 'OK',
  bald: 'bald fällig',
  ueberfaellig: 'überfällig',
};

const STATUS_CLASS: Record<'ok' | 'bald' | 'ueberfaellig', string> = {
  ok: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  bald: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  ueberfaellig: 'border-destructive/50 text-destructive',
};

export function WartungPage() {
  const { data, isLoading } = useWartungsplaene();
  const remove = useDeleteWartungsplan();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Wartungsplan | null>(null);
  const [erledigt, setErledigt] = useState<Wartungsplan | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('alle');

  const list = data ?? [];
  const filtered = useMemo(() => {
    if (filter === 'alle') return list;
    return list.filter((p) => statusOf(p) === filter);
  }, [list, filter]);

  const counts = useMemo(() => {
    const c = { ueberfaellig: 0, bald: 0, ok: 0 };
    for (const p of list) c[statusOf(p)]++;
    return c;
  }, [list]);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <h1 className="flex-1 text-lg font-semibold">Wartung</h1>
          <Button asChild variant="outline" size="icon" title="Anlagen / QR-Codes">
            <Link to="/anlagen" aria-label="Anlagen">
              <QrCode className="h-4 w-4" />
            </Link>
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Neu
          </Button>
        </div>
        <div className="mx-auto flex max-w-3xl gap-1.5 px-4 pb-3">
          <FilterPill
            active={filter === 'alle'}
            onClick={() => setFilter('alle')}
            label={`Alle (${list.length})`}
          />
          <FilterPill
            active={filter === 'ueberfaellig'}
            onClick={() => setFilter('ueberfaellig')}
            label={`Überfällig (${counts.ueberfaellig})`}
            danger
          />
          <FilterPill
            active={filter === 'bald'}
            onClick={() => setFilter('bald')}
            label={`Bald (${counts.bald})`}
          />
          <FilterPill
            active={filter === 'ok'}
            onClick={() => setFilter('ok')}
            label={`OK (${counts.ok})`}
          />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-2 p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {list.length === 0
                ? 'Noch keine Wartungspläne angelegt.'
                : 'Keine Treffer mit diesem Filter.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {filtered.map((p) => (
              <WartungRow
                key={p.id}
                plan={p}
                onEdit={() => setEditing(p)}
                onErledigt={() => setErledigt(p)}
                onDelete={() => {
                  if (
                    confirm(
                      `"${p.anlage}" wirklich löschen? (Historie wird auch gelöscht)`,
                    )
                  ) {
                    remove.mutate(p.id, {
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

      {creating && <WartungsplanDialog plan={null} onClose={() => setCreating(false)} />}
      {editing && <WartungsplanDialog plan={editing} onClose={() => setEditing(null)} />}
      {erledigt && <ErledigtDialog plan={erledigt} onClose={() => setErledigt(null)} />}
    </>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  danger,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? danger
            ? 'border-destructive bg-destructive text-destructive-foreground'
            : 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-primary/50',
      )}
    >
      {label}
    </button>
  );
}

interface WartungRowProps {
  plan: Wartungsplan;
  onEdit: () => void;
  onErledigt: () => void;
  onDelete: () => void;
}

function WartungRow({ plan, onEdit, onErledigt, onDelete }: WartungRowProps) {
  const status = statusOf(plan);
  const Icon = status === 'ueberfaellig' ? AlertTriangle : status === 'bald' ? Clock : CheckCircle2;

  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <Wrench className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{plan.anlage}</p>
        <p className="truncate text-xs text-muted-foreground">
          {plan.kunde_name || 'kein Kunde'}
          {plan.standort ? ` · ${plan.standort}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
            STATUS_CLASS[status],
          )}
        >
          <Icon className="h-3 w-3" />
          {STATUS_LABEL[status]}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          fällig: {formatDate(plan.naechste_wartung)}
        </p>
      </div>
      <Button type="button" size="sm" onClick={onErledigt}>
        Erledigt
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label="Bearbeiten">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Löschen">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  );
}
