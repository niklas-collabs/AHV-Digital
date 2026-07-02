import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ChecklistenItem, ChecklistenVorlageTyp, AuftragTyp } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useChecklisten } from '@/hooks/useChecklisten';
import { useStableKeys } from '@/hooks/useStableKeys';

interface ChecklisteSectionProps {
  /** null = keine Checkliste im Auftrag verwendet */
  value: ChecklistenItem[] | null;
  onChange: (items: ChecklistenItem[] | null) => void;
  /** Auftragstyp — bestimmt welche Vorlagen vorgeschlagen werden */
  auftragTyp: AuftragTyp;
  disabled?: boolean;
}

/**
 * Mapping Auftragstyp → passender Checklisten-Typ. Wartung gibt's nur als
 * Checklisten-Typ, daher wird auch beim Arbeitszettel das Wartungs-Set
 * angeboten — Wartungen werden im SHK-Geschäft oft als Arbeitszettel
 * abgewickelt.
 */
function checklistenTypForAuftrag(typ: AuftragTyp): ChecklistenVorlageTyp[] {
  switch (typ) {
    case 'arbeitszettel':
      return ['arbeitszettel', 'wartung'];
    case 'angebot':
      return ['angebot'];
    case 'lieferschein':
      return [];
  }
}

export function ChecklisteSection({
  value,
  onChange,
  auftragTyp,
  disabled,
}: ChecklisteSectionProps) {
  const items = value ?? [];
  const { keys, addKey, removeKeyAt } = useStableKeys(items.length);
  const { data: vorlagen } = useChecklisten();
  const [selectedVorlage, setSelectedVorlage] = useState<string>('');

  const passendeTypen = checklistenTypForAuftrag(auftragTyp);
  const verfuegbar = (vorlagen ?? []).filter((v) => passendeTypen.includes(v.typ));

  const addItem = () => {
    addKey();
    onChange([...(value ?? []), { text: '', checked: false }]);
  };

  const updateItem = (idx: number, patch: Partial<ChecklistenItem>) => {
    onChange((value ?? []).map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    removeKeyAt(idx);
    const next = (value ?? []).filter((_, i) => i !== idx);
    onChange(next.length === 0 ? null : next);
  };

  const loadVorlage = () => {
    if (!selectedVorlage) return;
    const v = verfuegbar.find((x) => x.id === selectedVorlage);
    if (!v) return;
    onChange(v.items.map((i) => ({ text: i.text, checked: false })));
    setSelectedVorlage('');
  };

  const clear = async () => {
    if (items.length === 0) return;
    const ok = await confirmDialog({
      title: 'Checkliste leeren?',
      description: 'Alle Punkte werden entfernt.',
      confirmLabel: 'Leeren',
      destructive: true,
    });
    if (ok) onChange(null);
  };

  return (
    <div className="space-y-3">
      {verfuegbar.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedVorlage}
            onChange={(e) => setSelectedVorlage(e.target.value)}
            disabled={disabled}
            className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">— Aus Vorlage laden —</option>
            {verfuegbar.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.items.length})
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            onClick={loadVorlage}
            disabled={!selectedVorlage || disabled}
          >
            Laden
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {verfuegbar.length > 0
            ? 'Punkte einzeln hinzufügen oder eine Vorlage laden.'
            : 'Punkte einzeln hinzufügen (Vorlagen anlegen unter „Mehr → Checklisten").'}
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {items.map((it, idx) => (
              <li key={keys[idx] ?? idx} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={it.checked}
                  onChange={(e) => updateItem(idx, { checked: e.target.checked })}
                  disabled={disabled}
                  className="h-4 w-4 shrink-0"
                />
                <Input
                  value={it.text}
                  onChange={(e) => updateItem(idx, { text: e.target.value })}
                  placeholder="Punkt"
                  disabled={disabled}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeItem(idx)}
                  disabled={disabled}
                  aria-label="Entfernen"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={disabled}>
              <Plus className="h-4 w-4" />
              Punkt hinzufügen
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              disabled={disabled}
            >
              Liste leeren
            </Button>
          </div>
        </>
      )}

      {items.length === 0 && (
        <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={disabled}>
          <Plus className="h-4 w-4" />
          Punkt hinzufügen
        </Button>
      )}
    </div>
  );
}
