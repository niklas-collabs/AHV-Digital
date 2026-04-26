import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { LoginPage } from '@/pages/LoginPage';
import { SetupPage } from '@/pages/SetupPage';
import { HomePage } from '@/pages/HomePage';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { Toaster } from '@/components/ui/sonner';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<PublicGate kind="setup" />} />
        <Route path="/login" element={<PublicGate kind="login" />} />
        <Route element={<ProtectedGate />}>
          <Route path="/" element={<HomePage />} />
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
  // kind === 'login'
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
