import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { runMigrations } from '../db/migrations/runner.js';
import {
  deleteConfig,
  getAllConfig,
  getConfig,
  isConfigKey,
  setConfig,
} from './config-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

describe('config-service', () => {
  describe('isConfigKey', () => {
    it('akzeptiert bekannte Keys', () => {
      expect(isConfigKey('firma')).toBe(true);
      expect(isConfigKey('logo')).toBe(true);
      expect(isConfigKey('theme_default')).toBe(true);
    });
    it('lehnt unbekannte Keys ab', () => {
      expect(isConfigKey('foo')).toBe(false);
      expect(isConfigKey('')).toBe(false);
      expect(isConfigKey(123)).toBe(false);
    });
  });

  describe('getAllConfig', () => {
    it('liefert null fuer alle Keys auf leerer DB', () => {
      const db = makeDb();
      const all = getAllConfig(db);
      expect(all.firma).toBeNull();
      expect(all.logo).toBeNull();
      expect(all.theme_default).toBeNull();
      expect(all.lexoffice_api_key).toBeNull();
    });

    it('liefert gesetzte Werte zurueck', () => {
      const db = makeDb();
      setConfig(db, 'theme_default', 'dark');
      const all = getAllConfig(db);
      expect(all.theme_default).toBe('dark');
      expect(all.firma).toBeNull();
    });
  });

  describe('setConfig (firma)', () => {
    it('akzeptiert vollstaendige Firmendaten', () => {
      const db = makeDb();
      const firma = {
        name: 'Adolph Hochmuth Versorgungstechnik',
        strasse: 'Musterstr. 1',
        plz: '12345',
        ort: 'Berlin',
        telefon: '030 12345',
        email: 'info@example.com',
        ust_nr: 'DE123456789',
        iban: 'DE00 0000 0000 0000 0000 00',
        bic: 'TESTDEFF',
        bank: 'Testbank',
      };
      const saved = setConfig(db, 'firma', firma);
      expect(saved).toEqual(firma);
      expect(getConfig(db, 'firma')).toEqual(firma);
    });

    it('akzeptiert leere E-Mail (optional)', () => {
      const db = makeDb();
      expect(() =>
        setConfig(db, 'firma', {
          name: 'Test',
          strasse: '',
          plz: '',
          ort: '',
          telefon: '',
          email: '',
          ust_nr: '',
          iban: '',
          bic: '',
          bank: '',
        }),
      ).not.toThrow();
    });

    it('lehnt firma ohne name ab', () => {
      const db = makeDb();
      expect(() =>
        setConfig(db, 'firma', {
          name: '',
          strasse: '',
          plz: '',
          ort: '',
          telefon: '',
          email: '',
          ust_nr: '',
          iban: '',
          bic: '',
          bank: '',
        }),
      ).toThrow(ZodError);
    });

    it('lehnt firma mit ungueltiger E-Mail ab', () => {
      const db = makeDb();
      expect(() =>
        setConfig(db, 'firma', {
          name: 'Test',
          strasse: '',
          plz: '',
          ort: '',
          telefon: '',
          email: 'not-an-email',
          ust_nr: '',
          iban: '',
          bic: '',
          bank: '',
        }),
      ).toThrow(ZodError);
    });
  });

  describe('setConfig (theme_default)', () => {
    it('akzeptiert dark/light', () => {
      const db = makeDb();
      setConfig(db, 'theme_default', 'dark');
      expect(getConfig(db, 'theme_default')).toBe('dark');
      setConfig(db, 'theme_default', 'light');
      expect(getConfig(db, 'theme_default')).toBe('light');
    });
    it('lehnt unbekanntes Theme ab', () => {
      const db = makeDb();
      expect(() => setConfig(db, 'theme_default', 'sepia')).toThrow(ZodError);
    });
  });

  describe('upsert / delete', () => {
    it('ueberschreibt vorhandenen Wert', () => {
      const db = makeDb();
      setConfig(db, 'lexoffice_api_key', 'key-1');
      setConfig(db, 'lexoffice_api_key', 'key-2');
      expect(getConfig(db, 'lexoffice_api_key')).toBe('key-2');
    });

    it('deleteConfig entfernt den Eintrag', () => {
      const db = makeDb();
      setConfig(db, 'lexoffice_api_key', 'key-1');
      deleteConfig(db, 'lexoffice_api_key');
      expect(getConfig(db, 'lexoffice_api_key')).toBeNull();
    });
  });
});
