import { existsSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import cron from 'node-cron';
import Database from 'better-sqlite3';
import { logger } from '../lib/logger.js';

const RETENTION_DAYS = 30;
const BACKUP_FILE_PATTERN = /^ahv-\d{4}-\d{2}-\d{2}\.db$/;

export interface BackupResult {
  backupFile: string | null;
  deleted: string[];
}

/**
 * Erzeugt ein konsistentes SQLite-Backup unter <backupDir>/ahv-YYYY-MM-DD.db
 * und löscht Backups älter als RETENTION_DAYS. Nutzt die better-sqlite3
 * `db.backup()`-API, die WAL-Files mit-checkpointet — copyFileSync würde
 * sonst evtl. ohne -wal/-shm sichern und beim Restore Daten verlieren.
 *
 * Idempotent — überschreibt das aktuelle Datum, falls schon ein Backup
 * für heute existiert.
 */
export async function runBackup(dbPath: string, backupDir: string): Promise<BackupResult> {
  if (!existsSync(dbPath)) {
    return { backupFile: null, deleted: [] };
  }

  mkdirSync(backupDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const backupFile = path.join(backupDir, `ahv-${today}.db`);

  // Eigener read-only-Connect, damit wir keinen Konflikt mit der laufenden
  // App-Instance erzeugen. WAL-Mode ist ohnehin gesetzt — backup() liefert
  // einen sauberen Snapshot.
  const sourceDb = new Database(dbPath, { readonly: true });
  try {
    // Falls von gestern noch ein Datei-Rest da: weg damit, sonst hängt
    // backup() bei manchen Konstellationen.
    if (existsSync(backupFile)) {
      rmSync(backupFile);
    }
    await sourceDb.backup(backupFile);
  } finally {
    sourceDb.close();
  }

  // Retention: alte Backups aufräumen
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const deleted: string[] = [];
  for (const file of readdirSync(backupDir)) {
    if (!BACKUP_FILE_PATTERN.test(file)) continue;
    const filePath = path.join(backupDir, file);
    const stat = statSync(filePath);
    if (stat.mtimeMs < cutoff) {
      unlinkSync(filePath);
      deleted.push(file);
    }
  }

  return { backupFile, deleted };
}

/**
 * Listet alle vorhandenen Backup-Dateien, neueste zuerst. Wird vom
 * Settings-Endpoint gelesen, damit der Nutzer ein Backup runterladen kann.
 */
export function listBackups(
  backupDir: string,
): Array<{ filename: string; size: number; mtime: string }> {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((f) => BACKUP_FILE_PATTERN.test(f))
    .map((filename) => {
      const stat = statSync(path.join(backupDir, filename));
      return {
        filename,
        size: stat.size,
        mtime: new Date(stat.mtimeMs).toISOString(),
      };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

/** Verhindert Path-Traversal beim Download. */
export function isValidBackupName(name: string): boolean {
  return BACKUP_FILE_PATTERN.test(name);
}

/**
 * Plant das tägliche Backup um 03:00 UTC.
 */
export function startBackupCron(dbPath: string, backupDir: string): cron.ScheduledTask {
  const task = cron.schedule(
    '0 3 * * *',
    async () => {
      try {
        const result = await runBackup(dbPath, backupDir);
        if (result.backupFile) {
          logger.info('backup.created', { file: path.basename(result.backupFile) });
        }
        if (result.deleted.length > 0) {
          logger.info('backup.deleted_old', { count: result.deleted.length });
        }
      } catch (err) {
        logger.error('backup.failed', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    { timezone: 'UTC' },
  );

  return task;
}
