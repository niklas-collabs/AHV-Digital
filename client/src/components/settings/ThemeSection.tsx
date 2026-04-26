import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/stores/theme-store';
import { cn } from '@/lib/utils';

export function ThemeSection() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="grid grid-cols-2 gap-3">
      <ThemeButton
        active={theme === 'dark'}
        onClick={() => setTheme('dark')}
        icon={<Moon className="h-5 w-5" />}
        label="Dunkel"
      />
      <ThemeButton
        active={theme === 'light'}
        onClick={() => setTheme('light')}
        icon={<Sun className="h-5 w-5" />}
        label="Hell"
      />
    </div>
  );
}

interface ThemeButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function ThemeButton({ active, onClick, icon, label }: ThemeButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      className={cn('h-14 justify-start gap-3 text-base')}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}
