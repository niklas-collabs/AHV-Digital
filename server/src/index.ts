import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { HealthResponse } from '@ahv/shared';
import { getDb, resolveDbPath } from './db/client.js';
import { runMigrations } from './db/migrations/runner.js';
import { startBackupCron } from './services/backup-service.js';
import { auftragRouter } from './routes/auftrag.js';
import { authRouter } from './routes/auth.js';
import { configRouter } from './routes/config.js';
import { kundeRouter } from './routes/kunde.js';
import { logoRouter } from './routes/logo.js';
import { pauschaleRouter } from './routes/pauschale.js';
import { stufeRouter } from './routes/stufe.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { logger } from './lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const isDev = process.env.NODE_ENV !== 'production';

// === DB initialisieren + Migrations beim Start ===
const db = getDb();
const migrationResult = runMigrations(db);
if (migrationResult.applied.length > 0) {
  logger.info('migrations.applied', { files: migrationResult.applied });
} else {
  logger.info('migrations.up_to_date', { skipped: migrationResult.skipped.length });
}

// === Backup-Cron registrieren ===
const dbPath = resolveDbPath();
const backupDir = path.join(path.dirname(dbPath), 'backups');
startBackupCron(dbPath, backupDir);
logger.info('backup.scheduled', { schedule: '0 3 * * * UTC', dir: backupDir });

// === Express ===
const app = express();
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

if (isDev) {
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}

// === Public-Routen (kein Auth) ===
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

app.use('/api/auth', authRouter);

// === Geschuetzte Routen — alles unter /api ab hier braucht Auth ===
app.use('/api', requireAuth);

app.use('/api/config', configRouter);
app.use('/api/logo', logoRouter);
app.use('/api/stufen', stufeRouter);
app.use('/api/pauschalen', pauschaleRouter);
app.use('/api/kunden', kundeRouter);
app.use('/api/auftraege', auftragRouter);
// (1.8 ergaenzt /api/auftraege/:id/pdf)

// === Static-Serve (Production) ===
if (!isDev) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    logger.warn('client_dist_missing', { path: clientDist });
  }
}

// === Error-Handler ganz am Ende ===
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info('server.started', { port: PORT, mode: isDev ? 'dev' : 'prod' });
});
