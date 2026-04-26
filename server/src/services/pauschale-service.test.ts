import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { runMigrations } from '../db/migrations/runner.js';
import {
  PauschaleError,
  createPauschale,
  deletePauschale,
  getPauschale,
  listPauschalen,
  pauschaleInputSchema,
  updatePauschale,
} from './pauschale-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

describe('pauschale-service', () => {
  it('CRUD-Roundtrip', () => {
    const db = makeDb();
    const created = createPauschale(db, {
      name: 'Anfahrt',
      preis_netto: 30,
      einheit: 'Psch',
      mwst_prozent: 19,
      ist_lohnkosten: false,
    });
    expect(created.id).toBeTypeOf('string');
    expect(getPauschale(db, created.id)?.name).toBe('Anfahrt');

    const updated = updatePauschale(db, created.id, {
      name: 'Anfahrt + Spesen',
      preis_netto: 35,
      einheit: 'Psch',
      mwst_prozent: 19,
      ist_lohnkosten: true,
    });
    expect(updated.name).toBe('Anfahrt + Spesen');
    expect(updated.ist_lohnkosten).toBe(true);

    deletePauschale(db, created.id);
    expect(getPauschale(db, created.id)).toBeNull();
  });

  it('mappt boolean ist_lohnkosten korrekt zu/von SQLite', () => {
    const db = makeDb();
    const a = createPauschale(db, {
      name: 'A',
      preis_netto: 10,
      einheit: 'Stk',
      mwst_prozent: 19,
      ist_lohnkosten: true,
    });
    const b = createPauschale(db, {
      name: 'B',
      preis_netto: 5,
      einheit: 'Stk',
      mwst_prozent: 7,
      ist_lohnkosten: false,
    });
    const list = listPauschalen(db);
    const aFromList = list.find((p) => p.id === a.id);
    const bFromList = list.find((p) => p.id === b.id);
    expect(aFromList?.ist_lohnkosten).toBe(true);
    expect(bFromList?.ist_lohnkosten).toBe(false);
  });

  it('listet alphabetisch nach name', () => {
    const db = makeDb();
    createPauschale(db, {
      name: 'Zubehoer',
      preis_netto: 5,
      einheit: 'Stk',
      mwst_prozent: 19,
      ist_lohnkosten: false,
    });
    createPauschale(db, {
      name: 'Anfahrt',
      preis_netto: 30,
      einheit: 'Psch',
      mwst_prozent: 19,
      ist_lohnkosten: false,
    });
    const list = listPauschalen(db);
    expect(list[0]?.name).toBe('Anfahrt');
    expect(list[1]?.name).toBe('Zubehoer');
  });

  it('wirft NOT_FOUND beim update/delete unbekannter ID', () => {
    const db = makeDb();
    expect(() =>
      updatePauschale(db, 'nope', {
        name: 'X',
        preis_netto: 0,
        einheit: 'Stk',
        mwst_prozent: 0,
        ist_lohnkosten: false,
      }),
    ).toThrow(PauschaleError);
    expect(() => deletePauschale(db, 'nope')).toThrow(PauschaleError);
  });

  it('Zod-Schema lehnt name ohne Inhalt ab', () => {
    expect(() =>
      pauschaleInputSchema.parse({
        name: '',
        preis_netto: 0,
        einheit: 'Stk',
        mwst_prozent: 0,
        ist_lohnkosten: false,
      }),
    ).toThrow(ZodError);
  });

  it('Zod-Schema lehnt negativen Preis ab', () => {
    expect(() =>
      pauschaleInputSchema.parse({
        name: 'X',
        preis_netto: -1,
        einheit: 'Stk',
        mwst_prozent: 0,
        ist_lohnkosten: false,
      }),
    ).toThrow(ZodError);
  });
});
