import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import cron from 'node-cron';

const RETENTION_DAYS = 30;
const BACKUP_FILE_PATTERN = /^ahv-\d{4}-\d{2}-\d{2}\.db$/;

export interface BackupResult {
  backupFile: string | null;
  deleted: string[];
}

/**
 * Kopiert die SQLite-Datei in <backupDir>/ahv-YYYY-MM-DD.db und löscht
 * Backups die aelter als RETENTION_DAYS Tage sind. Idempotent — laeuft an
 * jedem Tag erneut, überschreibt das aktuelle Datum.
 */
export function runBackup(dbPath: string, backupDir: string): BackupResult {
  if (!existsSync(dbPath)) {
    return { backupFile: null, deleted: [] };
  }

  mkdirSync(backupDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const backupFile = path.join(backupDir, `ahv-${today}.db`);
  copyFileSync(dbPath, backupFile);

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
 * Plant das tägliche Backup um 03:00 UTC. Liefert die node-cron-Task zurück,
 * damit Tests und Tear-Down sie stoppen können.
 */
export function startBackupCron(dbPath: string, backupDir: string): cron.ScheduledTask {
  const task = cron.schedule(
    '0 3 * * *',
    () => {
      try {
        const result = runBackup(dbPath, backupDir);
        if (result.backupFile) {
          console.log(`[backup] erstellt: ${path.basename(result.backupFile)}`);
        }
        if (result.deleted.length > 0) {
          console.log(`[backup] ${result.deleted.length} alte Backup(s) gelöscht`);
        }
      } catch (err) {
        console.error('[backup] fehlgeschlagen:', err);
      }
    },
    { timezone: 'UTC' },
  );

  return task;
}
