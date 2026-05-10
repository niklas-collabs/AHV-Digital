import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { runMigrations } from '../db/migrations/runner.js';
import {
  VorlageError,
  createVorlage,
  deleteVorlage,
  getVorlage,
  listVorlagen,
  updateVorlage,
  vorlageInputSchema,
} from './vorlage-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

describe('vorlage-service', () => {
  it('CRUD-Roundtrip', () => {
    const db = makeDb();
    const created = createVorlage(db, {
      name: 'Standard-Wartung',
      typ: 'arbeitszettel',
      data: { titel: 'Heizungswartung', beschreibung: 'Filter prüfen' },
    });
    expect(created.id).toBeTypeOf('string');
    expect(created.data.titel).toBe('Heizungswartung');

    const fetched = getVorlage(db, created.id);
    expect(fetched?.name).toBe('Standard-Wartung');
    expect(fetched?.data.beschreibung).toBe('Filter prüfen');

    const updated = updateVorlage(db, created.id, {
      name: 'Wartung Premium',
      typ: 'arbeitszettel',
      data: { titel: 'Heizungswartung Premium' },
    });
    expect(updated.name).toBe('Wartung Premium');
    expect(updated.data.titel).toBe('Heizungswartung Premium');
    expect(updated.erstellt_am).toBe(created.erstellt_am);

    deleteVorlage(db, created.id);
    expect(getVorlage(db, created.id)).toBeNull();
  });

  it('listet typ-gefiltert und sortiert nach Name', () => {
    const db = makeDb();
    createVorlage(db, { name: 'Z-Vorlage', typ: 'arbeitszettel', data: {} });
    createVorlage(db, { name: 'A-Vorlage', typ: 'arbeitszettel', data: {} });
    createVorlage(db, { name: 'Angebot1', typ: 'angebot', data: {} });

    expect(listVorlagen(db).length).toBe(3);
    expect(listVorlagen(db, 'arbeitszettel').length).toBe(2);
    expect(listVorlagen(db, 'arbeitszettel')[0]?.name).toBe('A-Vorlage');
    expect(listVorlagen(db, 'lieferschein').length).toBe(0);
  });

  it('wirft NOT_FOUND bei update/delete unbekannter ID', () => {
    const db = makeDb();
    expect(() =>
      updateVorlage(db, 'nope', { name: 'X', typ: 'angebot', data: {} }),
    ).toThrow(VorlageError);
    expect(() => deleteVorlage(db, 'nope')).toThrow(VorlageError);
  });

  it('Zod lehnt leeren Namen und ungültigen Typ ab', () => {
    expect(() =>
      vorlageInputSchema.parse({ name: '', typ: 'arbeitszettel', data: {} }),
    ).toThrow(ZodError);
    expect(() =>
      vorlageInputSchema.parse({ name: 'X', typ: 'rechnung', data: {} }),
    ).toThrow(ZodError);
  });
});
