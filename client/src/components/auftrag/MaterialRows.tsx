import { Plus, Trash2 } from 'lucide-react';
import type { AuftragMaterial } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MaterialRowsProps {
  rows: AuftragMaterial[];
  onChange: (rows: AuftragMaterial[]) => void;
  disabled?: boolean;
}

const EINHEITEN = ['Stk', 'm', 'm²', 'l', 'kg', 'Std', 'Psch'];

export function MaterialRows({ rows, onChange, disabled }: MaterialRowsProps) {
  const addRow = () => {
    onChange([
      ...rows,
      {
        name: '',
        menge: 1,
        einheit: 'Stk',
        preis_netto: 0,
        mwst_prozent: 19,
        ist_lohnkosten: false,
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<AuftragMaterial>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">Noch kein Material erfasst.</p>
      )}
      {rows.map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 sm:grid-cols-[2fr_0.8fr_0.8fr_1fr_0.8fr_auto]"
        >
          <Input
            placeholder="Bezeichnung"
            value={row.name}
            onChange={(e) => updateRow(idx, { name: e.target.value })}
            disabled={disabled}
            className="col-span-2 sm:col-span-1"
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Menge"
            value={row.menge}
            onChange={(e) => updateRow(idx, { menge: parseFloat(e.target.value) || 0 })}
            disabled={disabled}
          />
          <Input
            list="einheiten-list"
            placeholder="Einheit"
            value={row.einheit}
            onChange={(e) => updateRow(idx, { einheit: e.target.value })}
            disabled={disabled}
          />
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="EUR netto"
            value={row.preis_netto}
            onChange={(e) => updateRow(idx, { preis_netto: parseFloat(e.target.value) || 0 })}
            disabled={disabled}
          />
          <select
            value={row.mwst_prozent}
            onChange={(e) => updateRow(idx, { mwst_prozent: parseFloat(e.target.value) || 0 })}
            disabled={disabled}
            className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value={19}>19%</option>
            <option value={7}>7%</option>
            <option value={0}>0%</option>
          </select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeRow(idx)}
            disabled={disabled}
            aria-label="Zeile entfernen"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
          <label className="col-span-2 flex items-center gap-2 px-2 text-xs text-muted-foreground sm:col-span-6">
            <input
              type="checkbox"
              checked={row.ist_lohnkosten}
              onChange={(e) => updateRow(idx, { ist_lohnkosten: e.target.checked })}
              disabled={disabled}
              className="h-4 w-4"
            />
            Als Lohnkosten zaehlen (§35a EStG)
          </label>
        </div>
      ))}
      <datalist id="einheiten-list">
        {EINHEITEN.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
        Material hinzufuegen
      </Button>
    </div>
  );
}
