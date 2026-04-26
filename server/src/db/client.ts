import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

let dbInstance: Database.Database | null = null;

/**
 * Liefert die SQLite-Datenbank als Singleton. Beim ersten Aufruf wird die
 * Datei geoeffnet (falls noetig erstellt), das Verzeichnis sichergestellt
 * und die ueblichen PRAGMAs gesetzt.
 *
 * DB-Pfad kommt aus DB_PATH (env), default `data/ahv.db` relativ zum
 * Arbeitsverzeichnis.
 */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbPath = resolveDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function resolveDbPath(): string {
  return process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'ahv.db');
}

/**
 * Verzeichnis fuer hochgeladene Dateien (Logo, Fotos). Default: data/uploads
 * relativ zum DB-Verzeichnis. Override via UPLOADS_DIR env var.
 */
export function resolveUploadsDir(): string {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
  return path.join(path.dirname(resolveDbPath()), 'uploads');
}

/**
 * Ueberschreibt das Singleton (nur fuer Tests).
 */
export function _setDbForTests(db: Database.Database | null): void {
  dbInstance = db;
}
