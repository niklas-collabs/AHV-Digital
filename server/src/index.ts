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
import { checkAndSendWartungsReminder, initWebPush } from './services/push-service.js';
import cron from 'node-cron';
import { anlageRouter } from './routes/anlage.js';
import { auftragRouter } from './routes/auftrag.js';
import { authRouter } from './routes/auth.js';
import { backupRouter } from './routes/backup.js';
import { benutzerRouter } from './routes/benutzer.js';
import { checklisteRouter } from './routes/checkliste.js';
import { configRouter } from './routes/config.js';
import { kundeRouter } from './routes/kunde.js';
import { lexofficeRouter } from './routes/lexoffice.js';
import { logRouter } from './routes/log.js';
import { logoRouter } from './routes/logo.js';
import { mailRouter } from './routes/mail.js';
import { pauschaleRouter } from './routes/pauschale.js';
import { plzRouter } from './routes/plz.js';
import { pushRouter } from './routes/push.js';
import { stufeRouter } from './routes/stufe.js';
import { vorlageRouter } from './routes/vorlage.js';
import { wartungRouter } from './routes/wartung.js';
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

// === Push-Notifications: VAPID-Keys initialisieren ===
// Subject = mailto-Adresse oder URL für VAPID; in Production die echte
// App-URL, sonst Fallback. Wird bei jedem Push als "from" mitgeschickt.
const pushSubject = process.env.PUSH_SUBJECT ?? 'mailto:noreply@example.com';
initWebPush(db, pushSubject);
logger.info('push.initialized', { subject: pushSubject });

// === Wartungs-Reminder-Cron ===
// Täglich 07:00 lokale Zeit (Europe/Berlin), prüft fällige Wartungspläne
// und schickt Push-Notifications.
cron.schedule(
  '0 7 * * *',
  async () => {
    try {
      const result = await checkAndSendWartungsReminder(db);
      if (result.totalSent > 0) {
        logger.info('push.wartung_sent', result);
      }
    } catch (err) {
      logger.error('push.wartung_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
  { timezone: 'Europe/Berlin' },
);
logger.info('push.scheduled', { schedule: '0 7 * * * Europe/Berlin' });

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

app.use('/api/benutzer', benutzerRouter);
app.use('/api/config', configRouter);
app.use('/api/logo', logoRouter);
app.use('/api/stufen', stufeRouter);
app.use('/api/pauschalen', pauschaleRouter);
app.use('/api/kunden', kundeRouter);
app.use('/api/auftraege', auftragRouter);
app.use('/api/lexoffice', lexofficeRouter);
app.use('/api/mail', mailRouter);
app.use('/api/vorlagen', vorlageRouter);
app.use('/api/checklisten', checklisteRouter);
app.use('/api/wartung', wartungRouter);
app.use('/api/anlagen', anlageRouter);
app.use('/api/log', logRouter);
app.use('/api/plz', plzRouter);
app.use('/api/push', pushRouter);
app.use('/api/backups', backupRouter);
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
