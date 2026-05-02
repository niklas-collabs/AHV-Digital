import type Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default-Verzeichnis für die SQL-Migrations. Funktioniert sowohl im
 * tsx-Dev-Modus (zeigt auf src/.../sql) als auch nach tsc-Build (zeigt auf
 * dist/.../sql — Files werden via scripts/copy-sql.js kopiert).
 */
const DEFAULT_SQL_DIR = path.resolve(__dirname, 'sql');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Liest alle .sql-Dateien aus sqlDir, sortiert sie nach Dateiname und
 * führt jede aus, die noch nicht in `_migrations` registriert ist.
 * Jede Migration laeuft in eigener Transaction; bei Fehler Rollback.
 */
export function runMigrations(
  db: Database.Database,
  sqlDir: string = DEFAULT_SQL_DIR,
): MigrationResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      applied_at  TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>;
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  const files = readdirSync(sqlDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  const insertStmt = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }
    const sql = readFileSync(path.join(sqlDir, file), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      insertStmt.run(file, new Date().toISOString());
    });
    tx();
    applied.push(file);
  }

  return { applied, skipped };
}
