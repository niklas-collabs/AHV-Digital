import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Kunde, KundeTyp } from '@ahv/shared';

export class KundeError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'IN_USE',
    message: string,
  ) {
    super(message);
    this.name = 'KundeError';
  }
}

// Zod: Privat braucht Vor+Nachname, Firma braucht Firmennamen.
// Felder die mit '' default sind, normalisieren wir bei Empty zu null.

const baseFields = {
  email: z.string().email('Ungueltige E-Mail').or(z.literal('')).optional(),
  telefon: z.string().optional(),
  strasse: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  notiz: z.string().optional(),
};

const privatSchema = z.object({
  typ: z.literal('privat'),
  vorname: z.string().min(1, 'Vorname ist Pflicht'),
  nachname: z.string().min(1, 'Nachname ist Pflicht'),
  firmenname: z.string().optional(),
  ...baseFields,
});

const firmaSchema = z.object({
  typ: z.literal('firma'),
  firmenname: z.string().min(1, 'Firmenname ist Pflicht'),
  vorname: z.string().optional(), // Ansprechpartner
  nachname: z.string().optional(),
  ...baseFields,
});

export const kundeInputSchema = z.discriminatedUnion('typ', [privatSchema, firmaSchema]);
export type KundeInput = z.infer<typeof kundeInputSchema>;

interface KundeRow extends Kunde {}

function rowToKunde(row: KundeRow): Kunde {
  return row;
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  return v.trim() === '' ? null : v;
}

export interface ListKundenOptions {
  query?: string;
}

/**
 * Listet Kunden, optional gefiltert nach query (case-insensitive substring match
 * gegen firmenname, nachname, vorname, ort, plz). Sortiert: Nachname, dann
 * Firmenname, dann erstellt_am.
 */
export function listKunden(db: Database.Database, options: ListKundenOptions = {}): Kunde[] {
  const q = options.query?.trim();
  let sql = 'SELECT * FROM kunde';
  const params: unknown[] = [];
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    sql +=
      ' WHERE LOWER(IFNULL(firmenname, \'\')) LIKE ? OR LOWER(nachname) LIKE ? OR LOWER(vorname) LIKE ? OR LOWER(IFNULL(ort, \'\')) LIKE ? OR IFNULL(plz, \'\') LIKE ?';
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY LOWER(nachname), LOWER(IFNULL(firmenname, \'\')), erstellt_am';
  const rows = db.prepare(sql).all(...params) as KundeRow[];
  return rows.map(rowToKunde);
}

export function getKunde(db: Database.Database, id: string): Kunde | null {
  const row = db.prepare('SELECT * FROM kunde WHERE id = ?').get(id) as KundeRow | undefined;
  return row ? rowToKunde(row) : null;
}

export function createKunde(db: Database.Database, input: KundeInput): Kunde {
  const id = randomUUID();
  const now = new Date().toISOString();
  const k: Kunde = {
    id,
    typ: input.typ,
    firmenname: emptyToNull(input.firmenname),
    vorname: input.vorname ?? '',
    nachname: input.nachname ?? '',
    email: emptyToNull(input.email),
    telefon: emptyToNull(input.telefon),
    strasse: emptyToNull(input.strasse),
    plz: emptyToNull(input.plz),
    ort: emptyToNull(input.ort),
    lexoffice_id: null, // Phase 2
    notiz: emptyToNull(input.notiz),
    erstellt_am: now,
    geaendert_am: now,
  };
  db.prepare(
    `INSERT INTO kunde (id, typ, firmenname, vorname, nachname, email, telefon, strasse, plz, ort, lexoffice_id, notiz, erstellt_am, geaendert_am)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    k.id,
    k.typ,
    k.firmenname,
    k.vorname,
    k.nachname,
    k.email,
    k.telefon,
    k.strasse,
    k.plz,
    k.ort,
    k.lexoffice_id,
    k.notiz,
    k.erstellt_am,
    k.geaendert_am,
  );
  return k;
}

export function updateKunde(db: Database.Database, id: string, input: KundeInput): Kunde {
  const existing = getKunde(db, id);
  if (!existing) {
    throw new KundeError('NOT_FOUND', 'Kunde nicht gefunden');
  }
  const now = new Date().toISOString();
  const updated: Kunde = {
    ...existing,
    typ: input.typ,
    firmenname: emptyToNull(input.firmenname),
    vorname: input.vorname ?? '',
    nachname: input.nachname ?? '',
    email: emptyToNull(input.email),
    telefon: emptyToNull(input.telefon),
    strasse: emptyToNull(input.strasse),
    plz: emptyToNull(input.plz),
    ort: emptyToNull(input.ort),
    notiz: emptyToNull(input.notiz),
    geaendert_am: now,
  };
  db.prepare(
    `UPDATE kunde
     SET typ = ?, firmenname = ?, vorname = ?, nachname = ?, email = ?, telefon = ?,
         strasse = ?, plz = ?, ort = ?, notiz = ?, geaendert_am = ?
     WHERE id = ?`,
  ).run(
    updated.typ,
    updated.firmenname,
    updated.vorname,
    updated.nachname,
    updated.email,
    updated.telefon,
    updated.strasse,
    updated.plz,
    updated.ort,
    updated.notiz,
    updated.geaendert_am,
    id,
  );
  return updated;
}

export function deleteKunde(db: Database.Database, id: string): void {
  const existing = getKunde(db, id);
  if (!existing) {
    throw new KundeError('NOT_FOUND', 'Kunde nicht gefunden');
  }
  // FK-Check vorab fuer schoene Fehlermeldung — sonst bekaeme der Client einen
  // SQLITE_CONSTRAINT-Fehler.
  const linked = db
    .prepare('SELECT COUNT(*) as count FROM auftrag WHERE kunde_id = ?')
    .get(id) as { count: number };
  if (linked.count > 0) {
    throw new KundeError(
      'IN_USE',
      `Kunde hat ${linked.count} verknuepfte(n) Auftrag/Auftraege und kann nicht geloescht werden`,
    );
  }
  db.prepare('DELETE FROM kunde WHERE id = ?').run(id);
}
