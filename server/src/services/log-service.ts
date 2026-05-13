import type Database from 'better-sqlite3';
import type { LogEntry } from '@ahv/shared';

/**
 * Async-local-Storage-Light: aktuell eingeloggter Benutzer im Request-
 * Scope. Wird vom Express-Middleware-Wrapper gesetzt, der die Routen
 * mit recordLog aufruft. Pragmatisch über ein globales Modul-Feld —
 * passt für single-threaded Node.js und unsere Anwendungsgröße.
 *
 * Vorteil: Service-Funktionen brauchen keinen User-Parameter durch-
 * gereicht werden.
 */
let currentRequestUser: { id: string; name: string } | null = null;

export function setCurrentRequestUser(user: { id: string; name: string } | null): void {
  currentRequestUser = user;
}

export function getCurrentRequestUser(): { id: string; name: string } | null {
  return currentRequestUser;
}

export interface LogEventInput {
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  message?: string;
  metadata?: Record<string, unknown> | null;
  /** Optional: User explizit angeben — sonst wird der currentRequestUser
   *  verwendet. Nutzbar z.B. für Cron-Jobs, die keinen Request-Kontext
   *  haben. */
  user?: { id: string; name: string } | null;
}

/**
 * Schreibt einen Eintrag in die log-Tabelle (Aktionsprotokoll).
 * Falls ein eingeloggter Benutzer den Request gemacht hat, wird sein
 * id/name als Urheber gespeichert.
 */
export function recordLog(db: Database.Database, input: LogEventInput): void {
  const user = input.user !== undefined ? input.user : currentRequestUser;
  db.prepare(
    `INSERT INTO log (timestamp, action, entity_type, entity_id, message, metadata, user_id, user_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    input.action,
    input.entity_type ?? null,
    input.entity_id ?? null,
    input.message ?? '',
    input.metadata ? JSON.stringify(input.metadata) : null,
    user?.id ?? null,
    user?.name ?? null,
  );
}

interface LogRow {
  id: number;
  timestamp: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  message: string;
  metadata: string | null;
  user_id: string | null;
  user_name: string | null;
}

export function listLog(db: Database.Database, limit = 100): LogEntry[] {
  const rows = db
    .prepare('SELECT * FROM log ORDER BY id DESC LIMIT ?')
    .all(limit) as LogRow[];
  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    message: r.message,
    metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null,
    user_id: r.user_id,
    user_name: r.user_name,
  }));
}
