import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

/**
 * Layout für die geschützten Top-Level-Seiten (Aufträge, Kunden, Settings).
 * Sub-Seiten wie das Auftrag-Formular nutzen dieses Layout NICHT — die haben
 * ihre eigene Sticky-Action-Bar und brauchen keine zusätzliche Bottom-Nav.
 *
 * pb-20 sorgt dafür, dass Content nicht hinter der fixierten BottomNav liegt.
 */
export function AuthenticatedLayout() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}
