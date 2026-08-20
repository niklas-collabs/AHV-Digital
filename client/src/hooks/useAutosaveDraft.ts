import { useEffect, useRef, useState } from 'react';

const STORAGE_PREFIX = 'ahv:auftrag-draft:';
// Entwürfe älter als 14 Tage werden beim Laden gepurged
const MAX_AGE_DAYS = 14;

interface StoredDraft<T> {
  data: T;
  savedAt: string;
}

function key(id: string): string {
  return `${STORAGE_PREFIX}${id}`;
}

/**
 * Speichert den Form-State nach kurzer Inaktivität in localStorage. Beim
 * Schließen des Browsers oder Stromausfall ist die Arbeit nicht weg —
 * beim Wiederöffnen kann der User den lokalen Stand übernehmen.
 *
 * Liefert:
 *  - dirty: true wenn data seit dem letzten Save geändert wurde
 *  - lastSavedAt: ISO-Zeitstempel oder null
 *  - getStoredDraft(): liest einen evtl. vorhandenen Entwurf aus localStorage
 *  - clear(): löscht den Entwurf (z.B. nach erfolgreichem Server-Save)
 *
 * Die `id` identifiziert den Auftrag (UUID für existierende, 'new' für neu).
 */
export function useAutosaveDraft<T>(
  id: string,
  data: T,
  options: { debounceMs?: number; enabled?: boolean } = {},
): {
  dirty: boolean;
  lastSavedAt: string | null;
  getStoredDraft: () => StoredDraft<T> | null;
  clear: () => void;
} {
  const { debounceMs = 1000, enabled = true } = options;
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!enabled) return;
    setDirty(true);
    const t = setTimeout(() => {
      try {
        const payload: StoredDraft<T> = {
          data: dataRef.current,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(key(id), JSON.stringify(payload));
        setLastSavedAt(payload.savedAt);
        setDirty(false);
      } catch {
        // Quota überschritten o.ä. — Fehler ignorieren, nicht abbrechen
      }
    }, debounceMs);
    return () => clearTimeout(t);
  }, [data, id, debounceMs, enabled]);

  // Alte Drafts beim Mount aufräumen
  useEffect(() => {
    if (!enabled) return;
    purgeOldDrafts();
  }, [enabled]);

  return {
    dirty,
    lastSavedAt,
    getStoredDraft: () => {
      const raw = localStorage.getItem(key(id));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StoredDraft<T>;
      } catch {
        return null;
      }
    },
    clear: () => {
      try {
        localStorage.removeItem(key(id));
        setLastSavedAt(null);
      } catch {
        // ignore
      }
    },
  };
}

function purgeOldDrafts(): void {
  try {
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { savedAt?: string };
        if (parsed.savedAt && new Date(parsed.savedAt).getTime() < cutoff) {
          localStorage.removeItem(k);
        }
      } catch {
        // Korrupt → weg damit
        localStorage.removeItem(k);
      }
    }
  } catch {
    // localStorage nicht verfügbar
  }
}
