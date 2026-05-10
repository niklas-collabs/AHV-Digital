import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Auftrag, AuftragTyp, Vorlage } from '@ahv/shared';

export class VorlageError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'VorlageError';
  }
}

export const vorlageInputSchema = z.object({
  name: z.string().min(1, 'Name ist Pflicht').max(100),
  typ: z.enum(['arbeitszettel', 'angebot', 'lieferschein']),
  // Partial<Auftrag> als beliebiges JSON-Objekt — Validierung der inneren
  // Felder passiert beim Anwenden, nicht beim Speichern.
  data: z.record(z.unknown()).default({}),
});

export type VorlageInput = z.infer<typeof vorlageInputSchema>;

interface VorlageRow {
  id: string;
  name: string;
  typ: AuftragTyp;
  data: string;
  erstellt_am: string;
}

function rowToVorlage(row: VorlageRow): Vorlage {
  let data: Partial<Auftrag> = {};
  try {
    data = JSON.parse(row.data) as Partial<Auftrag>;
  } catch {
    /* ignore corrupt JSON */
  }
  return {
    id: row.id,
    name: row.name,
    typ: row.typ,
    data,
    erstellt_am: row.erstellt_am,
  };
}

export function listVorlagen(db: Database.Database, typ?: AuftragTyp): Vorlage[] {
  let sql = 'SELECT id, name, typ, data, erstellt_am FROM vorlage';
  const params: unknown[] = [];
  if (typ) {
    sql += ' WHERE typ = ?';
    params.push(typ);
  }
  sql += ' ORDER BY LOWER(name)';
  const rows = db.prepare(sql).all(...params) as VorlageRow[];
  return rows.map(rowToVorlage);
}

export function getVorlage(db: Database.Database, id: string): Vorlage | null {
  const row = db
    .prepare('SELECT id, name, typ, data, erstellt_am FROM vorlage WHERE id = ?')
    .get(id) as VorlageRow | undefined;
  return row ? rowToVorlage(row) : null;
}

export function createVorlage(db: Database.Database, input: VorlageInput): Vorlage {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO vorlage (id, name, typ, data, erstellt_am) VALUES (?, ?, ?, ?, ?)',
  ).run(id, input.name, input.typ, JSON.stringify(input.data), now);
  return { id, name: input.name, typ: input.typ, data: input.data as Partial<Auftrag>, erstellt_am: now };
}

export function updateVorlage(
  db: Database.Database,
  id: string,
  input: VorlageInput,
): Vorlage {
  const existing = getVorlage(db, id);
  if (!existing) {
    throw new VorlageError('NOT_FOUND', 'Vorlage nicht gefunden');
  }
  db.prepare('UPDATE vorlage SET name = ?, typ = ?, data = ? WHERE id = ?').run(
    input.name,
    input.typ,
    JSON.stringify(input.data),
    id,
  );
  return {
    id,
    name: input.name,
    typ: input.typ,
    data: input.data as Partial<Auftrag>,
    erstellt_am: existing.erstellt_am,
  };
}

export function deleteVorlage(db: Database.Database, id: string): void {
  const existing = getVorlage(db, id);
  if (!existing) {
    throw new VorlageError('NOT_FOUND', 'Vorlage nicht gefunden');
  }
  db.prepare('DELETE FROM vorlage WHERE id = ?').run(id);
}
