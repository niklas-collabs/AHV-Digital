import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../services/auth-service.js';
import { setCurrentRequestUser } from '../services/log-service.js';

export const COOKIE_NAME = 'ahv-token';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Identität des eingeloggten Benutzers — gesetzt von requireAuth. */
      userId?: string;
      userName?: string;
    }
  }
}

/**
 * Schuetzt nachgelagerte Routen — pruefe das HTTP-only-Cookie auf gültiges
 * JWT. Ist das Cookie nicht da oder ungültig, antworten wir mit 401 und
 * die nächste Middleware wird nicht aufgerufen.
 *
 * Bei Erfolg werden req.userId und req.userName gesetzt — diese können
 * von Services zum Tagging von Aktionen verwendet werden (Aktionsprotokoll).
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

  req.userId = result.userId;
  req.userName = result.userName;

  // Für recordLog: aktuellen User im Modul-State setzen, am Ende des
  // Requests wieder leeren. Node.js ist single-threaded, daher ist das
  // safe für die App-Größe; für mehr Skalierung wäre AsyncLocalStorage
  // die richtige Lösung.
  setCurrentRequestUser({ id: result.userId, name: result.userName });
  res.on('finish', () => setCurrentRequestUser(null));
  res.on('close', () => setCurrentRequestUser(null));

  next();
}
