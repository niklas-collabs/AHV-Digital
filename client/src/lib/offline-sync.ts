import { ApiError } from './api';
import {
  type QueuedMutation,
  listQueue,
  removeFromQueue,
  removePendingEntity,
  updateQueueItem,
} from './offline-store';

/**
 * Maximal Versuche pro Queue-Item bevor wir aufgeben. 4xx-Fehler zählen
 * als "endgültig" — die Mutation hat einen Bug oder ein Datenproblem,
 * Retry hilft nichts.
 */
const MAX_ATTEMPTS = 5;

export interface SyncResult {
  ok: number;
  failed: number;
  giveUp: number;
}

let running = false;

/**
 * Arbeitet die Mutations-Queue der Reihe nach ab. Wenn ein Item ein
 * 4xx liefert, wird es als "endgültig fehlgeschlagen" gemerkt und nach
 * MAX_ATTEMPTS verworfen — der Server hat klar gesagt, dass es nicht
 * geht (z.B. Auftrag schon gelöscht).
 *
 * Concurrent-Safe: bei parallelem Aufruf läuft nur eine Instanz.
 *
 * onAfter: Callback nach erfolgter Synchronisierung — typischerweise zum
 * Invalidieren von TanStack-Query-Caches.
 */
export async function syncQueue(
  onAfter?: (item: QueuedMutation) => Promise<void> | void,
): Promise<SyncResult> {
  if (running) return { ok: 0, failed: 0, giveUp: 0 };
  running = true;

  const result: SyncResult = { ok: 0, failed: 0, giveUp: 0 };
  try {
    const items = await listQueue();
    for (const item of items) {
      const success = await trySync(item);
      if (success) {
        await removeFromQueue(item.id!);
        // Pending-Entity (falls Create-Mutation) auch entfernen
        const tempId = (item.body as { _tempId?: string } | null)?._tempId;
        if (tempId) {
          await removePendingEntity(tempId);
        }
        result.ok++;
        if (onAfter) await onAfter(item);
      } else if (item.attempts >= MAX_ATTEMPTS) {
        await removeFromQueue(item.id!);
        if (item.body && typeof item.body === 'object' && '_tempId' in item.body) {
          const tempId = (item.body as { _tempId?: string })._tempId;
          if (tempId) await removePendingEntity(tempId);
        }
        result.giveUp++;
      } else {
        result.failed++;
      }
    }
  } finally {
    running = false;
  }
  return result;
}

async function trySync(item: QueuedMutation): Promise<boolean> {
  try {
    const init: RequestInit = {
      method: item.method,
      credentials: 'include',
    };
    if (item.body !== null) {
      init.headers = { 'Content-Type': 'application/json' };
      // _tempId ist nur intern — wegfiltern vor dem Senden
      const cleanBody = stripTempMarker(item.body);
      init.body = JSON.stringify(cleanBody);
    }
    const res = await fetch(item.path, init);

    if (res.ok) return true;

    // 4xx → endgültiger Fehler. Wir incrementen attempts auf MAX, damit
    // syncQueue ihn rauswirft. 5xx → retry-fähig.
    if (res.status >= 400 && res.status < 500) {
      const text = await res.text().catch(() => '');
      const updated: QueuedMutation = {
        ...item,
        attempts: MAX_ATTEMPTS,
        lastError: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
      await updateQueueItem(updated);
      return false;
    }

    const updated: QueuedMutation = {
      ...item,
      attempts: item.attempts + 1,
      lastError: `HTTP ${res.status}`,
    };
    await updateQueueItem(updated);
    return false;
  } catch (err) {
    // Netzwerk-Fehler (typischerweise offline) — kein Retry-Increment,
    // sondern Abbruch. Der nächste Online-Event triggert uns neu.
    const updated: QueuedMutation = {
      ...item,
      attempts: item.attempts + 1,
      lastError: err instanceof Error ? err.message : String(err),
    };
    if (item.id !== undefined) {
      await updateQueueItem(updated);
    }
    return false;
  }
}

/** Entfernt das _tempId-Marker-Feld vor dem Schicken an den Server. */
function stripTempMarker(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...(body as Record<string, unknown>) };
  delete copy._tempId;
  return copy;
}

export type { QueuedMutation };
export { ApiError };
