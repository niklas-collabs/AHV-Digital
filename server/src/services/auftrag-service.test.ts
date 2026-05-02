import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { runMigrations } from '../db/migrations/runner.js';
import { createKunde, updateKunde } from './kunde-service.js';
import {
  AuftragError,
  abschickenAuftrag,
  auftragInputSchema,
  createAuftrag,
  deleteAuftrag,
  getAuftrag,
  listAuftraege,
  updateAuftrag,
  type AuftragInput,
} from './auftrag-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

function baseInput(overrides: Partial<AuftragInput> = {}): AuftragInput {
  return auftragInputSchema.parse({
    typ: 'arbeitszettel',
    titel: 'Heizungswartung Müller',
    datum: '2026-04-26',
    kunde_id: null,
    ...overrides,
  });
}

describe('auftrag-service', () => {
  describe('Zod', () => {
    it('lehnt leeren Titel ab', () => {
      expect(() =>
        auftragInputSchema.parse({
          typ: 'arbeitszettel',
          titel: '',
          datum: '2026-04-26',
          kunde_id: null,
        }),
      ).toThrow(ZodError);
    });

    it('lehnt unzulaessigen Typ ab', () => {
      expect(() =>
        auftragInputSchema.parse({
          typ: 'rechnung',
          titel: 'X',
          datum: '2026-04-26',
          kunde_id: null,
        }),
      ).toThrow(ZodError);
    });

    it('akzeptiert Defaults fuer Listen', () => {
      const parsed = auftragInputSchema.parse({
        typ: 'angebot',
        titel: 'X',
        datum: '2026-04-26',
        kunde_id: null,
      });
      expect(parsed.mitarbeiter).toEqual([]);
      expect(parsed.materialien).toEqual([]);
    });
  });

  describe('CRUD', () => {
    it('create + get roundtrip mit JSON-Spalten', () => {
      const db = makeDb();
      const created = createAuftrag(
        db,
        baseInput({
          mitarbeiter: [
            { name: 'Max', stufe_id: null, stufe_bezeichnung: 'Geselle', stundenpreis: 45, stunden: 4 },
          ],
          materialien: [
            { name: 'Rohr', menge: 5, einheit: 'm', preis_netto: 12, mwst_prozent: 19, ist_lohnkosten: false },
          ],
          fotos: ['foto1.jpg'],
        }),
      );
      expect(created.status).toBe('entwurf');
      expect(created.mitarbeiter[0]?.name).toBe('Max');
      expect(created.materialien[0]?.menge).toBe(5);
      expect(created.fotos).toEqual(['foto1.jpg']);
      expect(created.checkliste).toBeNull();

      const fetched = getAuftrag(db, created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.titel).toBe(created.titel);
    });

    it('snapshot wird beim Create aus Kunde gezogen', () => {
      const db = makeDb();
      const k = createKunde(db, {
        typ: 'firma',
        firmenname: 'Mustermann GmbH',
        ort: 'Berlin',
        plz: '12345',
      });
      const a = createAuftrag(db, baseInput({ kunde_id: k.id }));
      expect(a.kunde_snapshot.firmenname).toBe('Mustermann GmbH');
      expect(a.kunde_snapshot.ort).toBe('Berlin');
      expect(a.kunde_snapshot.plz).toBe('12345');
    });

    it('snapshot bleibt unveraendert wenn Kunde sich aendert', () => {
      const db = makeDb();
      const k = createKunde(db, {
        typ: 'privat',
        vorname: 'Max',
        nachname: 'Mustermann',
      });
      const a = createAuftrag(db, baseInput({ kunde_id: k.id }));
      expect(a.kunde_snapshot.nachname).toBe('Mustermann');

      // Kunde aendert sich
      updateKunde(db, k.id, {
        typ: 'privat',
        vorname: 'Max',
        nachname: 'Geaendert',
      });

      // Auftrag aktualisieren OHNE kunde_id-Wechsel — Snapshot soll alt bleiben
      const updated = updateAuftrag(db, a.id, baseInput({ kunde_id: k.id, titel: 'neuer Titel' }));
      expect(updated.kunde_snapshot.nachname).toBe('Mustermann');
      expect(updated.titel).toBe('neuer Titel');
    });

    it('snapshot wird neu gezogen wenn kunde_id wechselt', () => {
      const db = makeDb();
      const k1 = createKunde(db, {
        typ: 'privat',
        vorname: 'Max',
        nachname: 'Mustermann',
      });
      const k2 = createKunde(db, {
        typ: 'privat',
        vorname: 'Anna',
        nachname: 'Schmidt',
      });
      const a = createAuftrag(db, baseInput({ kunde_id: k1.id }));
      const updated = updateAuftrag(db, a.id, baseInput({ kunde_id: k2.id }));
      expect(updated.kunde_snapshot.nachname).toBe('Schmidt');
    });

    it('update wirft NOT_FOUND fuer unbekannte ID', () => {
      const db = makeDb();
      expect(() => updateAuftrag(db, 'nope', baseInput())).toThrow(AuftragError);
    });

    it('delete entfernt den Eintrag', () => {
      const db = makeDb();
      const a = createAuftrag(db, baseInput());
      deleteAuftrag(db, a.id);
      expect(getAuftrag(db, a.id)).toBeNull();
    });

    it('delete wirft NOT_FOUND fuer unbekannte ID', () => {
      const db = makeDb();
      expect(() => deleteAuftrag(db, 'nope')).toThrow(AuftragError);
    });
  });

  describe('listAuftraege', () => {
    it('filtert nach status', () => {
      const db = makeDb();
      const a = createAuftrag(db, baseInput({ titel: 'A' }));
      createAuftrag(db, baseInput({ titel: 'B' }));
      abschickenAuftrag(db, a.id);

      expect(listAuftraege(db, { status: 'entwurf' }).length).toBe(1);
      expect(listAuftraege(db, { status: 'abgeschickt' }).length).toBe(1);
    });

    it('filtert nach kunde_id', () => {
      const db = makeDb();
      const k1 = createKunde(db, { typ: 'privat', vorname: 'M', nachname: 'X' });
      const k2 = createKunde(db, { typ: 'privat', vorname: 'A', nachname: 'Y' });
      createAuftrag(db, baseInput({ kunde_id: k1.id }));
      createAuftrag(db, baseInput({ kunde_id: k2.id }));
      createAuftrag(db, baseInput({ kunde_id: k1.id }));

      expect(listAuftraege(db, { kunde_id: k1.id }).length).toBe(2);
      expect(listAuftraege(db, { kunde_id: k2.id }).length).toBe(1);
    });

    it('sucht in titel und kunde_snapshot', () => {
      const db = makeDb();
      const k = createKunde(db, {
        typ: 'firma',
        firmenname: 'Spezielle Bau AG',
      });
      createAuftrag(db, baseInput({ titel: 'Heizung Test', kunde_id: k.id }));
      createAuftrag(db, baseInput({ titel: 'Sanitaer XY', kunde_id: null }));

      expect(listAuftraege(db, { query: 'heizung' }).length).toBe(1);
      expect(listAuftraege(db, { query: 'spezielle' }).length).toBe(1);
      expect(listAuftraege(db, { query: 'gibt-es-nicht' }).length).toBe(0);
    });

    it('sortiert nach geaendert_am DESC', async () => {
      const db = makeDb();
      const a = createAuftrag(db, baseInput({ titel: 'Erst' }));
      await new Promise((r) => setTimeout(r, 10));
      const b = createAuftrag(db, baseInput({ titel: 'Spaeter' }));
      const list = listAuftraege(db);
      expect(list[0]?.id).toBe(b.id);
      expect(list[1]?.id).toBe(a.id);
    });
  });

  describe('abschicken', () => {
    it('setzt status und abgeschickt_am', () => {
      const db = makeDb();
      const a = createAuftrag(db, baseInput());
      expect(a.status).toBe('entwurf');
      expect(a.abgeschickt_am).toBeNull();

      const sent = abschickenAuftrag(db, a.id);
      expect(sent.status).toBe('abgeschickt');
      expect(sent.abgeschickt_am).not.toBeNull();
    });

    it('ist idempotent — zweiter Aufruf aendert abgeschickt_am nicht', async () => {
      const db = makeDb();
      const a = createAuftrag(db, baseInput());
      const first = abschickenAuftrag(db, a.id);
      await new Promise((r) => setTimeout(r, 10));
      const second = abschickenAuftrag(db, a.id);
      expect(second.abgeschickt_am).toBe(first.abgeschickt_am);
    });

    it('wirft NOT_FOUND fuer unbekannte ID', () => {
      const db = makeDb();
      expect(() => abschickenAuftrag(db, 'nope')).toThrow(AuftragError);
    });
  });
});
