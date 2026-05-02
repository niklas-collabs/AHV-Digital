import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../services/auth-service.js';

export const COOKIE_NAME = 'ahv-token';

/**
 * Schuetzt nachgelagerte Routen — pruefe das HTTP-only-Cookie auf gültiges
 * JWT. Ist das Cookie nicht da oder ungültig, antworten wir mit 401 und
 * die nächste Middleware wird nicht aufgerufen.
 *
 * Routen, die kein Auth brauchen (/api/health, /api/auth/*), MUESSEN vor
 * dieser Middleware registriert werden.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req.cookies as Record<string, string | undefined> | undefined)?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Nicht authentifiziert', code: 'UNAUTHORIZED' });
    return;
  }

  const result = await verifyToken(token);
  if (!result.valid) {
    res.status(401).json({ error: 'Token ungültig', code: 'UNAUTHORIZED' });
    return;
  }

  next();
}
