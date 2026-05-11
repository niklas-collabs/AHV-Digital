import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Wartungsplan, WartungsHistorie } from '@ahv/shared';
import { recordLog } from './log-service.js';
import { getKunde } from './kunde-service.js';

export class WartungError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'INVALID_DATE',
    message: string,
  ) {
    super(message);
    this.name = 'WartungError';
  }
}

// === Zod ===

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const wartungsplanInputSchema = z.object({
  kunde_id: z.string().nullable().optional(),
  kunde_name: z.string().default(''),
  anlage: z.string().min(1, 'Anlage ist Pflicht').max(200),
  standort: z.string().max(200).nullable().optional(),
  intervall_monate: z.number().int().min(1).max(120),
  erinnerung_tage: z.number().int().min(0).max(365),
  letzte_wartung: z.string().regex(dateRegex).nullable().optional(),
  notiz: z.string().nullable().optional(),
});
export type WartungsplanInput = z.infer<typeof wartungsplanInputSchema>;

export const erledigtInputSchema = z.object({
  durchgefuehrt_am: z.string().regex(dateRegex, 'Datum als YYYY-MM-DD'),
  notiz: z.string().nullable().optional(),
});
export type ErledigtInput = z.infer<typeof erledigtInputSchema>;

// === Helpers ===

interface WartungsplanRow {
  id: string;
  kunde_id: string | null;
  kunde_name: string;
  anlage: string;
  standort: string | null;
  intervall_monate: number;
  erinnerung_tage: number;
  letzte_wartung: string | null;
  naechste_wartung: string;
  notiz: string | null;
  foto_pfad: string | null;
  qr_code_id: string | null;
  erstellt_am: string;
}

function rowToPlan(row: WartungsplanRow): Wartungsplan {
  return { ...row };
}

/**
 * Berechnet das nächste Wartungs-Datum aus dem letzten + Intervall.
 * Fallback: heute + intervall, falls letztes Datum fehlt.
 */
export function computeNaechsteWartung(
  letzte: string | null,
  intervallMonate: number,
): string {
  const base = letzte ? new Date(letzte) : new Date();
  base.setMonth(base.getMonth() + intervallMonate);
  return base.toISOString().slice(0, 10);
}

export type WartungStatus = 'ok' | 'bald' | 'ueberfaellig';

/**
 * Status auf Basis von naechste_wartung und erinnerung_tage:
 *  - ueberfaellig: naechste_wartung in der Vergangenheit
 *  - bald: heute + erinnerung_tage >= naechste_wartung
 *  - ok: sonst
 */
export function statusOf(plan: Wartungsplan): WartungStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (plan.naechste_wartung < today) return 'ueberfaellig';
  const erinnerung = new Date();
  erinnerung.setDate(erinnerung.getDate() + plan.erinnerung_tage);
  const grenze = erinnerung.toISOString().slice(0, 10);
  if (plan.naechste_wartung <= grenze) return 'bald';
  return 'ok';
}

// === CRUD ===

export function listWartungsplaene(db: Database.Database): Wartungsplan[] {
  // Sortierung nach Fälligkeit (überfällige zuerst)
  const rows = db
    .prepare('SELECT * FROM wartungsplan ORDER BY naechste_wartung ASC')
    .all() as WartungsplanRow[];
  return rows.map(rowToPlan);
}

export function getWartungsplan(db: Database.Database, id: string): Wartungsplan | null {
  const row = db.prepare('SELECT * FROM wartungsplan WHERE id = ?').get(id) as
    | WartungsplanRow
    | undefined;
  return row ? rowToPlan(row) : null;
}

function resolveKundeName(
  db: Database.Database,
  kunde_id: string | null | undefined,
  fallback: string,
): string {
  if (!kunde_id) return fallback;
  const k = getKunde(db, kunde_id);
  if (!k) return fallback;
  if (k.typ === 'firma') return k.firmenname ?? fallback;
  return [k.vorname, k.nachname].filter(Boolean).join(' ') || fallback;
}

export function createWartungsplan(
  db: Database.Database,
  input: WartungsplanInput,
): Wartungsplan {
  const id = randomUUID();
  const now = new Date().toISOString();
  const naechste = computeNaechsteWartung(input.letzte_wartung ?? null, input.intervall_monate);
  const kundeName = resolveKundeName(db, input.kunde_id ?? null, input.kunde_name);

  db.prepare(
    `INSERT INTO wartungsplan
       (id, kunde_id, kunde_name, anlage, standort, intervall_monate,
        erinnerung_tage, letzte_wartung, naechste_wartung, notiz, foto_pfad,
        qr_code_id, erstellt_am)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
  ).run(
    id,
    input.kunde_id ?? null,
    kundeName,
    input.anlage,
    input.standort ?? null,
    input.intervall_monate,
    input.erinnerung_tage,
    input.letzte_wartung ?? null,
    naechste,
    input.notiz ?? null,
    now,
  );

  const created = getWartungsplan(db, id);
  if (!created) throw new Error('Wartungsplan nach Insert nicht gefunden');
  recordLog(db, {
    action: 'wartung.plan_created',
    entity_type: 'wartungsplan',
    entity_id: id,
    message: `${kundeName} – ${input.anlage}`,
  });
  return created;
}

export function updateWartungsplan(
  db: Database.Database,
  id: string,
  input: WartungsplanInput,
): Wartungsplan {
  const existing = getWartungsplan(db, id);
  if (!existing) {
    throw new WartungError('NOT_FOUND', 'Wartungsplan nicht gefunden');
  }
  const naechste = computeNaechsteWartung(input.letzte_wartung ?? null, input.intervall_monate);
  const kundeName = resolveKundeName(db, input.kunde_id ?? null, input.kunde_name);
  db.prepare(
    `UPDATE wartungsplan
       SET kunde_id = ?, kunde_name = ?, anlage = ?, standort = ?,
           intervall_monate = ?, erinnerung_tage = ?, letzte_wartung = ?,
           naechste_wartung = ?, notiz = ?
     WHERE id = ?`,
  ).run(
    input.kunde_id ?? null,
    kundeName,
    input.anlage,
    input.standort ?? null,
    input.intervall_monate,
    input.erinnerung_tage,
    input.letzte_wartung ?? null,
    naechste,
    input.notiz ?? null,
    id,
  );
  const updated = getWartungsplan(db, id);
  if (!updated) throw new Error('Wartungsplan nach Update nicht gefunden');
  return updated;
}

export function deleteWartungsplan(db: Database.Database, id: string): void {
  const existing = getWartungsplan(db, id);
  if (!existing) {
    throw new WartungError('NOT_FOUND', 'Wartungsplan nicht gefunden');
  }
  db.prepare('DELETE FROM wartungsplan WHERE id = ?').run(id);
  recordLog(db, {
    action: 'wartung.plan_deleted',
    entity_type: 'wartungsplan',
    entity_id: id,
    message: `${existing.kunde_name} – ${existing.anlage}`,
  });
}

// === Erledigt-Flow ===

interface HistorieRow {
  id: string;
  wartungsplan_id: string;
  durchgefuehrt_am: string;
  notiz: string | null;
  foto_pfad: string | null;
  auftrag_id: string | null;
}

export function listHistorie(db: Database.Database, planId: string): WartungsHistorie[] {
  const rows = db
    .prepare(
      'SELECT * FROM wartungs_historie WHERE wartungsplan_id = ? ORDER BY durchgefuehrt_am DESC',
    )
    .all(planId) as HistorieRow[];
  return rows.map((r) => ({ ...r }));
}

/**
 * Markiert eine Wartung als erledigt:
 *  - legt einen Eintrag in wartungs_historie an
 *  - setzt letzte_wartung im Plan
 *  - berechnet naechste_wartung neu (letzte + intervall_monate)
 */
export function markErledigt(
  db: Database.Database,
  planId: string,
  input: ErledigtInput,
): { plan: Wartungsplan; historie: WartungsHistorie } {
  const plan = getWartungsplan(db, planId);
  if (!plan) {
    throw new WartungError('NOT_FOUND', 'Wartungsplan nicht gefunden');
  }

  const tx = db.transaction(() => {
    const historieId = randomUUID();
    db.prepare(
      `INSERT INTO wartungs_historie
         (id, wartungsplan_id, durchgefuehrt_am, notiz, foto_pfad, auftrag_id)
       VALUES (?, ?, ?, ?, NULL, NULL)`,
    ).run(historieId, planId, input.durchgefuehrt_am, input.notiz ?? null);

    const naechste = computeNaechsteWartung(
      input.durchgefuehrt_am,
      plan.intervall_monate,
    );
    db.prepare(
      'UPDATE wartungsplan SET letzte_wartung = ?, naechste_wartung = ? WHERE id = ?',
    ).run(input.durchgefuehrt_am, naechste, planId);
    return historieId;
  });
  const historieId = tx();

  const updated = getWartungsplan(db, planId);
  if (!updated) throw new Error('Wartungsplan nach Erledigt nicht gefunden');
  const historie = (db
    .prepare('SELECT * FROM wartungs_historie WHERE id = ?')
    .get(historieId) as HistorieRow) ?? null;
  if (!historie) throw new Error('Historie nicht gefunden');

  recordLog(db, {
    action: 'wartung.erledigt',
    entity_type: 'wartungsplan',
    entity_id: planId,
    message: `${updated.kunde_name} – ${updated.anlage}`,
    metadata: { durchgefuehrt_am: input.durchgefuehrt_am },
  });

  return { plan: updated, historie: { ...historie } };
}

/** Verknüpft ein bereits angelegten Auftrag mit dem letzten Historie-Eintrag */
export function linkHistorieToAuftrag(
  db: Database.Database,
  historieId: string,
  auftragId: string,
): void {
  db.prepare('UPDATE wartungs_historie SET auftrag_id = ? WHERE id = ?').run(
    auftragId,
    historieId,
  );
}
