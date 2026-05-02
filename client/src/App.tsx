import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { LoginPage } from '@/pages/LoginPage';
import { SetupPage } from '@/pages/SetupPage';
import { HomePage } from '@/pages/HomePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { KundenPage } from '@/pages/KundenPage';
import { AuftraegePage } from '@/pages/AuftraegePage';
import { AuftragFormPage } from '@/pages/AuftragFormPage';
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
          <Route path="/" element={<HomePage />} />
          <Route path="/kunden" element={<KundenPage />} />
          <Route path="/auftraege" element={<AuftraegePage />} />
          <Route path="/auftraege/neu" element={<AuftragFormPage />} />
          <Route path="/auftraege/:id/edit" element={<AuftragFormPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

function ProtectedGate() {
  const { data, isLoading, isError } = useAuthStatus();
  if (isLoading) return <FullScreenLoader />;
  if (isError || !data) return <Navigate to="/login" replace />;
  if (data.needsSetup) return <Navigate to="/setup" replace />;
  if (!data.authenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
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
