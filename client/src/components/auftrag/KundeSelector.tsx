import { useState } from 'react';
import { Building2, Plus, User, X } from 'lucide-react';
import type { Kunde } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useKunden } from '@/hooks/useKunden';
import { KundeFormDialog } from '@/components/kunden/KundeFormDialog';

interface KundeSelectorProps {
  value: string | null;
  onChange: (kunde_id: string | null) => void;
  disabled?: boolean;
}

export function KundeSelector({ value, onChange, disabled }: KundeSelectorProps) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const { data: alleKunden } = useKunden();
  const { data: searchKunden } = useKunden(search.trim() || undefined);

  const selected = value ? alleKunden?.find((k) => k.id === value) ?? null : null;

  if (selected) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          {selected.typ === 'firma' ? (
            <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
          ) : (
            <User className="h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{displayName(selected)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {addressLine(selected) || '—'}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label="Kunde abwaehlen"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          placeholder="Kunde suchen oder unten neu anlegen …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
        />
      </div>

      {search.trim() && searchKunden && searchKunden.length > 0 && (
        <ul className="max-h-60 overflow-y-auto rounded-md border border-border">
          {searchKunden.slice(0, 8).map((k) => (
            <li key={k.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(k.id);
                  setSearch('');
                }}
                className="flex w-full items-center gap-2 border-b border-border p-3 text-left last:border-0 hover:bg-muted/50 disabled:opacity-50"
              >
                {k.typ === 'firma' ? (
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{displayName(k)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {addressLine(k) || '—'}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => setCreating(true)}
        disabled={disabled}
        className="w-full sm:w-auto"
      >
        <Plus className="h-4 w-4" />
        Neuen Kunden anlegen
      </Button>

      {creating && (
        <KundeFormDialog
          kunde={null}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function displayName(k: Kunde): string {
  if (k.typ === 'firma') {
    const ans =
      k.vorname || k.nachname ? ` (${[k.vorname, k.nachname].filter(Boolean).join(' ')})` : '';
    return `${k.firmenname ?? '—'}${ans}`;
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
