import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthError } from '../services/auth-service.js';
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

  const message = err instanceof Error ? err.message : String(err);
  logger.error('unhandled_error', { message });
  res.status(500).json({ error: 'Interner Fehler', code: 'INTERNAL' });
}
