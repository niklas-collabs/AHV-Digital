import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Pencil, Plus, Search, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import type { Kunde } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useDeleteKunde, useKunden } from '@/hooks/useKunden';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { ListSkeleton } from '@/components/ui/skeleton';
import { KundeFormDialog } from '@/components/kunden/KundeFormDialog';

export function KundenPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Kunde | null>(null);

  // 250 ms Debounce — vermeidet eine Query pro Tastendruck
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useKunden(debouncedSearch || undefined);
  const remove = useDeleteKunde();

  const kunden = data ?? [];

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 p-4">
          <h1 className="flex-1 text-lg font-semibold">Kunden</h1>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Neu
          </Button>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Suchen … (Name, Firma, Ort, PLZ)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-2 p-4">
        {isLoading ? (
          <ListSkeleton />
        ) : kunden.length === 0 ? (
          <EmptyState hasSearch={debouncedSearch.length > 0} />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {kunden.map((k) => (
              <KundeRow
                key={k.id}
                kunde={k}
                onEdit={() => setEditing(k)}
                onDelete={async () => {
                  const ok = await confirmDialog({
                    title: 'Kunde löschen?',
                    description: `„${displayName(k)}“ wird endgültig gelöscht.`,
                    confirmLabel: 'Löschen',
                    destructive: true,
                  });
                  if (!ok) return;
                  remove.mutate(k.id, {
                    onError: (err) => {
                      if (err instanceof ApiError && err.code === 'IN_USE') {
                        toast.error(err.message);
                      } else {
                        toast.error(err instanceof ApiError ? err.message : 'Fehler');
                      }
                    },
                  });
                }}
              />
            ))}
          </ul>
        )}
        {isFetching && !isLoading && (
          <p className="text-center text-xs text-muted-foreground">Aktualisiere …</p>
        )}
      </main>

      {creating && <KundeFormDialog kunde={null} onClose={() => setCreating(false)} />}
      {editing && <KundeFormDialog kunde={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

interface KundeRowProps {
  kunde: Kunde;
  onEdit: () => void;
  onDelete: () => void;
}

function KundeRow({ kunde, onEdit, onDelete }: KundeRowProps) {
  const Icon = kunde.typ === 'firma' ? Building2 : User;
  return (
    <li className="flex items-center gap-3 p-3">
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <Link to={`/kunden/${kunde.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{displayName(kunde)}</p>
        <p className="truncate text-xs text-muted-foreground">{addressLine(kunde) || '—'}</p>
      </Link>
      <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label="Bearbeiten">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Löschen">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="rounded-md border border-dashed border-border p-12 text-center">
      <p className="text-sm text-muted-foreground">
        {hasSearch ? 'Keine Treffer.' : 'Noch keine Kunden angelegt.'}
      </p>
    </div>
  );
}

function displayName(k: Kunde): string {
  if (k.typ === 'firma') {
    const ansprech =
      k.vorname || k.nachname ? ` (${[k.vorname, k.nachname].filter(Boolean).join(' ')})` : '';
    return `${k.firmenname ?? '—'}${ansprech}`;
  }
  return [k.vorname, k.nachname].filter(Boolean).join(' ');
}

function addressLine(k: Kunde): string {
  const parts: string[] = [];
  if (k.strasse) parts.push(k.strasse);
  const ortLine = [k.plz, k.ort].filter(Boolean).join(' ');
  if (ortLine) parts.push(ortLine);
  return parts.join(' · ');
}
