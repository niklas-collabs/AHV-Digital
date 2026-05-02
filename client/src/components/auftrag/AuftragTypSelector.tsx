import { ClipboardList, FileText, Package } from 'lucide-react';
import type { AuftragTyp } from '@ahv/shared';
import { Button } from '@/components/ui/button';

interface AuftragTypSelectorProps {
  value: AuftragTyp;
  onChange: (typ: AuftragTyp) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{ typ: AuftragTyp; label: string; icon: typeof FileText }> = [
  { typ: 'arbeitszettel', label: 'Arbeitszettel', icon: ClipboardList },
  { typ: 'angebot', label: 'Angebot', icon: FileText },
  { typ: 'lieferschein', label: 'Lieferschein', icon: Package },
];

export function AuftragTypSelector({ value, onChange, disabled }: AuftragTypSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ typ, label, icon: Icon }) => (
        <Button
          key={typ}
          type="button"
          variant={value === typ ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(typ)}
          disabled={disabled}
          className="h-auto flex-col gap-1 py-2 text-xs"
        >
          <Icon className="h-4 w-4" />
          {label}
        </Button>
      ))}
    </div>
  );
}
