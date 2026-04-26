import { Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  disabled?: boolean;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad({ value, onChange, maxLength = 4, disabled = false }: PinPadProps) {
  const append = (digit: string) => {
    if (value.length < maxLength) onChange(value + digit);
  };
  const backspace = () => {
    if (value.length > 0) onChange(value.slice(0, -1));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-center gap-3">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 w-4 rounded-full border-2 transition-colors',
              i < value.length ? 'border-primary bg-primary' : 'border-muted-foreground/40',
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((d) => (
          <Button
            key={d}
            type="button"
            variant="outline"
            size="lg"
            disabled={disabled}
            onClick={() => append(d)}
            className="h-14 text-xl font-semibold"
          >
            {d}
          </Button>
        ))}
        <span />
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={disabled}
          onClick={() => append('0')}
          className="h-14 text-xl font-semibold"
        >
          0
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          disabled={disabled || value.length === 0}
          onClick={backspace}
          className="h-14"
          aria-label="Loeschen"
        >
          <Delete className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
