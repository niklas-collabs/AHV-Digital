import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../db/migrations/runner.js';
import {
  StufeError,
  createStufe,
  deleteStufe,
  getStufe,
  listStufen,
  moveStufe,
  updateStufe,
} from './stufe-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

describe('stufe-service', () => {
  it('liefert leere Liste ohne Stufen', () => {
    const db = makeDb();
    expect(listStufen(db)).toEqual([]);
  });

  it('erstellt Stufe mit auto-Reihenfolge', () => {
    const db = makeDb();
    const a = createStufe(db, { bezeichnung: 'Geselle', stundenpreis: 45 });
    const b = createStufe(db, { bezeichnung: 'Helfer', stundenpreis: 30 });
    expect(a.reihenfolge).toBe(0);
    expect(b.reihenfolge).toBe(1);
  });

  it('listet sortiert nach Reihenfolge', () => {
    const db = makeDb();
    createStufe(db, { bezeichnung: 'A', stundenpreis: 10, reihenfolge: 5 });
    createStufe(db, { bezeichnung: 'B', stundenpreis: 20, reihenfolge: 1 });
    const list = listStufen(db);
    expect(list[0]?.bezeichnung).toBe('B');
    expect(list[1]?.bezeichnung).toBe('A');
  });

  it('updated bezeichnung und stundenpreis', () => {
    const db = makeDb();
    const created = createStufe(db, { bezeichnung: 'Geselle', stundenpreis: 45 });
    const updated = updateStufe(db, created.id, { bezeichnung: 'Meister', stundenpreis: 65 });
    expect(updated.bezeichnung).toBe('Meister');
    expect(updated.stundenpreis).toBe(65);
    const fetched = getStufe(db, created.id);
    expect(fetched?.bezeichnung).toBe('Meister');
  });

  it('wirft NOT_FOUND beim Update unbekannter ID', () => {
    const db = makeDb();
    expect(() =>
      updateStufe(db, 'nope', { bezeichnung: 'X', stundenpreis: 0 }),
    ).toThrow(StufeError);
  });

  it('löscht Stufe', () => {
    const db = makeDb();
    const created = createStufe(db, { bezeichnung: 'Geselle', stundenpreis: 45 });
    deleteStufe(db, created.id);
    expect(getStufe(db, created.id)).toBeNull();
  });

  it('moveStufe up/down vertauscht Reihenfolge', () => {
    const db = makeDb();
    createStufe(db, { bezeichnung: 'A', stundenpreis: 10 });
    const b = createStufe(db, { bezeichnung: 'B', stundenpreis: 20 });
    const c = createStufe(db, { bezeichnung: 'C', stundenpreis: 30 });

    moveStufe(db, b.id, 'up');
    let list = listStufen(db);
    expect(list.map((s) => s.bezeichnung)).toEqual(['B', 'A', 'C']);

    moveStufe(db, b.id, 'down');
    list = listStufen(db);
    expect(list.map((s) => s.bezeichnung)).toEqual(['A', 'B', 'C']);

    // Am Ende: down ist no-op
    moveStufe(db, c.id, 'down');
    list = listStufen(db);
    expect(list[2]?.bezeichnung).toBe('C');
  });
});
