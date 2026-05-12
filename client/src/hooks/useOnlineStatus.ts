import { useEffect, useState } from 'react';

/**
 * Reaktives navigator.onLine. Achtung: das Browser-Flag ist nicht 100%
 * verlässlich (manche WLANs ohne Internet zeigen trotzdem online) — wir
 * nutzen es als Hinweis, nicht als harte Wahrheit. Ein fehlgeschlagener
 * Fetch ist immer noch der definitive Test.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
