import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { HealthResponse } from '@ahv/shared';
import { getDb, resolveDbPath } from './db/client.js';
import { runMigrations } from './db/migrations/runner.js';
import { startBackupCron } from './services/backup-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const isDev = process.env.NODE_ENV !== 'production';

// === DB initialisieren + Migrations beim Start ===
const db = getDb();
const migrationResult = runMigrations(db);
if (migrationResult.applied.length > 0) {
  console.log(`[migrations] applied: ${migrationResult.applied.join(', ')}`);
} else {
  console.log(`[migrations] up to date (${migrationResult.skipped.length} schon angewandt)`);
}

// === Backup-Cron registrieren ===
const dbPath = resolveDbPath();
const backupDir = path.join(path.dirname(dbPath), 'backups');
startBackupCron(dbPath, backupDir);
console.log(`[backup] cron registriert (taeglich 03:00 UTC) — Ziel: ${backupDir}`);

// === Express ===
const app = express();
app.use(express.json({ limit: '10mb' }));

if (isDev) {
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}

// API-Routen
app.get('/api/health', (_req, res) => {
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    db.prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }
  const body: HealthResponse = {
    ok: true,
    service: 'ahv-digital',
    version: '0.1.0',
    db: dbStatus,
  };
  res.json(body);
});

// In Production: gebauten Client servieren + SPA-Fallback.
if (!isDev) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    console.warn(`[ahv-digital] client/dist nicht gefunden unter ${clientDist}`);
  }
}

app.listen(PORT, () => {
  const mode = isDev ? 'dev' : 'prod';
  console.log(`[ahv-digital] Server laeuft auf http://localhost:${PORT} (${mode})`);
});
