import { Router } from 'express';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { resolveDbPath } from '../db/client.js';
import { isValidBackupName, listBackups, runBackup } from '../services/backup-service.js';
import { logger } from '../lib/logger.js';

function backupDir(): string {
  const dbPath = resolveDbPath();
  return path.join(path.dirname(dbPath), 'backups');
}

export const backupRouter = Router();

backupRouter.get('/', (_req, res, next) => {
  try {
    res.json(listBackups(backupDir()));
  } catch (err) {
    next(err);
  }
});

// Manuelles "Backup jetzt erstellen"
backupRouter.post('/run', async (_req, res, next) => {
  try {
    const result = await runBackup(resolveDbPath(), backupDir());
    res.json(result);
  } catch (err) {
    logger.error('backup.manual_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
});

// Backup-Datei herunterladen
backupRouter.get('/:filename', (req, res, next) => {
  try {
    const filename = req.params.filename;
    if (!isValidBackupName(filename)) {
      res.status(400).json({ error: 'Ungültiger Backup-Name', code: 'INVALID_NAME' });
      return;
    }
    const fullPath = path.join(backupDir(), filename);
    if (!existsSync(fullPath)) {
      res.status(404).json({ error: 'Backup nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(statSync(fullPath).size));
    res.sendFile(fullPath);
  } catch (err) {
    next(err);
  }
});
