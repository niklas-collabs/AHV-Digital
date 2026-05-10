import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AuthError } from '../services/auth-service.js';
import { LogoError } from '../services/logo-service.js';
import { AuftragError } from '../services/auftrag-service.js';
import { FotoError } from '../services/foto-service.js';
import { KundeError } from '../services/kunde-service.js';
import { LexofficeServiceError } from '../services/lexoffice-service.js';
import { MailServiceError } from '../services/mail-service.js';
import { PauschaleError } from '../services/pauschale-service.js';
import { StufeError } from '../services/stufe-service.js';
import { VorlageError } from '../services/vorlage-service.js';
import { logger } from '../lib/logger.js';

/**
 * Zentraler Express-Error-Handler. Wandelt bekannte Fehler in JSON-Antworten
 * mit passendem HTTP-Status; alles andere wird als 500 geloggt.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validierung fehlgeschlagen',
      code: 'VALIDATION',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof AuthError) {
    let status = 401;
    if (err.code === 'LOCKED') status = 423;
    else if (err.code === 'NEEDS_SETUP') status = 412;
    else if (err.code === 'INVALID_FORMAT' || err.code === 'OLD_PIN_REQUIRED') status = 400;

    res.status(status).json({
      error: err.message,
      code: err.code,
      ...err.meta,
    });
    return;
  }

  if (err instanceof MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'TOO_LARGE' : 'UPLOAD_ERROR';
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Datei zu gross (max 1 MB)' : err.message;
    res.status(400).json({ error: message, code });
    return;
  }

  if (err instanceof LogoError) {
    res.status(400).json({ error: err.message, code: err.code });
    return;
  }

  if (
    err instanceof StufeError ||
    err instanceof PauschaleError ||
    err instanceof KundeError ||
    err instanceof AuftragError ||
    err instanceof VorlageError
  ) {
    let status: number;
    if (err.code === 'NOT_FOUND') status = 404;
    else if (err.code === 'IN_USE') status = 409;
    else if (err.code === 'TOO_MANY_FOTOS') status = 409;
    else status = 400;
    res.status(status).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof FotoError) {
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof LexofficeServiceError) {
    const status = err.code === 'NO_API_KEY' ? 412 : 502;
    res.status(status).json({ error: err.message, code: err.code, ...err.meta });
    return;
  }

  if (err instanceof MailServiceError) {
    let status: number;
    if (err.code === 'NO_GMAIL_CONFIG' || err.code === 'NO_FIRMA_EMAIL' || err.code === 'NO_RECIPIENT') {
      status = 412;
    } else if (err.code === 'AUTH_FAILED') {
      status = 401;
    } else {
      status = 502;
    }
    res.status(status).json({ error: err.message, code: err.code });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  logger.error('unhandled_error', { message });
  res.status(500).json({ error: 'Interner Fehler', code: 'INTERNAL' });
}
