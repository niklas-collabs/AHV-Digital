import { Suspense, lazy, useEffect, useState, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { LoginPage } from '@/pages/LoginPage';
import { SetupPage } from '@/pages/SetupPage';
import { AuthenticatedLayout } from '@/components/AuthenticatedLayout';
import { GlobalSearch } from '@/components/GlobalSearch';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmDialogHost } from '@/components/ui/confirm-dialog';
import { applyThemeToDocument, useThemeStore } from '@/stores/theme-store';

// Code-Splitting: Jede Seite wird erst geladen, wenn sie aufgerufen wird.
// Das hält den Initial-Bundle klein — wichtig auf dem Handy/Baustelle.
const AuftraegePage = lazyPage(() => import('@/pages/AuftraegePage'), 'AuftraegePage');
const AuftragFormPage = lazyPage(() => import('@/pages/AuftragFormPage'), 'AuftragFormPage');
const KundenPage = lazyPage(() => import('@/pages/KundenPage'), 'KundenPage');
const KundeDetailPage = lazyPage(() => import('@/pages/KundeDetailPage'), 'KundeDetailPage');
const WartungPage = lazyPage(() => import('@/pages/WartungPage'), 'WartungPage');
const AnlagenPage = lazyPage(() => import('@/pages/AnlagenPage'), 'AnlagenPage');
const AnlageDetailPage = lazyPage(() => import('@/pages/AnlageDetailPage'), 'AnlageDetailPage');
const StatistikPage = lazyPage(() => import('@/pages/StatistikPage'), 'StatistikPage');
const ProtokollPage = lazyPage(() => import('@/pages/ProtokollPage'), 'ProtokollPage');
const SettingsPage = lazyPage(() => import('@/pages/SettingsPage'), 'SettingsPage');

// Hilfsfunktion: React.lazy erwartet einen default-Export, unsere Pages
// nutzen named exports — hier wird umgemappt.
function lazyPage<T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[name] as ComponentType };
  });
}

export function App() {
  // Theme-Klasse auf <html> aktuell halten
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route path="/setup" element={<PublicGate kind="setup" />} />
          <Route path="/login" element={<PublicGate kind="login" />} />

          <Route element={<ProtectedGate />}>
            {/* Top-Level-Seiten mit Bottom-Nav */}
            <Route element={<AuthenticatedLayout />}>
              <Route path="/" element={<Navigate to="/auftraege" replace />} />
              <Route path="/auftraege" element={<AuftraegePage />} />
              <Route path="/kunden" element={<KundenPage />} />
              <Route path="/kunden/:id" element={<KundeDetailPage />} />
              <Route path="/wartung" element={<WartungPage />} />
              <Route path="/anlagen" element={<AnlagenPage />} />
              <Route path="/anlagen/:id" element={<AnlageDetailPage />} />
              <Route path="/qr/:id" element={<AnlageDetailPage />} />
              <Route path="/statistik" element={<StatistikPage />} />
              <Route path="/protokoll" element={<ProtokollPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            {/* Sub-Seiten ohne Bottom-Nav (Vollbild + eigene Action-Bar) */}
            <Route path="/auftraege/neu" element={<AuftragFormPage />} />
            <Route path="/auftraege/:id/edit" element={<AuftragFormPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
      <ConfirmDialogHost />
    </BrowserRouter>
  );
}

function ProtectedGate() {
  const { data, isLoading, isError } = useAuthStatus();
  const [searchOpen, setSearchOpen] = useState(false);
  // Offline-Queue beim Mount durchstarten und bei online-Events abarbeiten
  useOfflineSync();

  // Globaler Hotkey: Ctrl/Cmd+K öffnet die Suche (Desktop).
  // Mobile öffnen Pages via window.dispatchEvent(new CustomEvent('ahv:open-search')).
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    const openHandler = () => setSearchOpen(true);
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('ahv:open-search', openHandler);
    return () => {
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('ahv:open-search', openHandler);
    };
  }, []);

  if (isLoading) return <FullScreenLoader />;
  if (isError || !data) return <Navigate to="/login" replace />;
  if (data.needsSetup) return <Navigate to="/setup" replace />;
  if (!data.authenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <OfflineIndicator />
      <Outlet />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

interface PublicGateProps {
  kind: 'login' | 'setup';
}

function PublicGate({ kind }: PublicGateProps) {
  const { data, isLoading } = useAuthStatus();
  if (isLoading) return <FullScreenLoader />;
  if (!data) return kind === 'login' ? <LoginPage /> : <SetupPage />;

  if (kind === 'setup') {
    if (!data.needsSetup) return <Navigate to={data.authenticated ? '/' : '/login'} replace />;
    return <SetupPage />;
  }
  if (data.needsSetup) return <Navigate to="/setup" replace />;
  if (data.authenticated) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
