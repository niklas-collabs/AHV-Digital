import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ChecklistenVorlage, ChecklistenVorlageTyp } from '@ahv/shared';

export class ChecklisteError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'ChecklisteError';
  }
}

const itemSchema = z.object({
  text: z.string().min(1).max(200),
});

export const checklisteInputSchema = z.object({
  name: z.string().min(1, 'Name ist Pflicht').max(100),
  typ: z.enum(['wartung', 'arbeitszettel', 'angebot']),
  items: z.array(itemSchema).default([]),
});
export type ChecklisteInput = z.infer<typeof checklisteInputSchema>;

interface Row {
  id: string;
  name: string;
  typ: ChecklistenVorlageTyp;
  items: string;
}

function rowTo(row: Row): ChecklistenVorlage {
  let items: { text: string }[] = [];
  try {
    items = JSON.parse(row.items) as { text: string }[];
  } catch {
    /* ignore */
  }
  return { id: row.id, name: row.name, typ: row.typ, items };
}

export function listChecklisten(
  db: Database.Database,
  typ?: ChecklistenVorlageTyp,
): ChecklistenVorlage[] {
  let sql = 'SELECT id, name, typ, items FROM checkliste_vorlage';
  const params: unknown[] = [];
  if (typ) {
    sql += ' WHERE typ = ?';
    params.push(typ);
  }
  sql += ' ORDER BY LOWER(name)';
  const rows = db.prepare(sql).all(...params) as Row[];
  return rows.map(rowTo);
}

export function getCheckliste(db: Database.Database, id: string): ChecklistenVorlage | null {
  const row = db
    .prepare('SELECT id, name, typ, items FROM checkliste_vorlage WHERE id = ?')
    .get(id) as Row | undefined;
  return row ? rowTo(row) : null;
}

export function createCheckliste(
  db: Database.Database,
  input: ChecklisteInput,
): ChecklistenVorlage {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO checkliste_vorlage (id, name, typ, items) VALUES (?, ?, ?, ?)',
  ).run(id, input.name, input.typ, JSON.stringify(input.items));
  return { id, name: input.name, typ: input.typ, items: input.items };
}

export function updateCheckliste(
  db: Database.Database,
  id: string,
  input: ChecklisteInput,
): ChecklistenVorlage {
  const existing = getCheckliste(db, id);
  if (!existing) throw new ChecklisteError('NOT_FOUND', 'Checkliste nicht gefunden');
  db.prepare(
    'UPDATE checkliste_vorlage SET name = ?, typ = ?, items = ? WHERE id = ?',
  ).run(input.name, input.typ, JSON.stringify(input.items), id);
  return { id, name: input.name, typ: input.typ, items: input.items };
}

export function deleteCheckliste(db: Database.Database, id: string): void {
  const existing = getCheckliste(db, id);
  if (!existing) throw new ChecklisteError('NOT_FOUND', 'Checkliste nicht gefunden');
  db.prepare('DELETE FROM checkliste_vorlage WHERE id = ?').run(id);
}
