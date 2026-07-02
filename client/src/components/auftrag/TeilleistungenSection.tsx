import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { Teilleistung } from '@ahv/shared';
import { Button } from '@/components/ui/button';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { MitarbeiterRows } from './MitarbeiterRows';
import { MaterialRows } from './MaterialRows';
import { PauschalenChips } from './PauschalenChips';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Lokale ID — wir hängen sie an, weil das Frontend stabile React-Keys
 *  braucht. Beim Speichern übernimmt sie der Server (oder vergibt eine,
 *  falls leer). Browser unterstützen crypto.randomUUID flächendeckend. */
function newId(): string {
  return crypto.randomUUID();
}

interface TeilleistungenSectionProps {
  rows: Teilleistung[];
  onChange: (rows: Teilleistung[]) => void;
  disabled?: boolean;
}

export function TeilleistungenSection({
  rows,
  onChange,
  disabled,
}: TeilleistungenSectionProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const addRow = () => {
    const t: Teilleistung = {
      id: newId(),
      bezeichnung: '',
      datum: todayIso(),
      notiz: '',
      mitarbeiter: [],
      materialien: [],
    };
    onChange([...rows, t]);
    setOpenId(t.id);
  };

  const updateRow = (id: string, patch: Partial<Teilleistung>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    onChange(rows.filter((r) => r.id !== id));
    if (openId === id) setOpenId(null);
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Noch keine Teilleistungen — bei Etappen-Aufträgen pro Etappe
          eine anlegen.
        </p>
      )}

      {rows.map((t, idx) => {
        const isOpen = openId === t.id;
        const summary = formatSummary(t);
        return (
          <div key={t.id} className="rounded-md border border-border">
            <div className="flex items-center gap-2 p-3">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : t.id)}
                className="flex flex-1 items-center gap-2 text-left"
                aria-label={isOpen ? 'Einklappen' : 'Ausklappen'}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {idx + 1}. {t.bezeichnung || '(ohne Bezeichnung)'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{summary}</p>
                </div>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Teilleistung entfernen?',
                    description: `„${t.bezeichnung || '(ohne Bezeichnung)'}“ wird entfernt.`,
                    confirmLabel: 'Entfernen',
                    destructive: true,
                  });
                  if (ok) removeRow(t.id);
                }}
                disabled={disabled}
                aria-label="Teilleistung entfernen"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            {isOpen && (
              <div className="space-y-3 border-t border-border p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`tl-bezeichnung-${t.id}`}>Bezeichnung</Label>
                    <Input
                      id={`tl-bezeichnung-${t.id}`}
                      value={t.bezeichnung}
                      onChange={(e) => updateRow(t.id, { bezeichnung: e.target.value })}
                      placeholder="z.B. Etappe 1 — Demontage"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`tl-datum-${t.id}`}>Datum</Label>
                    <Input
                      id={`tl-datum-${t.id}`}
                      type="date"
                      value={t.datum}
                      onChange={(e) => updateRow(t.id, { datum: e.target.value })}
                      disabled={disabled}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`tl-notiz-${t.id}`}>Notiz (optional, im PDF sichtbar)</Label>
                  <Textarea
                    id={`tl-notiz-${t.id}`}
                    rows={2}
                    value={t.notiz}
                    onChange={(e) => updateRow(t.id, { notiz: e.target.value })}
                    disabled={disabled}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Mitarbeiter</Label>
                  <MitarbeiterRows
                    rows={t.mitarbeiter}
                    onChange={(mitarbeiter) => updateRow(t.id, { mitarbeiter })}
                    disabled={disabled}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Material</Label>
                  <PauschalenChips
                    onAdd={(material) =>
                      updateRow(t.id, { materialien: [...t.materialien, material] })
                    }
                    disabled={disabled}
                  />
                  <MaterialRows
                    rows={t.materialien}
                    onChange={(materialien) => updateRow(t.id, { materialien })}
                    disabled={disabled}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
        Teilleistung hinzufügen
      </Button>
    </div>
  );
}

function formatSummary(t: Teilleistung): string {
  const parts: string[] = [];
  parts.push(formatDate(t.datum));
  if (t.mitarbeiter.length > 0) parts.push(`${t.mitarbeiter.length} MA`);
  if (t.materialien.length > 0) parts.push(`${t.materialien.length} Pos.`);
  return parts.join(' · ');
}

function formatDate(iso: string): string {
  if (!iso) return '';
  // YYYY-MM-DD -> DD.MM.YYYY
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}
