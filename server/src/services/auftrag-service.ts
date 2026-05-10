import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Auftrag, AuftragStatus, AuftragTyp, Kunde, KundeSnapshot } from '@ahv/shared';
import { getKunde } from './kunde-service.js';

export class AuftragError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'INVALID_STATUS' | 'TOO_MANY_FOTOS',
    message: string,
  ) {
    super(message);
    this.name = 'AuftragError';
  }
}

export const MAX_FOTOS_PER_AUFTRAG = 10;

// === Zod-Schemas ===

const mitarbeiterSchema = z.object({
  name: z.string(),
  stufe_id: z.string().nullable(),
  stufe_bezeichnung: z.string(),
  stundenpreis: z.number().min(0).finite(),
  stunden: z.number().min(0).finite(),
});

const materialSchema = z.object({
  name: z.string(),
  menge: z.number().finite(),
  einheit: z.string(),
  preis_netto: z.number().min(0).finite(),
  mwst_prozent: z.number().min(0).max(100),
  ist_lohnkosten: z.boolean(),
});

const checklistenItemSchema = z.object({
  text: z.string(),
  checked: z.boolean(),
});

export const auftragInputSchema = z.object({
  typ: z.enum(['arbeitszettel', 'angebot', 'lieferschein']),
  titel: z.string().min(1, 'Titel ist Pflicht').max(200),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum als YYYY-MM-DD'),
  beschreibung: z.string().default(''),
  notiz_intern: z.string().default(''),
  kunde_id: z.string().nullable(),
  objekt_adresse: z.string().nullable().optional(),
  mitarbeiter: z.array(mitarbeiterSchema).default([]),
  materialien: z.array(materialSchema).default([]),
  // fotos optional: wenn weggelassen, bleibt der existing-Wert beim Update
  // bestehen. Foto-Mutations laufen über separate POST/DELETE-Endpoints.
  fotos: z.array(z.string()).optional(),
  signature_data_url: z.string().nullable().optional(),
  checkliste: z.array(checklistenItemSchema).nullable().optional(),
});

export type AuftragInput = z.infer<typeof auftragInputSchema>;

// === DB-Row -> Domain Mapping ===

interface AuftragRow {
  id: string;
  typ: AuftragTyp;
  status: AuftragStatus;
  titel: string;
  datum: string;
  beschreibung: string;
  notiz_intern: string;
  kunde_id: string | null;
  kunde_snapshot: string;
  objekt_adresse: string | null;
  mitarbeiter: string;
  materialien: string;
  fotos: string;
  signature_data_url: string | null;
  checkliste: string | null;
  urspruenglicher_auftrag_id: string | null;
  erstellt_am: string;
  geaendert_am: string;
  abgeschickt_am: string | null;
}

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function rowToAuftrag(row: AuftragRow): Auftrag {
  return {
    id: row.id,
    typ: row.typ,
    status: row.status,
    titel: row.titel,
    datum: row.datum,
    beschreibung: row.beschreibung,
    notiz_intern: row.notiz_intern,
    kunde_id: row.kunde_id,
    kunde_snapshot: safeParse(row.kunde_snapshot, emptyKundeSnapshot()),
    objekt_adresse: row.objekt_adresse,
    mitarbeiter: safeParse(row.mitarbeiter, []),
    materialien: safeParse(row.materialien, []),
    fotos: safeParse(row.fotos, []),
    signature_data_url: row.signature_data_url,
    checkliste: row.checkliste === null ? null : safeParse(row.checkliste, []),
    urspruenglicher_auftrag_id: row.urspruenglicher_auftrag_id,
    erstellt_am: row.erstellt_am,
    geaendert_am: row.geaendert_am,
    abgeschickt_am: row.abgeschickt_am,
  };
}

function emptyKundeSnapshot(): KundeSnapshot {
  return {
    typ: 'privat',
    firmenname: null,
    vorname: '',
    nachname: '',
    email: null,
    strasse: null,
    plz: null,
    ort: null,
  };
}

function buildSnapshot(kunde: Kunde): KundeSnapshot {
  return {
    typ: kunde.typ,
    firmenname: kunde.firmenname,
    vorname: kunde.vorname,
    nachname: kunde.nachname,
    email: kunde.email,
    strasse: kunde.strasse,
    plz: kunde.plz,
    ort: kunde.ort,
  };
}

// === Service ===

export interface ListAuftraegeOptions {
  status?: AuftragStatus;
  kunde_id?: string;
  query?: string;
}

export function listAuftraege(
  db: Database.Database,
  options: ListAuftraegeOptions = {},
): Auftrag[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options.kunde_id) {
    conditions.push('kunde_id = ?');
    params.push(options.kunde_id);
  }
  if (options.query?.trim()) {
    const like = `%${options.query.trim().toLowerCase()}%`;
    conditions.push('(LOWER(titel) LIKE ? OR LOWER(kunde_snapshot) LIKE ?)');
    params.push(like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM auftrag ${where} ORDER BY geaendert_am DESC`)
    .all(...params) as AuftragRow[];
  return rows.map(rowToAuftrag);
}

export function getAuftrag(db: Database.Database, id: string): Auftrag | null {
  const row = db.prepare('SELECT * FROM auftrag WHERE id = ?').get(id) as
    | AuftragRow
    | undefined;
  return row ? rowToAuftrag(row) : null;
}

export function createAuftrag(db: Database.Database, input: AuftragInput): Auftrag {
  const id = randomUUID();
  const now = new Date().toISOString();

  let snapshot = emptyKundeSnapshot();
  if (input.kunde_id) {
    const kunde = getKunde(db, input.kunde_id);
    if (kunde) snapshot = buildSnapshot(kunde);
  }

  db.prepare(
    `INSERT INTO auftrag (
       id, typ, status, titel, datum, beschreibung, notiz_intern,
       kunde_id, kunde_snapshot, objekt_adresse,
       mitarbeiter, materialien, fotos, signature_data_url, checkliste,
       erstellt_am, geaendert_am, abgeschickt_am
     ) VALUES (?, ?, 'entwurf', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    input.typ,
    input.titel,
    input.datum,
    input.beschreibung,
    input.notiz_intern,
    input.kunde_id,
    JSON.stringify(snapshot),
    input.objekt_adresse ?? null,
    JSON.stringify(input.mitarbeiter),
    JSON.stringify(input.materialien),
    JSON.stringify(input.fotos ?? []),
    input.signature_data_url ?? null,
    input.checkliste === undefined || input.checkliste === null
      ? null
      : JSON.stringify(input.checkliste),
    now,
    now,
  );

  const created = getAuftrag(db, id);
  if (!created) throw new Error('Auftrag wurde erstellt aber nicht gefunden');
  return created;
}

export function updateAuftrag(
  db: Database.Database,
  id: string,
  input: AuftragInput,
): Auftrag {
  const existing = getAuftrag(db, id);
  if (!existing) {
    throw new AuftragError('NOT_FOUND', 'Auftrag nicht gefunden');
  }

  // Snapshot nur erneuern, wenn sich kunde_id ändert. Damit bleibt ein
  // abgeschickter Auftrag mit altem Kunden-Stand konsistent.
  let snapshotJson: string;
  let kundeIdToStore = input.kunde_id;
  if (input.kunde_id !== existing.kunde_id) {
    let snapshot = emptyKundeSnapshot();
    if (input.kunde_id) {
      const kunde = getKunde(db, input.kunde_id);
      if (kunde) snapshot = buildSnapshot(kunde);
    }
    snapshotJson = JSON.stringify(snapshot);
  } else {
    snapshotJson = JSON.stringify(existing.kunde_snapshot);
    kundeIdToStore = existing.kunde_id;
  }

  // Fotos werden nur überschrieben wenn sie im Input enthalten sind. Foto-
  // Mutations laufen über separate POST/DELETE-Endpoints — beim normalen
  // PUT bleiben die Fotos erhalten.
  const fotosJson = input.fotos !== undefined ? JSON.stringify(input.fotos) : JSON.stringify(existing.fotos);

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE auftrag
     SET typ = ?, titel = ?, datum = ?, beschreibung = ?, notiz_intern = ?,
         kunde_id = ?, kunde_snapshot = ?, objekt_adresse = ?,
         mitarbeiter = ?, materialien = ?, fotos = ?,
         signature_data_url = ?, checkliste = ?, geaendert_am = ?
     WHERE id = ?`,
  ).run(
    input.typ,
    input.titel,
    input.datum,
    input.beschreibung,
    input.notiz_intern,
    kundeIdToStore,
    snapshotJson,
    input.objekt_adresse ?? null,
    JSON.stringify(input.mitarbeiter),
    JSON.stringify(input.materialien),
    fotosJson,
    input.signature_data_url ?? null,
    input.checkliste === undefined || input.checkliste === null
      ? null
      : JSON.stringify(input.checkliste),
    now,
    id,
  );

  const updated = getAuftrag(db, id);
  if (!updated) throw new Error('Auftrag verschwunden nach Update');
  return updated;
}

export function deleteAuftrag(db: Database.Database, id: string): void {
  const existing = getAuftrag(db, id);
  if (!existing) {
    throw new AuftragError('NOT_FOUND', 'Auftrag nicht gefunden');
  }
  db.prepare('DELETE FROM auftrag WHERE id = ?').run(id);
}

/**
 * Hängt einen Foto-Dateinamen an das fotos-Array des Auftrags an.
 * Wirft TOO_MANY_FOTOS wenn Max erreicht ist.
 */
export function addFotoToAuftrag(
  db: Database.Database,
  id: string,
  filename: string,
): Auftrag {
  const existing = getAuftrag(db, id);
  if (!existing) {
    throw new AuftragError('NOT_FOUND', 'Auftrag nicht gefunden');
  }
  if (existing.fotos.length >= MAX_FOTOS_PER_AUFTRAG) {
    throw new AuftragError(
      'TOO_MANY_FOTOS',
      `Maximal ${MAX_FOTOS_PER_AUFTRAG} Fotos pro Auftrag`,
    );
  }
  const newFotos = [...existing.fotos, filename];
  const now = new Date().toISOString();
  db.prepare('UPDATE auftrag SET fotos = ?, geaendert_am = ? WHERE id = ?').run(
    JSON.stringify(newFotos),
    now,
    id,
  );
  const updated = getAuftrag(db, id);
  if (!updated) throw new Error('Auftrag verschwunden nach Foto-Add');
  return updated;
}

/**
 * Entfernt einen Foto-Dateinamen aus dem fotos-Array. Liefert true wenn
 * der Eintrag entfernt wurde, false wenn er nicht in der Liste war.
 */
export function removeFotoFromAuftrag(
  db: Database.Database,
  id: string,
  filename: string,
): { auftrag: Auftrag; wasInList: boolean } {
  const existing = getAuftrag(db, id);
  if (!existing) {
    throw new AuftragError('NOT_FOUND', 'Auftrag nicht gefunden');
  }
  const wasInList = existing.fotos.includes(filename);
  if (!wasInList) {
    return { auftrag: existing, wasInList: false };
  }
  const newFotos = existing.fotos.filter((f) => f !== filename);
  const now = new Date().toISOString();
  db.prepare('UPDATE auftrag SET fotos = ?, geaendert_am = ? WHERE id = ?').run(
    JSON.stringify(newFotos),
    now,
    id,
  );
  const updated = getAuftrag(db, id);
  if (!updated) throw new Error('Auftrag verschwunden nach Foto-Remove');
  return { auftrag: updated, wasInList: true };
}

/**
 * Erzeugt eine Kopie eines Auftrags. Optional mit anderem Typ
 * (Pipeline-Konvertierung Angebot -> Arbeitszettel etc.). Die Kopie:
 *
 * - bekommt eine neue id und status='entwurf'
 * - datum=heute (ein Angebot von letzter Woche soll nicht mit altem
 *   Datum als Arbeitszettel weiterleben)
 * - übernimmt Titel, Beschreibung, interne Notiz, Kunde, Adresse,
 *   Mitarbeiter, Material, Checkliste
 * - lässt Fotos und Unterschrift bewusst leer (Foto-Pfade verweisen auf
 *   Dateien des Originals; Signaturen sind ein-Auftrag-spezifisch)
 * - speichert urspruenglicher_auftrag_id für Nachverfolgung
 */
export function duplicateAuftrag(
  db: Database.Database,
  sourceId: string,
  options: { typ?: AuftragTyp } = {},
): Auftrag {
  const source = getAuftrag(db, sourceId);
  if (!source) {
    throw new AuftragError('NOT_FOUND', 'Auftrag nicht gefunden');
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const targetTyp = options.typ ?? source.typ;

  db.prepare(
    `INSERT INTO auftrag (
       id, typ, status, titel, datum, beschreibung, notiz_intern,
       kunde_id, kunde_snapshot, objekt_adresse,
       mitarbeiter, materialien, fotos, signature_data_url, checkliste,
       urspruenglicher_auftrag_id,
       erstellt_am, geaendert_am, abgeschickt_am
     ) VALUES (?, ?, 'entwurf', ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    targetTyp,
    source.titel,
    today,
    source.beschreibung,
    source.notiz_intern,
    source.kunde_id,
    JSON.stringify(source.kunde_snapshot),
    source.objekt_adresse,
    JSON.stringify(source.mitarbeiter),
    JSON.stringify(source.materialien),
    source.checkliste === null ? null : JSON.stringify(source.checkliste),
    source.id,
    now,
    now,
  );

  const created = getAuftrag(db, id);
  if (!created) throw new Error('Auftrag wurde dupliziert aber nicht gefunden');
  return created;
}

/**
 * Setzt status='abgeschickt' und abgeschickt_am=jetzt. Idempotent — wenn
 * schon abgeschickt, bleibt das Datum unverändert (sonst könnte ein
 * versehentlicher zweiter Klick den Versand-Zeitpunkt überschreiben).
 */
export function abschickenAuftrag(db: Database.Database, id: string): Auftrag {
  const existing = getAuftrag(db, id);
  if (!existing) {
    throw new AuftragError('NOT_FOUND', 'Auftrag nicht gefunden');
  }
  if (existing.status === 'abgeschickt') {
    return existing;
  }
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE auftrag SET status = ?, abgeschickt_am = ?, geaendert_am = ? WHERE id = ?',
  ).run('abgeschickt', now, now, id);
  const updated = getAuftrag(db, id);
  if (!updated) throw new Error('Auftrag verschwunden nach Abschicken');
  return updated;
}
