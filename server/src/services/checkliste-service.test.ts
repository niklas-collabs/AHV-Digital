import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { runMigrations } from '../db/migrations/runner.js';
import {
  ChecklisteError,
  checklisteInputSchema,
  createCheckliste,
  deleteCheckliste,
  getCheckliste,
  listChecklisten,
  updateCheckliste,
} from './checkliste-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

describe('checkliste-service', () => {
  it('CRUD-Roundtrip', () => {
    const db = makeDb();
    const created = createCheckliste(db, {
      name: 'Heizungs-Wartung',
      typ: 'wartung',
      items: [{ text: 'Vorlauf-Temperatur prüfen' }, { text: 'Filter wechseln' }],
    });
    expect(created.items.length).toBe(2);

    const fetched = getCheckliste(db, created.id);
    expect(fetched?.name).toBe('Heizungs-Wartung');
    expect(fetched?.items[1]?.text).toBe('Filter wechseln');

    const updated = updateCheckliste(db, created.id, {
      name: 'Heizungs-Wartung Premium',
      typ: 'wartung',
      items: [{ text: 'Vollservice' }],
    });
    expect(updated.name).toBe('Heizungs-Wartung Premium');
    expect(updated.items.length).toBe(1);

    deleteCheckliste(db, created.id);
    expect(getCheckliste(db, created.id)).toBeNull();
  });

  it('filtert nach Typ', () => {
    const db = makeDb();
    createCheckliste(db, { name: 'A', typ: 'wartung', items: [] });
    createCheckliste(db, { name: 'B', typ: 'arbeitszettel', items: [] });
    createCheckliste(db, { name: 'C', typ: 'angebot', items: [] });

    expect(listChecklisten(db).length).toBe(3);
    expect(listChecklisten(db, 'wartung').length).toBe(1);
    expect(listChecklisten(db, 'angebot').length).toBe(1);
  });

  it('NOT_FOUND bei update/delete', () => {
    const db = makeDb();
    expect(() =>
      updateCheckliste(db, 'nope', { name: 'X', typ: 'wartung', items: [] }),
    ).toThrow(ChecklisteError);
    expect(() => deleteCheckliste(db, 'nope')).toThrow(ChecklisteError);
  });

  it('Zod lehnt leeren Namen / Item-Text / falschen Typ ab', () => {
    expect(() =>
      checklisteInputSchema.parse({ name: '', typ: 'wartung', items: [] }),
    ).toThrow(ZodError);
    expect(() =>
      checklisteInputSchema.parse({
        name: 'X',
        typ: 'rechnung',
        items: [],
      }),
    ).toThrow(ZodError);
    expect(() =>
      checklisteInputSchema.parse({
        name: 'X',
        typ: 'wartung',
        items: [{ text: '' }],
      }),
    ).toThrow(ZodError);
  });
});
