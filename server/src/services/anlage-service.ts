import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import QRCode from 'qrcode';
import type { AnlageQr } from '@ahv/shared';
import { getKunde } from './kunde-service.js';
import { recordLog } from './log-service.js';

export class AnlageError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'AnlageError';
  }
}

export const anlageInputSchema = z.object({
  kunde_id: z.string().nullable().optional(),
  kunde_name: z.string().default(''),
  anlage: z.string().min(1, 'Anlage ist Pflicht').max(200),
  standort: z.string().max(200).nullable().optional(),
  wartungsplan_id: z.string().nullable().optional(),
});
export type AnlageInput = z.infer<typeof anlageInputSchema>;

interface AnlageRow {
  id: string;
  kunde_id: string | null;
  kunde_name: string;
  anlage: string;
  standort: string | null;
  wartungsplan_id: string | null;
  erstellt_am: string;
}

function rowTo(row: AnlageRow): AnlageQr {
  return { ...row };
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

export function listAnlagen(db: Database.Database): AnlageQr[] {
  const rows = db
    .prepare('SELECT * FROM anlage_qr ORDER BY erstellt_am DESC')
    .all() as AnlageRow[];
  return rows.map(rowTo);
}

export function getAnlage(db: Database.Database, id: string): AnlageQr | null {
  const row = db.prepare('SELECT * FROM anlage_qr WHERE id = ?').get(id) as
    | AnlageRow
    | undefined;
  return row ? rowTo(row) : null;
}

export function createAnlage(db: Database.Database, input: AnlageInput): AnlageQr {
  const id = randomUUID();
  const now = new Date().toISOString();
  const kundeName = resolveKundeName(db, input.kunde_id ?? null, input.kunde_name);

  db.prepare(
    `INSERT INTO anlage_qr (id, kunde_id, kunde_name, anlage, standort, wartungsplan_id, erstellt_am)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.kunde_id ?? null,
    kundeName,
    input.anlage,
    input.standort ?? null,
    input.wartungsplan_id ?? null,
    now,
  );

  // Falls die Anlage einen Wartungsplan hat, dort auch die QR-Code-ID setzen
  // (bidirektionale Verknüpfung für Schnellzugriff vom Wartungsplan aus)
  if (input.wartungsplan_id) {
    db.prepare('UPDATE wartungsplan SET qr_code_id = ? WHERE id = ?').run(
      id,
      input.wartungsplan_id,
    );
  }

  recordLog(db, {
    action: 'anlage.created',
    entity_type: 'anlage_qr',
    entity_id: id,
    message: `${kundeName} – ${input.anlage}`,
  });

  const created = getAnlage(db, id);
  if (!created) throw new Error('Anlage nach Insert nicht gefunden');
  return created;
}

export function updateAnlage(
  db: Database.Database,
  id: string,
  input: AnlageInput,
): AnlageQr {
  const existing = getAnlage(db, id);
  if (!existing) throw new AnlageError('NOT_FOUND', 'Anlage nicht gefunden');

  const kundeName = resolveKundeName(db, input.kunde_id ?? null, input.kunde_name);
  db.prepare(
    `UPDATE anlage_qr
       SET kunde_id = ?, kunde_name = ?, anlage = ?, standort = ?, wartungsplan_id = ?
     WHERE id = ?`,
  ).run(
    input.kunde_id ?? null,
    kundeName,
    input.anlage,
    input.standort ?? null,
    input.wartungsplan_id ?? null,
    id,
  );

  // Wartungsplan-Verknüpfung beidseitig pflegen
  if (existing.wartungsplan_id && existing.wartungsplan_id !== input.wartungsplan_id) {
    db.prepare('UPDATE wartungsplan SET qr_code_id = NULL WHERE id = ?').run(
      existing.wartungsplan_id,
    );
  }
  if (input.wartungsplan_id) {
    db.prepare('UPDATE wartungsplan SET qr_code_id = ? WHERE id = ?').run(
      id,
      input.wartungsplan_id,
    );
  }

  const updated = getAnlage(db, id);
  if (!updated) throw new Error('Anlage nach Update nicht gefunden');
  return updated;
}

export function deleteAnlage(db: Database.Database, id: string): void {
  const existing = getAnlage(db, id);
  if (!existing) throw new AnlageError('NOT_FOUND', 'Anlage nicht gefunden');
  // qr_code_id im Wartungsplan auf null setzen (FK ON DELETE SET NULL macht's
  // ohnehin, aber explizit ist sicherer)
  if (existing.wartungsplan_id) {
    db.prepare('UPDATE wartungsplan SET qr_code_id = NULL WHERE id = ?').run(
      existing.wartungsplan_id,
    );
  }
  db.prepare('DELETE FROM anlage_qr WHERE id = ?').run(id);
  recordLog(db, {
    action: 'anlage.deleted',
    entity_type: 'anlage_qr',
    entity_id: id,
    message: `${existing.kunde_name} – ${existing.anlage}`,
  });
}

/**
 * Erzeugt das QR-Code-PNG mit der URL zur Anlagen-Detailseite.
 * baseUrl kommt aus dem Request (Origin), damit wir nicht zur Build-Zeit
 * eine fixe Domain brauchen.
 */
export async function generateAnlageQrPng(
  anlageId: string,
  baseUrl: string,
): Promise<Buffer> {
  const url = new URL(`/qr/${anlageId}`, baseUrl).toString();
  return QRCode.toBuffer(url, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}
