import type { Auftrag } from '@ahv/shared';
import { ApiError } from './api';
import {
  addPendingEntity,
  enqueueMutation,
  isTempId,
  listQueue,
  makeTempId,
  removeFromQueue,
  removePendingEntity,
  type PendingEntity,
} from './offline-store';

const INVALIDATE_AUFTRAEGE = [['auftraege']];

/**
 * Wirft den Request normal — bei echtem Netzwerk-/Offline-Fehler
 * landet er in der Queue und resolve mit einem optimistic Result.
 *
 * Wir unterscheiden hier zwischen "navigator.onLine === false" und
 * "fetch schlägt fehl" — beides sollte das gleiche Verhalten haben.
 */
async function tryFetch(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: unknown | null,
): Promise<Response | 'offline'> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'offline';
  }
  try {
    const init: RequestInit = { method, credentials: 'include' };
    if (body !== null) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    return await fetch(path, init);
  } catch {
    return 'offline';
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(
      res.status,
      err.code ?? 'UNKNOWN',
      err.error ?? `HTTP ${res.status}`,
      data as Record<string, unknown>,
    );
  }
  return data as T;
}

// ============================================================================
// Auftrag-spezifische Wrapper
// ============================================================================

/**
 * Erstellt einen Auftrag online — oder legt ihn in der Queue ab, wenn
 * offline. Im Offline-Fall liefert er einen synthetischen Auftrag mit
 * Temp-ID (für optimistische UI), der nach dem Sync ersetzt wird.
 */
export async function createAuftragOnlineOrQueue(
  input: Record<string, unknown>,
): Promise<Auftrag> {
  const res = await tryFetch('/api/auftraege', 'POST', input);
  if (res !== 'offline') {
    return parseResponse<Auftrag>(res);
  }

  // Offline: synthetischen Auftrag bauen + Queue + Pending-Cache
  const tempId = makeTempId();
  const now = new Date().toISOString();
  const optimistic: Auftrag = {
    id: tempId,
    typ: (input.typ as Auftrag['typ']) ?? 'arbeitszettel',
    status: 'entwurf',
    titel: (input.titel as string) ?? '',
    datum: (input.datum as string) ?? now.slice(0, 10),
    beschreibung: (input.beschreibung as string) ?? '',
    notiz_intern: (input.notiz_intern as string) ?? '',
    kunde_id: (input.kunde_id as string | null) ?? null,
    kunde_snapshot: {
      typ: 'privat',
      firmenname: null,
      vorname: '',
      nachname: '',
      email: null,
      strasse: null,
      plz: null,
      ort: null,
    },
    objekt_adresse: (input.objekt_adresse as string | null) ?? null,
    mitarbeiter: (input.mitarbeiter as Auftrag['mitarbeiter']) ?? [],
    materialien: (input.materialien as Auftrag['materialien']) ?? [],
    fotos: [],
    signature_data_url: (input.signature_data_url as string | null) ?? null,
    checkliste: (input.checkliste as Auftrag['checkliste']) ?? null,
    teilleistungen: (input.teilleistungen as Auftrag['teilleistungen']) ?? [],
    urspruenglicher_auftrag_id: null,
    lexoffice_invoice_id: null,
    erstellt_am: now,
    geaendert_am: now,
    abgeschickt_am: null,
  };

  await enqueueMutation({
    createdAt: now,
    label: `Auftrag anlegen: ${optimistic.titel || '(ohne Titel)'}`,
    method: 'POST',
    path: '/api/auftraege',
    body: { ...input, _tempId: tempId },
    invalidateKeys: INVALIDATE_AUFTRAEGE,
  });
  await addPendingEntity({
    id: tempId,
    type: 'auftrag',
    data: optimistic,
    createdAt: now,
  });

  return optimistic;
}

/** Aktualisiert einen Auftrag — online direkt, offline in Queue. */
export async function updateAuftragOnlineOrQueue(
  id: string,
  input: Record<string, unknown>,
): Promise<Auftrag | null> {
  if (isTempId(id)) {
    // Auftrag noch nicht synchronisiert → wir editieren das Pending-Entity
    // direkt im Store. Da unser optimistic UI das aber aktuell nicht
    // unterstützt (Pending = readonly bis Sync), werfen wir explizit.
    throw new ApiError(
      409,
      'PENDING_SYNC',
      'Auftrag wurde noch nicht synchronisiert — Bearbeitung möglich, sobald Verbindung wieder da ist',
    );
  }

  const res = await tryFetch(`/api/auftraege/${encodeURIComponent(id)}`, 'PUT', input);
  if (res !== 'offline') {
    return parseResponse<Auftrag>(res);
  }

  await enqueueMutation({
    createdAt: new Date().toISOString(),
    label: `Auftrag aktualisieren: ${(input.titel as string) || id.slice(0, 8)}`,
    method: 'PUT',
    path: `/api/auftraege/${encodeURIComponent(id)}`,
    body: input,
    invalidateKeys: [['auftraege'], ['auftraege', id]],
  });
  // Kein optimistic Auftrag-Object — der bestehende Cache-Eintrag bleibt
  // sichtbar, die Mutation gilt erst nach Sync.
  return null;
}

export async function deleteAuftragOnlineOrQueue(id: string): Promise<{ ok: true }> {
  if (isTempId(id)) {
    // Temp-Auftrag: noch nicht hochgeladen. Wir entfernen direkt das
    // pending-Entity und die zugehörige POST-Mutation aus der Queue —
    // der Server muss das nie sehen.
    await removePendingEntity(id);
    const queue = await listQueue();
    for (const q of queue) {
      const tempInBody = (q.body as { _tempId?: string } | null)?._tempId;
      if (tempInBody === id && q.id !== undefined) {
        await removeFromQueue(q.id);
      }
    }
    return { ok: true };
  }

  const res = await tryFetch(`/api/auftraege/${encodeURIComponent(id)}`, 'DELETE', null);
  if (res !== 'offline') {
    await parseResponse<{ ok: true }>(res);
    return { ok: true };
  }

  await enqueueMutation({
    createdAt: new Date().toISOString(),
    label: `Auftrag löschen: ${id.slice(0, 8)}`,
    method: 'DELETE',
    path: `/api/auftraege/${encodeURIComponent(id)}`,
    body: null,
    invalidateKeys: INVALIDATE_AUFTRAEGE,
  });
  return { ok: true };
}

export type { PendingEntity };
