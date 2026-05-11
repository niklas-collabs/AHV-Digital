import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { runMigrations } from '../db/migrations/runner.js';
import { createKunde } from './kunde-service.js';
import {
  WartungError,
  computeNaechsteWartung,
  createWartungsplan,
  deleteWartungsplan,
  erledigtInputSchema,
  getWartungsplan,
  listHistorie,
  listWartungsplaene,
  markErledigt,
  statusOf,
  updateWartungsplan,
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

describe('wartungsplan-service', () => {
  describe('computeNaechsteWartung', () => {
    it('addiert Monate zum letzten Datum', () => {
      expect(computeNaechsteWartung('2026-01-15', 12)).toBe('2027-01-15');
      expect(computeNaechsteWartung('2026-01-31', 1)).toMatch(/^2026-0[23]-/);
    });

    it('fällt auf heute zurück wenn letztes Datum fehlt', () => {
      const result = computeNaechsteWartung(null, 6);
      const today = new Date();
      today.setMonth(today.getMonth() + 6);
      expect(result).toBe(today.toISOString().slice(0, 10));
    });
  });

  describe('statusOf', () => {
    it('ueberfaellig wenn naechste in der Vergangenheit', () => {
      const plan = {
        id: 'p',
        kunde_id: null,
        kunde_name: '',
        anlage: 'A',
        standort: null,
        intervall_monate: 12,
        erinnerung_tage: 14,
        letzte_wartung: null,
        naechste_wartung: '2020-01-01',
        notiz: null,
        foto_pfad: null,
        qr_code_id: null,
        erstellt_am: '',
      };
      expect(statusOf(plan)).toBe('ueberfaellig');
    });

    it('bald wenn naechste innerhalb der Erinnerungs-Frist', () => {
      const next = new Date();
      next.setDate(next.getDate() + 5);
      const plan = {
        id: 'p',
        kunde_id: null,
        kunde_name: '',
        anlage: 'A',
        standort: null,
        intervall_monate: 12,
        erinnerung_tage: 14,
        letzte_wartung: null,
        naechste_wartung: next.toISOString().slice(0, 10),
        notiz: null,
        foto_pfad: null,
        qr_code_id: null,
        erstellt_am: '',
      };
      expect(statusOf(plan)).toBe('bald');
    });

    it('ok wenn naechste weit in der Zukunft', () => {
      const next = new Date();
      next.setDate(next.getDate() + 60);
      const plan = {
        id: 'p',
        kunde_id: null,
        kunde_name: '',
        anlage: 'A',
        standort: null,
        intervall_monate: 12,
        erinnerung_tage: 14,
        letzte_wartung: null,
        naechste_wartung: next.toISOString().slice(0, 10),
        notiz: null,
        foto_pfad: null,
        qr_code_id: null,
        erstellt_am: '',
      };
      expect(statusOf(plan)).toBe('ok');
    });
  });

  describe('CRUD', () => {
    it('legt einen Plan an mit kunde_name aus dem Kunden', () => {
      const db = makeDb();
      const k = createKunde(db, {
        typ: 'privat',
        vorname: 'Max',
        nachname: 'Mustermann',
      });
      const plan = createWartungsplan(
        db,
        wartungsplanInputSchema.parse({
          kunde_id: k.id,
          anlage: 'Gasheizung Keller',
          intervall_monate: 12,
          erinnerung_tage: 14,
        }),
      );
      expect(plan.kunde_name).toBe('Max Mustermann');
      expect(plan.anlage).toBe('Gasheizung Keller');
      expect(plan.naechste_wartung).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('akzeptiert Freitext-Kundenname wenn kunde_id null', () => {
      const db = makeDb();
      const plan = createWartungsplan(
        db,
        wartungsplanInputSchema.parse({
          kunde_name: 'Freitext-Kunde',
          anlage: 'Pumpe',
          intervall_monate: 6,
          erinnerung_tage: 7,
        }),
      );
      expect(plan.kunde_name).toBe('Freitext-Kunde');
    });

    it('update aktualisiert naechste_wartung passend zum neuen Datum', () => {
      const db = makeDb();
      const plan = createWartungsplan(
        db,
        wartungsplanInputSchema.parse({
          anlage: 'Heizung',
          intervall_monate: 12,
          erinnerung_tage: 14,
          letzte_wartung: '2024-01-01',
        }),
      );
      expect(plan.naechste_wartung).toBe('2025-01-01');

      const updated = updateWartungsplan(
        db,
        plan.id,
        wartungsplanInputSchema.parse({
          anlage: 'Heizung',
          intervall_monate: 6,
          erinnerung_tage: 14,
          letzte_wartung: '2024-06-01',
        }),
      );
      expect(updated.naechste_wartung).toBe('2024-12-01');
    });

    it('NOT_FOUND bei update/delete', () => {
      const db = makeDb();
      expect(() =>
        updateWartungsplan(
          db,
          'nope',
          wartungsplanInputSchema.parse({
            anlage: 'A',
            intervall_monate: 12,
            erinnerung_tage: 14,
          }),
        ),
      ).toThrow(WartungError);
      expect(() => deleteWartungsplan(db, 'nope')).toThrow(WartungError);
    });

    it('listet sortiert nach naechste_wartung', () => {
      const db = makeDb();
      const a = createWartungsplan(
        db,
        wartungsplanInputSchema.parse({
          anlage: 'A',
          intervall_monate: 12,
          erinnerung_tage: 14,
          letzte_wartung: '2024-01-01',
        }),
      );
      const b = createWartungsplan(
        db,
        wartungsplanInputSchema.parse({
          anlage: 'B',
          intervall_monate: 12,
          erinnerung_tage: 14,
          letzte_wartung: '2023-01-01',
        }),
      );
      const list = listWartungsplaene(db);
      expect(list[0]?.id).toBe(b.id); // 2024-01-01 ist früher
      expect(list[1]?.id).toBe(a.id);
    });
  });

  describe('markErledigt', () => {
    it('setzt letzte_wartung, berechnet naechste neu und legt Historie an', () => {
      const db = makeDb();
      const plan = createWartungsplan(
        db,
        wartungsplanInputSchema.parse({
          anlage: 'X',
          intervall_monate: 12,
          erinnerung_tage: 14,
        }),
      );
      const { plan: after, historie } = markErledigt(db, plan.id, {
        durchgefuehrt_am: '2026-05-10',
        notiz: 'Filter getauscht',
      });
      expect(after.letzte_wartung).toBe('2026-05-10');
      expect(after.naechste_wartung).toBe('2027-05-10');
      expect(historie.notiz).toBe('Filter getauscht');
      expect(historie.wartungsplan_id).toBe(plan.id);

      const liste = listHistorie(db, plan.id);
      expect(liste.length).toBe(1);
    });

    it('NOT_FOUND bei unbekannter ID', () => {
      const db = makeDb();
      expect(() =>
        markErledigt(db, 'nope', { durchgefuehrt_am: '2026-05-10' }),
      ).toThrow(WartungError);
    });
  });

  describe('Zod', () => {
    it('lehnt leere Anlage ab', () => {
      expect(() =>
        wartungsplanInputSchema.parse({
          anlage: '',
          intervall_monate: 12,
          erinnerung_tage: 14,
        }),
      ).toThrow(ZodError);
    });

    it('lehnt ungültiges Datum bei erledigt ab', () => {
      expect(() => erledigtInputSchema.parse({ durchgefuehrt_am: '10.05.2026' })).toThrow(
        ZodError,
      );
    });
  });
});
