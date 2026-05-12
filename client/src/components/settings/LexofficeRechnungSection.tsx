import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useConfig, useSetConfig } from '@/hooks/useConfig';

const DEFAULT_TEMPLATE =
  'Im Bruttobetrag sind {lohnkosten_brutto} Lohnkosten enthalten.\nDie darin enthaltene Umsatzsteuer beträgt {lohnkosten_ust}.';
const DEFAULT_LOHN_MWST = 19;

/**
 * Stellt das Footer-Template (Lohnkosten-Hinweis) und den MwSt-Satz auf
 * Arbeitsstunden ein. Wird beim Lexoffice-Push verwendet.
 */
export function LexofficeRechnungSection() {
  const { data: config, isLoading } = useConfig();
  const setTemplateConfig = useSetConfig('lexoffice_footer_template');
  const setMwstConfig = useSetConfig('lexoffice_lohn_mwst');

  const [template, setTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [mwst, setMwst] = useState<number>(DEFAULT_LOHN_MWST);

  useEffect(() => {
    if (config?.lexoffice_footer_template) {
      setTemplate(config.lexoffice_footer_template);
    }
    if (typeof config?.lexoffice_lohn_mwst === 'number') {
      setMwst(config.lexoffice_lohn_mwst);
    }
  }, [config]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Lädt …</p>;

  const isPending = setTemplateConfig.isPending || setMwstConfig.isPending;

  const saveTemplate = () => {
    setTemplateConfig.mutate(template, {
      onSuccess: () => toast.success('Footer-Template gespeichert'),
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Fehler'),
    });
  };

  const saveMwst = () => {
    setMwstConfig.mutate(mwst, {
      onSuccess: () => toast.success(`MwSt auf Arbeit: ${mwst}%`),
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Fehler'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="lex-template">Lohnkosten-Hinweis</Label>
        <Textarea
          id="lex-template"
          rows={3}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Erscheint als Nachbemerkung in der Lexoffice-Rechnung. Platzhalter:{' '}
          <code className="rounded bg-muted px-1">{'{lohnkosten_brutto}'}</code>,{' '}
          <code className="rounded bg-muted px-1">{'{lohnkosten_ust}'}</code>,{' '}
          <code className="rounded bg-muted px-1">{'{lohnkosten_netto}'}</code>.
        </p>
        <Button size="sm" onClick={saveTemplate} disabled={isPending}>
          Speichern
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lex-mwst">MwSt-Satz auf Arbeitsstunden (%)</Label>
        <div className="flex gap-2">
          <Input
            id="lex-mwst"
            type="number"
            min="0"
            max="100"
            step="1"
            value={mwst}
            onChange={(e) => setMwst(parseFloat(e.target.value) || 0)}
            className="max-w-32"
          />
          <Button size="sm" onClick={saveMwst} disabled={isPending}>
            Speichern
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Wird auf Mitarbeiter-Stunden angewendet. Standard: 19% (SHK in
          Deutschland). Pauschalen behalten ihren eigenen MwSt-Satz.
        </p>
      </div>
    </div>
  );
}
