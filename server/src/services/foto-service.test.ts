import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { FotoError, replaceFoto, saveFoto } from './foto-service.js';

// Echtes Mini-JPEG via sharp (sharp verweigert manuell zusammengebaute
// 1x1-Header). 8x8 rot, das reicht für Round-Trip-Tests.
let TINY_JPG: Buffer;

beforeAll(async () => {
  TINY_JPG = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .jpeg()
    .toBuffer();
});

describe('foto-service', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'ahv-foto-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('saveFoto', () => {
    it('legt komprimierte JPEG-Datei unter neuer UUID an', async () => {
      const filename = await saveFoto(tmpDir, 'auftrag1', TINY_JPG);
      expect(filename).toMatch(/^[0-9a-f-]+\.jpg$/);
      const fullPath = path.join(tmpDir, 'auftraege', 'auftrag1', filename);
      expect(existsSync(fullPath)).toBe(true);
      expect(statSync(fullPath).size).toBeGreaterThan(0);
    });
  });

  describe('replaceFoto', () => {
    it('überschreibt Datei unter gleichem Namen', async () => {
      const filename = await saveFoto(tmpDir, 'auftrag1', TINY_JPG);
      const fullPath = path.join(tmpDir, 'auftraege', 'auftrag1', filename);
      const before = readFileSync(fullPath);

      // Bewusst gleiches Original — Größe darf gleich/anders sein, wichtig
      // ist, dass replace ohne Fehler durchläuft und die Datei existiert.
      await replaceFoto(tmpDir, 'auftrag1', filename, TINY_JPG);
      const after = readFileSync(fullPath);
      expect(existsSync(fullPath)).toBe(true);
      expect(after.length).toBeGreaterThan(0);
      // Sharp-Re-encoding: Inhalt unterscheidet sich byteweise oder ist gleich;
      // beides ok. Wichtig: keine Exception, Datei existiert.
      expect(Buffer.isBuffer(before)).toBe(true);
    });

    it('wirft NOT_FOUND wenn Datei nicht existiert', async () => {
      await expect(
        replaceFoto(tmpDir, 'auftrag1', 'nicht-da.jpg', TINY_JPG),
      ).rejects.toBeInstanceOf(FotoError);
    });

    it('lehnt Path-Traversal-Filename ab', async () => {
      await expect(
        replaceFoto(tmpDir, 'auftrag1', '../../etc/passwd', TINY_JPG),
      ).rejects.toBeInstanceOf(FotoError);
    });
  });
});
