import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { LoginPage } from '@/pages/LoginPage';
import { SetupPage } from '@/pages/SetupPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { KundenPage } from '@/pages/KundenPage';
import { KundeDetailPage } from '@/pages/KundeDetailPage';
import { AuftraegePage } from '@/pages/AuftraegePage';
import { AuftragFormPage } from '@/pages/AuftragFormPage';
import { StatistikPage } from '@/pages/StatistikPage';
import { WartungPage } from '@/pages/WartungPage';
import { AnlagenPage } from '@/pages/AnlagenPage';
import { AnlageDetailPage } from '@/pages/AnlageDetailPage';
import { ProtokollPage } from '@/pages/ProtokollPage';
import { AuthenticatedLayout } from '@/components/AuthenticatedLayout';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { Toaster } from '@/components/ui/sonner';
import { applyThemeToDocument, useThemeStore } from '@/stores/theme-store';

export function App() {
  // Theme-Klasse auf <html> aktuell halten
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return (
    <BrowserRouter>
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
      <Toaster />
    </BrowserRouter>
  );
}

function ProtectedGate() {
  const { data, isLoading, isError } = useAuthStatus();
  const [searchOpen, setSearchOpen] = useState(false);

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
