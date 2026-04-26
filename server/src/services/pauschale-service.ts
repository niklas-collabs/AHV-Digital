import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pauschale } from '@ahv/shared';

export class PauschaleError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'PauschaleError';
  }
}

export const pauschaleInputSchema = z.object({
  name: z.string().min(1, 'Name ist Pflicht').max(100),
  preis_netto: z.number().min(0).finite(),
  einheit: z.string().min(1).max(20),
  mwst_prozent: z.number().min(0).max(100),
  ist_lohnkosten: z.boolean(),
});

export type PauschaleInput = z.infer<typeof pauschaleInputSchema>;

interface PauschaleRow {
  id: string;
  name: string;
  preis_netto: number;
  einheit: string;
  mwst_prozent: number;
  ist_lohnkosten: number; // 0/1 in SQLite
}

function rowToPauschale(row: PauschaleRow): Pauschale {
  return {
    id: row.id,
    name: row.name,
    preis_netto: row.preis_netto,
    einheit: row.einheit,
    mwst_prozent: row.mwst_prozent,
    ist_lohnkosten: row.ist_lohnkosten === 1,
  };
}

export function listPauschalen(db: Database.Database): Pauschale[] {
  const rows = db
    .prepare(
      'SELECT id, name, preis_netto, einheit, mwst_prozent, ist_lohnkosten FROM pauschale ORDER BY name',
    )
    .all() as PauschaleRow[];
  return rows.map(rowToPauschale);
}

export function getPauschale(db: Database.Database, id: string): Pauschale | null {
  const row = db
    .prepare(
      'SELECT id, name, preis_netto, einheit, mwst_prozent, ist_lohnkosten FROM pauschale WHERE id = ?',
    )
    .get(id) as PauschaleRow | undefined;
  return row ? rowToPauschale(row) : null;
}

export function createPauschale(db: Database.Database, input: PauschaleInput): Pauschale {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO pauschale (id, name, preis_netto, einheit, mwst_prozent, ist_lohnkosten) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    input.name,
    input.preis_netto,
    input.einheit,
    input.mwst_prozent,
    input.ist_lohnkosten ? 1 : 0,
  );
  return { id, ...input };
}

export function updatePauschale(
  db: Database.Database,
  id: string,
  input: PauschaleInput,
): Pauschale {
  const existing = getPauschale(db, id);
  if (!existing) {
    throw new PauschaleError('NOT_FOUND', 'Pauschale nicht gefunden');
  }
  db.prepare(
    'UPDATE pauschale SET name = ?, preis_netto = ?, einheit = ?, mwst_prozent = ?, ist_lohnkosten = ? WHERE id = ?',
  ).run(
    input.name,
    input.preis_netto,
    input.einheit,
    input.mwst_prozent,
    input.ist_lohnkosten ? 1 : 0,
    id,
  );
  return { id, ...input };
}

export function deletePauschale(db: Database.Database, id: string): void {
  const existing = getPauschale(db, id);
  if (!existing) {
    throw new PauschaleError('NOT_FOUND', 'Pauschale nicht gefunden');
  }
  db.prepare('DELETE FROM pauschale WHERE id = ?').run(id);
}
