import { useCallback, useRef } from 'react';
import { ApiError, apiClient } from '@/lib/api';

interface PlzResult {
  ort: string | null;
  bundesland: string | null;
}

/**
 * Liefert einen lookup(plz)-Callback, der die externe API abfragt und
 * Ergebnisse client-seitig cached. Stille Fehlerbehandlung — wenn die
 * API nicht antwortet, kommt null zurück (kein Toast).
 */
export function usePlzLookup() {
  const cache = useRef(new Map<string, PlzResult | null>());

  const lookup = useCallback(async (plz: string): Promise<PlzResult | null> => {
    if (!/^\d{5}$/.test(plz)) return null;
    const cached = cache.current.get(plz);
    if (cached !== undefined) return cached;
    try {
      const result = await apiClient<PlzResult>(`/api/plz/${plz}`);
      cache.current.set(plz, result);
      return result;
    } catch (err) {
      // 404 / 502 / Netzwerk: stillschweigend ignorieren
      cache.current.set(plz, null);
      if (err instanceof ApiError && err.status >= 500) {
        return null;
      }
      return null;
    }
  }, []);

  return { lookup };
}
