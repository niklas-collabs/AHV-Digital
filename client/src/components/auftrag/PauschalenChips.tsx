import type { AuftragMaterial, Pauschale } from '@ahv/shared';
import { usePauschalen } from '@/hooks/usePauschalen';
import { cn } from '@/lib/utils';

interface PauschalenChipsProps {
  onAdd: (material: AuftragMaterial) => void;
  disabled?: boolean;
}

export function PauschalenChips({ onAdd, disabled }: PauschalenChipsProps) {
  const { data } = usePauschalen();

  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Noch keine Pauschalen — in den Einstellungen anlegen.
      </p>
    );
  }

  const handleClick = (p: Pauschale) => {
    if (disabled) return;
    onAdd({
      name: p.name,
      menge: 1,
      einheit: p.einheit,
      preis_netto: p.preis_netto,
      mwst_prozent: p.mwst_prozent,
      ist_lohnkosten: p.ist_lohnkosten,
    });
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {data.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => handleClick(p)}
          disabled={disabled}
          className={cn(
            'rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium transition-colors',
            'hover:border-primary hover:bg-primary hover:text-primary-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50',
            p.ist_lohnkosten && 'border-accent-foreground/30',
          )}
          title={`${p.preis_netto.toFixed(2)} € · ${p.einheit} · ${p.mwst_prozent}%${
            p.ist_lohnkosten ? ' · Lohnkosten' : ''
          }`}
        >
          + {p.name}
        </button>
      ))}
    </div>
  );
}
