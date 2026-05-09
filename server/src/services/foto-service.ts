import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25 MB Roh-Upload (vor Komprimierung)
const MAX_DIMENSION = 1600; // SPEC: max 1600px Kante
const JPEG_QUALITY = 80; // SPEC: JPEG 80%
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export class FotoError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_MIME'
      | 'TOO_LARGE'
      | 'NOT_FOUND'
      | 'PROCESS_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'FotoError';
  }
}

/**
 * Multer-Middleware für Foto-Upload: in-memory-Storage, MIME-Filter,
 * 25 MB Roh-Limit. Bei Verstoss wirft multer einen Error den der
 * error-handler in 400 übersetzt.
 */
export const fotoUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype.toLowerCase())) {
      cb(new FotoError('INVALID_MIME', 'Nur Bild-Dateien erlaubt (JPG/PNG/HEIC/WebP)'));
      return;
    }
    cb(null, true);
  },
}).single('foto');

function fotoDir(uploadsDir: string, auftragId: string): string {
  return path.join(uploadsDir, 'auftraege', auftragId);
}

/**
 * Speichert ein Foto: komprimiert mit sharp auf max. 1600 px Kante,
 * JPEG-Qualität 80, in <uploadsDir>/auftraege/<auftragId>/<uuid>.jpg.
 * Liefert den Datei-Namen (ohne Pfad), der ins fotos-Array des Auftrags geht.
 */
export async function saveFoto(
  uploadsDir: string,
  auftragId: string,
  buffer: Buffer,
): Promise<string> {
  const dir = fotoDir(uploadsDir, auftragId);
  mkdirSync(dir, { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  const fullPath = path.join(dir, filename);

  try {
    const processed = await sharp(buffer, { failOn: 'truncated' })
      // Auto-rotate basierend auf EXIF-Orientierung (Handy-Fotos sonst gekippt)
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    writeFileSync(fullPath, processed);
  } catch (err) {
    throw new FotoError(
      'PROCESS_FAILED',
      err instanceof Error ? err.message : 'Bild konnte nicht verarbeitet werden',
    );
  }

  return filename;
}

/**
 * Liest ein Foto als Buffer. Liefert null wenn die Datei nicht existiert
 * (z.B. weil sie auf einem anderen Render-Deploy verloren ging).
 */
export function readFoto(
  uploadsDir: string,
  auftragId: string,
  filename: string,
): Buffer | null {
  const fullPath = path.join(fotoDir(uploadsDir, auftragId), sanitizeFilename(filename));
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath);
}

/**
 * Löscht eine Foto-Datei vom Disk. Idempotent.
 */
export function deleteFotoFile(
  uploadsDir: string,
  auftragId: string,
  filename: string,
): void {
  const fullPath = path.join(fotoDir(uploadsDir, auftragId), sanitizeFilename(filename));
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
  }
}

/**
 * Sicherstellung gegen Path-Traversal — der Dateiname darf keine
 * Pfad-Trenner oder ".." enthalten.
 */
function sanitizeFilename(filename: string): string {
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new FotoError('NOT_FOUND', 'Ungültiger Dateiname');
  }
  return filename;
}
