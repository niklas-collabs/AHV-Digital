import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'ahv-offline';
const DB_VERSION = 1;

const STORE_QUEUE = 'mutation-queue';
const STORE_PENDING_ENTITIES = 'pending-entities';

export interface QueuedMutation {
  /** Auto-Increment, sequenziell — bestimmt die Sync-Reihenfolge */
  id?: number;
  /** Erstellt-Timestamp (ISO) */
  createdAt: string;
  /** Eindeutige Operation, fürs UI z.B. „Auftrag anlegen" */
  label: string;
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  /** JSON-Body (oder null bei DELETE) */
  body: unknown | null;
  /** TanStack-Query-Keys, die nach erfolgreichem Sync invalidiert werden */
  invalidateKeys: string[][];
  /** Zähler für Retry-Versuche */
  attempts: number;
  /** Letzter Fehler (nur informativ) */
  lastError?: string | null;
}

export interface PendingEntity {
  /** Temp-ID (clientseitig generiert, beginnt mit "tmp:") */
  id: string;
  /** Entity-Typ — wird zum Filtern in der UI verwendet */
  type: 'auftrag' | 'kunde';
  /** Snapshot des erzeugten Objekts (so wie es vom Server kommen würde) */
  data: unknown;
  createdAt: string;
}

interface AhvOfflineDB {
  [STORE_QUEUE]: {
    key: number;
    value: QueuedMutation;
    indexes: { 'by-createdAt': string };
  };
  [STORE_PENDING_ENTITIES]: {
    key: string;
    value: PendingEntity;
    indexes: { 'by-type': string };
  };
}

let dbPromise: Promise<IDBPDatabase<AhvOfflineDB>> | null = null;

function getDb(): Promise<IDBPDatabase<AhvOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AhvOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const store = db.createObjectStore(STORE_QUEUE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by-createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(STORE_PENDING_ENTITIES)) {
          const store = db.createObjectStore(STORE_PENDING_ENTITIES, {
            keyPath: 'id',
          });
          store.createIndex('by-type', 'type');
        }
      },
    });
  }
  return dbPromise;
}

// === Queue ===

export async function enqueueMutation(
  mutation: Omit<QueuedMutation, 'id' | 'attempts'>,
): Promise<number> {
  const db = await getDb();
  return db.add(STORE_QUEUE, { ...mutation, attempts: 0 });
}

export async function listQueue(): Promise<QueuedMutation[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_QUEUE, 'by-createdAt');
}

export async function removeFromQueue(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_QUEUE, id);
}

export async function updateQueueItem(item: QueuedMutation): Promise<void> {
  if (item.id === undefined) return;
  const db = await getDb();
  await db.put(STORE_QUEUE, item);
}

export async function clearQueue(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_QUEUE);
}

export async function queueLength(): Promise<number> {
  const db = await getDb();
  return db.count(STORE_QUEUE);
}

// === Pending Entities (optimistic) ===

export function makeTempId(): string {
  // Stabile aber eindeutige ID — geht NICHT durch Zod auf der Serverseite
  // (UUID-Regex), wird aber clientseitig als Marker erkannt.
  return `tmp:${crypto.randomUUID()}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith('tmp:');
}

export async function addPendingEntity(entity: PendingEntity): Promise<void> {
  const db = await getDb();
  await db.put(STORE_PENDING_ENTITIES, entity);
}

export async function getPendingEntities(
  type: PendingEntity['type'],
): Promise<PendingEntity[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_PENDING_ENTITIES, 'by-type', type);
}

export async function getPendingEntity(id: string): Promise<PendingEntity | null> {
  const db = await getDb();
  const e = await db.get(STORE_PENDING_ENTITIES, id);
  return e ?? null;
}

export async function removePendingEntity(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_PENDING_ENTITIES, id);
}
