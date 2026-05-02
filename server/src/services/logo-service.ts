import multer from 'multer';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { LogoConfig } from '@ahv/shared';
import { deleteConfig, getConfig, setConfig } from './config-service.js';

const MAX_LOGO_SIZE = 1 * 1024 * 1024; // 1 MB
const ALLOWED_LOGO_MIMES = new Set(['image/png', 'image/jpeg']);
const LOGO_FILENAMES: Record<string, string> = {
  'image/png': 'logo.png',
  'image/jpeg': 'logo.jpg',
};

/**
 * Multer-Middleware für Logo-Upload: in-memory-Storage, MIME-Filter,
 * 1 MB Groessen-Limit. Bei Verstoss wirft multer einen Error den der
 * error-handler in 400 übersetzt.
 */
export const logoUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_LOGO_MIMES.has(file.mimetype)) {
      cb(new LogoError('INVALID_MIME', 'Nur PNG oder JPEG erlaubt'));
      return;
    }
    cb(null, true);
  },
}).single('logo');

export class LogoError extends Error {
  constructor(
    public readonly code: 'INVALID_MIME' | 'TOO_LARGE' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'LogoError';
  }
}

/**
 * Speichert den Buffer als Logo-Datei in uploadsDir, überschreibt
 * vorhandenes Logo (auch bei MIME-Wechsel — alte Datei wird gelöscht).
 */
export function saveLogo(
  db: Database.Database,
  buffer: Buffer,
  mime: string,
  uploadsDir: string,
): LogoConfig {
  if (!ALLOWED_LOGO_MIMES.has(mime)) {
    throw new LogoError('INVALID_MIME', 'Nur PNG oder JPEG erlaubt');
  }

  // Altes Logo entfernen (kann anderes Format sein)
  removeLogoFile(db, uploadsDir);

  mkdirSync(uploadsDir, { recursive: true });
  const filename = LOGO_FILENAMES[mime];
  if (!filename) {
    throw new LogoError('INVALID_MIME', 'Nur PNG oder JPEG erlaubt');
  }
  const fullPath = path.join(uploadsDir, filename);
  writeFileSync(fullPath, buffer);

  const config: LogoConfig = { path: filename, mime };
  setConfig(db, 'logo', config);
  return config;
}

/**
 * Löscht die Logo-Datei und entfernt den config-Eintrag. Idempotent.
 */
export function removeLogo(db: Database.Database, uploadsDir: string): void {
  removeLogoFile(db, uploadsDir);
  deleteConfig(db, 'logo');
}

function removeLogoFile(db: Database.Database, uploadsDir: string): void {
  const cfg = getConfig(db, 'logo');
  if (!cfg) return;
  const fullPath = path.join(uploadsDir, cfg.path);
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
  }
}

/**
 * Liefert das aktuelle Logo als Buffer + MIME, oder null wenn keins gesetzt.
 */
export function readLogo(
  db: Database.Database,
  uploadsDir: string,
): { buffer: Buffer; mime: string } | null {
  const cfg = getConfig(db, 'logo');
  if (!cfg) return null;
  const fullPath = path.join(uploadsDir, cfg.path);
  if (!existsSync(fullPath)) return null;
  return { buffer: readFileSync(fullPath), mime: cfg.mime };
}
