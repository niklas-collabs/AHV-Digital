import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { runMigrations } from '../db/migrations/runner.js';
import {
  AnlageError,
  anlageInputSchema,
  createAnlage,
  deleteAnlage,
  generateAnlageQrPng,
  getAnlage,
  listAnlagen,
  updateAnlage,
} from './anlage-service.js';
import { createKunde } from './kunde-service.js';
import {
  createWartungsplan,
  getWartungsplan,
  wartungsplanInputSchema,
} from './wartungsplan-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

describe('anlage-service', () => {
  it('legt eine Anlage an mit kunde_name aus dem Kunden', () => {
    const db = makeDb();
    const k = createKunde(db, { typ: 'privat', vorname: 'Max', nachname: 'Mustermann' });
    const a = createAnlage(db, {
      kunde_id: k.id,
      kunde_name: '',
      anlage: 'Gasheizung Keller',
    });
    expect(a.kunde_name).toBe('Max Mustermann');
    expect(a.anlage).toBe('Gasheizung Keller');
  });

  it('verknüpft mit Wartungsplan bidirektional', () => {
    const db = makeDb();
    const wp = createWartungsplan(
      db,
      wartungsplanInputSchema.parse({
        anlage: 'Heizung',
        intervall_monate: 12,
        erinnerung_tage: 14,
      }),
    );
    const a = createAnlage(db, {
      kunde_name: 'X',
      anlage: 'Heizung',
      wartungsplan_id: wp.id,
    });
    expect(a.wartungsplan_id).toBe(wp.id);

    const wpReload = getWartungsplan(db, wp.id);
    expect(wpReload?.qr_code_id).toBe(a.id);
  });

  it('löst die Wartungs-Verknüpfung beim Update auf wenn neuer Plan gesetzt', () => {
    const db = makeDb();
    const wp1 = createWartungsplan(
      db,
      wartungsplanInputSchema.parse({
        anlage: 'A',
        intervall_monate: 12,
        erinnerung_tage: 14,
      }),
    );
    const wp2 = createWartungsplan(
      db,
      wartungsplanInputSchema.parse({
        anlage: 'B',
        intervall_monate: 12,
        erinnerung_tage: 14,
      }),
    );
    const a = createAnlage(db, {
      kunde_name: 'X',
      anlage: 'A',
      wartungsplan_id: wp1.id,
    });
    updateAnlage(db, a.id, {
      kunde_name: 'X',
      anlage: 'A',
      wartungsplan_id: wp2.id,
    });
    expect(getWartungsplan(db, wp1.id)?.qr_code_id).toBeNull();
    expect(getWartungsplan(db, wp2.id)?.qr_code_id).toBe(a.id);
  });

  it('löst die Wartungs-Verknüpfung beim Löschen auf', () => {
    const db = makeDb();
    const wp = createWartungsplan(
      db,
      wartungsplanInputSchema.parse({
        anlage: 'A',
        intervall_monate: 12,
        erinnerung_tage: 14,
      }),
    );
    const a = createAnlage(db, {
      kunde_name: 'X',
      anlage: 'A',
      wartungsplan_id: wp.id,
    });
    deleteAnlage(db, a.id);
    expect(getAnlage(db, a.id)).toBeNull();
    expect(getWartungsplan(db, wp.id)?.qr_code_id).toBeNull();
  });

  it('NOT_FOUND bei update/delete', () => {
    const db = makeDb();
    expect(() =>
      updateAnlage(db, 'nope', { kunde_name: 'X', anlage: 'A' }),
    ).toThrow(AnlageError);
    expect(() => deleteAnlage(db, 'nope')).toThrow(AnlageError);
  });

  it('Zod lehnt leere Anlage ab', () => {
    expect(() => anlageInputSchema.parse({ anlage: '' })).toThrow(ZodError);
  });

  it('listAnlagen sortiert nach erstellt_am DESC', async () => {
    const db = makeDb();
    const first = createAnlage(db, { kunde_name: 'A', anlage: 'A1' });
    await new Promise((r) => setTimeout(r, 5));
    const second = createAnlage(db, { kunde_name: 'B', anlage: 'A2' });
    const list = listAnlagen(db);
    expect(list[0]?.id).toBe(second.id);
    expect(list[1]?.id).toBe(first.id);
  });

  it('generateAnlageQrPng liefert PNG-Buffer', async () => {
    const buf = await generateAnlageQrPng('abc-123', 'https://example.com');
    // PNG-Signatur: 89 50 4E 47
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
    expect(buf.length).toBeGreaterThan(100);
  });
});
