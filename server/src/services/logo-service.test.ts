import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runMigrations } from '../db/migrations/runner.js';
import { LogoError, readLogo, removeLogo, saveLogo } from './logo-service.js';
import { getConfig } from './config-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

// Minimales 1x1 PNG (Pixel transparent)
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6300010000000005000100c5d4c5650000000049454e44ae426082',
  'hex',
);

// Minimales JPEG (1x1 weiss)
const TINY_JPG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b08000100010101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d010203000411051221314106135161072271143281914123610715b2c1d1e1f02434626a39ffd9',
  'hex',
);

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

describe('logo-service', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'ahv-logo-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('saveLogo', () => {
    it('speichert PNG als logo.png', () => {
      const db = makeDb();
      const config = saveLogo(db, TINY_PNG, 'image/png', tmpDir);
      expect(config.path).toBe('logo.png');
      expect(config.mime).toBe('image/png');
      expect(existsSync(path.join(tmpDir, 'logo.png'))).toBe(true);
      expect(getConfig(db, 'logo')).toEqual(config);
    });

    it('speichert JPEG als logo.jpg', () => {
      const db = makeDb();
      const config = saveLogo(db, TINY_JPG, 'image/jpeg', tmpDir);
      expect(config.path).toBe('logo.jpg');
      expect(existsSync(path.join(tmpDir, 'logo.jpg'))).toBe(true);
    });

    it('lehnt unzulaessige MIME-Typen ab', () => {
      const db = makeDb();
      expect(() => saveLogo(db, TINY_PNG, 'image/gif', tmpDir)).toThrow(LogoError);
    });

    it('überschreibt bestehendes Logo (gleicher MIME)', () => {
      const db = makeDb();
      saveLogo(db, TINY_PNG, 'image/png', tmpDir);
      const buf2 = Buffer.concat([TINY_PNG, Buffer.from('extra')]);
      saveLogo(db, buf2, 'image/png', tmpDir);
      const stored = readFileSync(path.join(tmpDir, 'logo.png'));
      expect(stored.length).toBe(buf2.length);
    });

    it('löscht alte Datei beim Format-Wechsel', () => {
      const db = makeDb();
      saveLogo(db, TINY_PNG, 'image/png', tmpDir);
      saveLogo(db, TINY_JPG, 'image/jpeg', tmpDir);
      expect(existsSync(path.join(tmpDir, 'logo.png'))).toBe(false);
      expect(existsSync(path.join(tmpDir, 'logo.jpg'))).toBe(true);
    });
  });

  describe('readLogo', () => {
    it('liefert null wenn kein Logo gesetzt', () => {
      const db = makeDb();
      expect(readLogo(db, tmpDir)).toBeNull();
    });

    it('liefert Buffer + MIME nach Save', () => {
      const db = makeDb();
      saveLogo(db, TINY_PNG, 'image/png', tmpDir);
      const result = readLogo(db, tmpDir);
      expect(result).not.toBeNull();
      expect(result!.mime).toBe('image/png');
      expect(result!.buffer.length).toBe(TINY_PNG.length);
    });

    it('liefert null wenn config zeigt auf nicht existierende Datei', () => {
      const db = makeDb();
      saveLogo(db, TINY_PNG, 'image/png', tmpDir);
      // Datei manuell entfernen, config bleibt
      rmSync(path.join(tmpDir, 'logo.png'));
      expect(readLogo(db, tmpDir)).toBeNull();
    });
  });

  describe('removeLogo', () => {
    it('löscht Datei und config-Eintrag', () => {
      const db = makeDb();
      saveLogo(db, TINY_PNG, 'image/png', tmpDir);
      removeLogo(db, tmpDir);
      expect(existsSync(path.join(tmpDir, 'logo.png'))).toBe(false);
      expect(getConfig(db, 'logo')).toBeNull();
    });

    it('ist idempotent', () => {
      const db = makeDb();
      expect(() => removeLogo(db, tmpDir)).not.toThrow();
      saveLogo(db, TINY_PNG, 'image/png', tmpDir);
      removeLogo(db, tmpDir);
      expect(() => removeLogo(db, tmpDir)).not.toThrow();
    });
  });
});
