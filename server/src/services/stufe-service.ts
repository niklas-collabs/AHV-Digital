import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Stufe } from '@ahv/shared';

export class StufeError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'IN_USE',
    message: string,
  ) {
    super(message);
    this.name = 'StufeError';
  }
}

export const stufeInputSchema = z.object({
  bezeichnung: z.string().min(1, 'Bezeichnung ist Pflicht').max(60),
  stundenpreis: z.number().min(0).finite(),
  reihenfolge: z.number().int().min(0).max(9999).optional(),
});

export type StufeInput = z.infer<typeof stufeInputSchema>;

export function listStufen(db: Database.Database): Stufe[] {
  return db
    .prepare('SELECT id, bezeichnung, stundenpreis, reihenfolge FROM stufe ORDER BY reihenfolge, bezeichnung')
    .all() as Stufe[];
}

export function getStufe(db: Database.Database, id: string): Stufe | null {
  const row = db
    .prepare('SELECT id, bezeichnung, stundenpreis, reihenfolge FROM stufe WHERE id = ?')
    .get(id) as Stufe | undefined;
  return row ?? null;
}

export function createStufe(db: Database.Database, input: StufeInput): Stufe {
  const id = randomUUID();
  const reihenfolge = input.reihenfolge ?? nextReihenfolge(db);
  db.prepare(
    'INSERT INTO stufe (id, bezeichnung, stundenpreis, reihenfolge) VALUES (?, ?, ?, ?)',
  ).run(id, input.bezeichnung, input.stundenpreis, reihenfolge);
  return { id, bezeichnung: input.bezeichnung, stundenpreis: input.stundenpreis, reihenfolge };
}

export function updateStufe(db: Database.Database, id: string, input: StufeInput): Stufe {
  const existing = getStufe(db, id);
  if (!existing) {
    throw new StufeError('NOT_FOUND', 'Stufe nicht gefunden');
  }
  const reihenfolge = input.reihenfolge ?? existing.reihenfolge;
  db.prepare(
    'UPDATE stufe SET bezeichnung = ?, stundenpreis = ?, reihenfolge = ? WHERE id = ?',
  ).run(input.bezeichnung, input.stundenpreis, reihenfolge, id);
  return { id, bezeichnung: input.bezeichnung, stundenpreis: input.stundenpreis, reihenfolge };
}

export function deleteStufe(db: Database.Database, id: string): void {
  const existing = getStufe(db, id);
  if (!existing) {
    throw new StufeError('NOT_FOUND', 'Stufe nicht gefunden');
  }
  // Hinweis: Stufen werden in Auftraegen als Snapshot gespeichert (kunde_snapshot-Pattern),
  // d.h. das Loeschen einer Stufe macht alte Auftraege NICHT kaputt — sie haben den
  // Stundenpreis bereits eingefroren.
  db.prepare('DELETE FROM stufe WHERE id = ?').run(id);
}

/**
 * Vertauscht zwei Stufen in der Reihenfolge. Fuer Up/Down-Buttons.
 */
export function moveStufe(
  db: Database.Database,
  id: string,
  direction: 'up' | 'down',
): Stufe[] {
  const all = listStufen(db);
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) throw new StufeError('NOT_FOUND', 'Stufe nicht gefunden');

  const target = direction === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= all.length) return all;

  const a = all[idx];
  const b = all[target];
  if (!a || !b) return all;

  const stmt = db.prepare('UPDATE stufe SET reihenfolge = ? WHERE id = ?');
  const tx = db.transaction(() => {
    stmt.run(b.reihenfolge, a.id);
    stmt.run(a.reihenfolge, b.id);
  });
  tx();
  return listStufen(db);
}

function nextReihenfolge(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(reihenfolge) as max FROM stufe').get() as
    | { max: number | null }
    | undefined;
  return (row?.max ?? -1) + 1;
}
