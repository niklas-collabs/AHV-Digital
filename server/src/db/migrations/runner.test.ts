import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, 'sql');

describe('runMigrations', () => {
  it('applies all SQL migrations on a fresh in-memory DB', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    const result = runMigrations(db, SQL_DIR);

    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.applied).toContain('001_init.sql');
    expect(result.skipped).toEqual([]);

    // Wichtige Tabellen aus SPEC sind da
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);

    for (const expected of [
      '_migrations',
      'anlage_qr',
      'auftrag',
      'auth',
      'checkliste_vorlage',
      'config',
      'kunde',
      'log',
      'pauschale',
      'push_subscription',
      'stufe',
      'vorlage',
      'wartungs_historie',
      'wartungsplan',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('is idempotent — second run applies nothing', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    const first = runMigrations(db, SQL_DIR);
    const second = runMigrations(db, SQL_DIR);

    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(first.applied);
  });

  it('initialises auth singleton row', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db, SQL_DIR);

    const row = db.prepare('SELECT id, pin_hash, failed_attempts FROM auth').get() as
      | { id: number; pin_hash: string | null; failed_attempts: number }
      | undefined;

    expect(row).toBeDefined();
    expect(row?.id).toBe(1);
    expect(row?.pin_hash).toBeNull();
    expect(row?.failed_attempts).toBe(0);
  });

  it('enforces FK constraint between auftrag and kunde', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db, SQL_DIR);

    // Versuch, einen Auftrag mit kunde_id einzufuegen die nicht existiert
    expect(() =>
      db
        .prepare(
          `INSERT INTO auftrag (id, typ, status, datum, kunde_id, erstellt_am, geaendert_am)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('a1', 'arbeitszettel', 'entwurf', '2026-04-25', 'nonexistent', 'now', 'now'),
    ).toThrow();
  });
});
