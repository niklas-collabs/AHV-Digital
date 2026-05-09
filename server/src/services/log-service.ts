import type Database from 'better-sqlite3';
import type { LogEntry } from '@ahv/shared';

export interface LogEventInput {
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  message?: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Schreibt einen Eintrag in die log-Tabelle (Aktionsprotokoll). Die UI für
 * den Log kommt in Phase 3.8 — bis dahin füllen wir die Tabelle stillschweigend.
 */
export function recordLog(db: Database.Database, input: LogEventInput): void {
  db.prepare(
    `INSERT INTO log (timestamp, action, entity_type, entity_id, message, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    input.action,
    input.entity_type ?? null,
    input.entity_id ?? null,
    input.message ?? '',
    input.metadata ? JSON.stringify(input.metadata) : null,
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
  }));
}
