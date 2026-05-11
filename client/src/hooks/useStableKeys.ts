import { useEffect, useState } from 'react';

/**
 * Hilfshook für Komponenten, die ein Array vom Parent als Prop erhalten und
 * stabile React-Keys brauchen, damit Inputs beim Hinzufügen/Entfernen von
 * Zeilen nicht ihre Werte verlieren oder den Cursor verlieren.
 *
 * - addKey() vor onChange aufrufen, wenn eine Zeile hinzugefügt wird
 * - removeKeyAt(idx) vor onChange aufrufen, wenn eine Zeile entfernt wird
 * - Bei externer Längen-Änderung (z.B. Vorlage geladen) wird die
 *   Schlüsselliste neu gefüllt
 */
export function useStableKeys(currentLength: number): {
  keys: string[];
  addKey: () => void;
  removeKeyAt: (idx: number) => void;
} {
  const [keys, setKeys] = useState<string[]>(() =>
    Array.from({ length: currentLength }, () => crypto.randomUUID()),
  );

  // Re-sync wenn die Länge von außen abweicht (z.B. Daten neu geladen).
  // Wir überschreiben dann komplett — die Reihen sind in dem Fall ohnehin
  // andere Objekte und brauchen frische Keys.
  useEffect(() => {
    if (keys.length !== currentLength) {
      setKeys(Array.from({ length: currentLength }, () => crypto.randomUUID()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLength]);

  const addKey = (): void => {
    setKeys((k) => [...k, crypto.randomUUID()]);
  };

  const removeKeyAt = (idx: number): void => {
    setKeys((k) => k.filter((_, i) => i !== idx));
  };

  return { keys, addKey, removeKeyAt };
}
