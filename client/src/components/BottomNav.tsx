import { ClipboardList, Settings, Users, Wrench } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TabConfig {
  to: string;
  icon: typeof ClipboardList;
  label: string;
  disabled?: boolean;
  comingIn?: string;
}

const TABS: TabConfig[] = [
  { to: '/auftraege', icon: ClipboardList, label: 'Aufträge' },
  { to: '/kunden', icon: Users, label: 'Kunden' },
  { to: '/wartung', icon: Wrench, label: 'Wartung' },
  { to: '/settings', icon: Settings, label: 'Mehr' },
];

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-3xl">
        {TABS.map((tab) => (
          <NavTab key={tab.label} {...tab} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({ to, icon: Icon, label, disabled, comingIn }: TabConfig) {
  if (disabled) {
    return (
      <button
        type="button"
        onClick={() => toast.info(`${label} kommt in ${comingIn}`)}
        className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground/60"
      >
        <Icon className="h-5 w-5" />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
          isActive
            ? 'text-primary font-medium'
            : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </NavLink>
  );
}
