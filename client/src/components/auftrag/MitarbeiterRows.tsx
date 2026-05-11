import { Plus, Trash2 } from 'lucide-react';
import type { AuftragMitarbeiter } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStufen } from '@/hooks/useStufen';
import { useStableKeys } from '@/hooks/useStableKeys';

interface MitarbeiterRowsProps {
  rows: AuftragMitarbeiter[];
  onChange: (rows: AuftragMitarbeiter[]) => void;
  disabled?: boolean;
}

export function MitarbeiterRows({ rows, onChange, disabled }: MitarbeiterRowsProps) {
  const { data: stufen } = useStufen();
  const { keys, addKey, removeKeyAt } = useStableKeys(rows.length);

  const addRow = () => {
    addKey();
    onChange([
      ...rows,
      {
        name: '',
        stufe_id: null,
        stufe_bezeichnung: '',
        stundenpreis: 0,
        stunden: 0,
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<AuftragMitarbeiter>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    removeKeyAt(idx);
    onChange(rows.filter((_, i) => i !== idx));
  };

  const handleStufeChange = (idx: number, stufe_id: string) => {
    if (!stufe_id) {
      updateRow(idx, { stufe_id: null, stufe_bezeichnung: '', stundenpreis: 0 });
      return;
    }
    const stufe = stufen?.find((s) => s.id === stufe_id);
    if (!stufe) return;
    updateRow(idx, {
      stufe_id: stufe.id,
      stufe_bezeichnung: stufe.bezeichnung,
      stundenpreis: stufe.stundenpreis,
    });
  };

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">Noch keine Mitarbeiter erfasst.</p>
      )}
      {rows.map((row, idx) => (
        <div
          key={keys[idx] ?? idx}
          className="grid grid-cols-1 gap-2 rounded-md border border-border p-2 sm:grid-cols-[2fr_1.5fr_0.8fr_0.8fr_auto]"
        >
          <Input
            placeholder="Name"
            value={row.name}
            onChange={(e) => updateRow(idx, { name: e.target.value })}
            disabled={disabled}
          />
          <select
            value={row.stufe_id ?? ''}
            onChange={(e) => handleStufeChange(idx, e.target.value)}
            disabled={disabled}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">— Stufe —</option>
            {stufen?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.bezeichnung} ({s.stundenpreis.toFixed(2)} €)
              </option>
            ))}
          </select>
          <Input
            type="number"
            step="0.25"
            min="0"
            placeholder="Stunden"
            value={row.stunden}
            onChange={(e) => updateRow(idx, { stunden: parseFloat(e.target.value) || 0 })}
            disabled={disabled}
          />
          <div className="flex items-center px-2 text-sm text-muted-foreground">
            {(row.stundenpreis * row.stunden).toFixed(2)} €
          </div>
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
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
        Mitarbeiter hinzufügen
      </Button>
    </div>
  );
}
