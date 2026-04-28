import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { runMigrations } from '../db/migrations/runner.js';
import {
  KundeError,
  createKunde,
  deleteKunde,
  getKunde,
  kundeInputSchema,
  listKunden,
  updateKunde,
} from './kunde-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

describe('kunde-service', () => {
  describe('Zod-Schema', () => {
    it('akzeptiert Privatkunde mit Vor+Nachname', () => {
      const parsed = kundeInputSchema.parse({
        typ: 'privat',
        vorname: 'Max',
        nachname: 'Mustermann',
      });
      expect(parsed.typ).toBe('privat');
    });

    it('lehnt Privatkunde ohne Vorname ab', () => {
      expect(() =>
        kundeInputSchema.parse({ typ: 'privat', vorname: '', nachname: 'X' }),
      ).toThrow(ZodError);
    });

    it('akzeptiert Firma mit Firmennamen, ohne Vor+Nachname', () => {
      const parsed = kundeInputSchema.parse({
        typ: 'firma',
        firmenname: 'AHV GmbH',
      });
      expect(parsed.typ).toBe('firma');
    });

    it('lehnt Firma ohne Firmennamen ab', () => {
      expect(() =>
        kundeInputSchema.parse({ typ: 'firma', firmenname: '' }),
      ).toThrow(ZodError);
    });

    it('lehnt ungueltige E-Mail ab, akzeptiert leeren String', () => {
      expect(() =>
        kundeInputSchema.parse({
          typ: 'privat',
          vorname: 'X',
          nachname: 'Y',
          email: 'not-an-email',
        }),
      ).toThrow(ZodError);
      expect(() =>
        kundeInputSchema.parse({
          typ: 'privat',
          vorname: 'X',
          nachname: 'Y',
          email: '',
        }),
      ).not.toThrow();
    });
  });

  describe('CRUD', () => {
    it('erstellt Privatkunde, normalisiert Empty zu null', () => {
      const db = makeDb();
      const k = createKunde(db, {
        typ: 'privat',
        vorname: 'Max',
        nachname: 'Mustermann',
        email: '',
        telefon: '030 12345',
        strasse: '',
      });
      expect(k.email).toBeNull();
      expect(k.strasse).toBeNull();
      expect(k.telefon).toBe('030 12345');
      expect(k.lexoffice_id).toBeNull();
      expect(k.erstellt_am).toBe(k.geaendert_am);
    });

    it('updated geaendert_am, behaelt erstellt_am', async () => {
      const db = makeDb();
      const created = createKunde(db, {
        typ: 'privat',
        vorname: 'Max',
        nachname: 'M',
      });
      // 10 ms warten damit ISO-Timestamp sich aendert
      await new Promise((r) => setTimeout(r, 10));
      const updated = updateKunde(db, created.id, {
        typ: 'privat',
        vorname: 'Maxi',
        nachname: 'M',
      });
      expect(updated.vorname).toBe('Maxi');
      expect(updated.erstellt_am).toBe(created.erstellt_am);
      expect(updated.geaendert_am).not.toBe(created.geaendert_am);
    });

    it('wirft NOT_FOUND beim Update unbekannter ID', () => {
      const db = makeDb();
      expect(() =>
        updateKunde(db, 'nope', { typ: 'privat', vorname: 'X', nachname: 'Y' }),
      ).toThrow(KundeError);
    });

    it('verbietet Loeschen wenn Auftrag verknuepft (IN_USE)', () => {
      const db = makeDb();
      const k = createKunde(db, { typ: 'privat', vorname: 'Max', nachname: 'M' });
      // Direkt einen Auftrag mit kunde_id einfuegen
      db.prepare(
        `INSERT INTO auftrag (id, typ, status, datum, kunde_id, erstellt_am, geaendert_am)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('a1', 'arbeitszettel', 'entwurf', '2026-04-26', k.id, 'now', 'now');
      expect(() => deleteKunde(db, k.id)).toThrow(KundeError);
      try {
        deleteKunde(db, k.id);
      } catch (err) {
        expect(err).toBeInstanceOf(KundeError);
        expect((err as KundeError).code).toBe('IN_USE');
      }
      // Kunde existiert noch
      expect(getKunde(db, k.id)).not.toBeNull();
    });

    it('loescht Kunde ohne verknuepfte Auftraege', () => {
      const db = makeDb();
      const k = createKunde(db, { typ: 'privat', vorname: 'Max', nachname: 'M' });
      deleteKunde(db, k.id);
      expect(getKunde(db, k.id)).toBeNull();
    });
  });

  describe('listKunden mit Suche', () => {
    it('liefert alle wenn keine Query', () => {
      const db = makeDb();
      createKunde(db, { typ: 'privat', vorname: 'Max', nachname: 'Mustermann' });
      createKunde(db, { typ: 'firma', firmenname: 'AHV GmbH' });
      const list = listKunden(db);
      expect(list.length).toBe(2);
    });

    it('filtert case-insensitive nach Nachname', () => {
      const db = makeDb();
      createKunde(db, { typ: 'privat', vorname: 'Max', nachname: 'Mustermann' });
      createKunde(db, { typ: 'privat', vorname: 'Anna', nachname: 'Schmidt' });
      const list = listKunden(db, { query: 'muster' });
      expect(list.length).toBe(1);
      expect(list[0]?.nachname).toBe('Mustermann');
    });

    it('filtert nach Firmenname', () => {
      const db = makeDb();
      createKunde(db, { typ: 'firma', firmenname: 'AHV GmbH' });
      createKunde(db, { typ: 'firma', firmenname: 'Berlin Bau AG' });
      const list = listKunden(db, { query: 'ahv' });
      expect(list.length).toBe(1);
    });

    it('filtert nach Ort und PLZ', () => {
      const db = makeDb();
      createKunde(db, {
        typ: 'privat',
        vorname: 'Max',
        nachname: 'M',
        plz: '12345',
        ort: 'Berlin',
      });
      expect(listKunden(db, { query: 'berl' }).length).toBe(1);
      expect(listKunden(db, { query: '1234' }).length).toBe(1);
    });

    it('sortiert nach Nachname dann Firmenname', () => {
      const db = makeDb();
      createKunde(db, { typ: 'privat', vorname: 'A', nachname: 'Zander' });
      createKunde(db, { typ: 'firma', firmenname: 'Aalto' });
      createKunde(db, { typ: 'privat', vorname: 'B', nachname: 'Aaron' });
      const list = listKunden(db);
      // Nachname sortiert: '' (Firma Aalto, leerer nachname) -> 'Aaron' -> 'Zander'
      // Dann nach Firmenname: 'Aalto' -> '' -> ''
      expect(list[0]?.firmenname).toBe('Aalto');
      expect(list[1]?.nachname).toBe('Aaron');
      expect(list[2]?.nachname).toBe('Zander');
    });
  });
});
