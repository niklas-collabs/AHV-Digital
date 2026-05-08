import type Database from 'better-sqlite3';
import type { LexofficeSyncResult, LexofficeTestResponse } from '@ahv/shared';
import {
  type LexofficeContact,
  type LexofficeContactInput,
  LexofficeError,
  lexofficeClient,
} from '../lib/lexoffice-client.js';
import { getConfig, setConfig } from './config-service.js';
import {
  createKunde,
  getKunde,
  type KundeInput,
  listKunden,
  updateKunde,
} from './kunde-service.js';
import { logger } from '../lib/logger.js';

export class LexofficeServiceError extends Error {
  constructor(
    public readonly code: 'NO_API_KEY' | 'API_ERROR',
    message: string,
    public readonly meta: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'LexofficeServiceError';
  }
}

function readApiKey(db: Database.Database): string {
  const key = getConfig(db, 'lexoffice_api_key');
  if (!key) {
    throw new LexofficeServiceError('NO_API_KEY', 'Lexoffice API-Key ist nicht gesetzt');
  }
  return key;
}

export async function testLexofficeConnection(db: Database.Database): Promise<LexofficeTestResponse> {
  const apiKey = readApiKey(db);
  try {
    const { contactsTotal } = await lexofficeClient.testConnection(apiKey);
    return { ok: true, contactsTotal };
  } catch (err) {
    if (err instanceof LexofficeError) {
      throw new LexofficeServiceError('API_ERROR', err.message, { code: err.code, status: err.status });
    }
    throw err;
  }
}

// === Mapping ===

function pickFirst(arr?: string[]): string | null {
  if (!arr || arr.length === 0) return null;
  return arr[0] ?? null;
}

/**
 * Liefert KundeInput im discriminated-union-Format. Bei Firma sind
 * vorname/nachname optional (Ansprechpartner), bei Privat Pflicht — der
 * Aufrufer prüft im Sync-Loop ob die Pflichtfelder vorhanden sind und
 * überspringt Datensätze sonst.
 */
function lexofficeToKundeInput(c: LexofficeContact): KundeInput {
  const billing = c.addresses?.billing?.[0];
  const email =
    pickFirst(c.emailAddresses?.business) ??
    pickFirst(c.emailAddresses?.office) ??
    pickFirst(c.emailAddresses?.private) ??
    pickFirst(c.emailAddresses?.other) ??
    '';
  const telefon =
    pickFirst(c.phoneNumbers?.business) ??
    pickFirst(c.phoneNumbers?.office) ??
    pickFirst(c.phoneNumbers?.mobile) ??
    pickFirst(c.phoneNumbers?.private) ??
    pickFirst(c.phoneNumbers?.other) ??
    '';

  const baseAddress = {
    email,
    telefon,
    strasse: billing?.street ?? '',
    plz: billing?.zip ?? '',
    ort: billing?.city ?? '',
    notiz: c.note ?? '',
  };

  if (c.company?.name) {
    const ans = c.company.contactPersons?.[0];
    return {
      typ: 'firma',
      firmenname: c.company.name,
      vorname: ans?.firstName ?? '',
      nachname: ans?.lastName ?? '',
      ...baseAddress,
    };
  }

  return {
    typ: 'privat',
    vorname: c.person?.firstName ?? '',
    nachname: c.person?.lastName ?? '',
    firmenname: '',
    ...baseAddress,
  };
}

/**
 * Konvertiert unseren Kunde-Input in das von Lexoffice erwartete Schema.
 */
export function kundeToLexofficeInput(input: {
  typ: 'privat' | 'firma';
  firmenname?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  telefon?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  notiz?: string | null;
}): LexofficeContactInput {
  const result: LexofficeContactInput = {
    roles: { customer: {} as Record<string, never> },
  };

  if (input.typ === 'firma') {
    result.company = {
      name: input.firmenname ?? '',
    };
    if (input.vorname || input.nachname) {
      result.company.contactPersons = [
        {
          firstName: input.vorname ?? undefined,
          lastName: input.nachname ?? undefined,
          primary: true,
        },
      ];
    }
  } else {
    result.person = {
      firstName: input.vorname ?? '',
      lastName: input.nachname ?? '',
    };
  }

  if (input.strasse || input.plz || input.ort) {
    result.addresses = {
      billing: [
        {
          street: input.strasse ?? undefined,
          zip: input.plz ?? undefined,
          city: input.ort ?? undefined,
          countryCode: 'DE',
        },
      ],
    };
  }

  if (input.email) {
    result.emailAddresses = { business: [input.email] };
  }
  if (input.telefon) {
    result.phoneNumbers = { business: [input.telefon] };
  }
  if (input.notiz) {
    result.note = input.notiz;
  }

  return result;
}

/**
 * Synchronisiert Lexoffice-Kunden in die lokale DB.
 * - Neue Kontakte werden angelegt
 * - Bekannte (per lexoffice_id verknüpft) werden aktualisiert
 * - Fehler bei einzelnen Records werden gesammelt, der Sync läuft weiter
 */
export async function syncLexofficeKunden(db: Database.Database): Promise<LexofficeSyncResult> {
  const apiKey = readApiKey(db);

  // Index: lexoffice_id -> lokaler Kunde
  const known = new Map<string, string>();
  for (const k of listKunden(db)) {
    if (k.lexoffice_id) known.set(k.lexoffice_id, k.id);
  }

  const result: LexofficeSyncResult = {
    added: 0,
    updated: 0,
    skipped: 0,
    total: 0,
    errors: [],
  };

  try {
    for await (const contact of lexofficeClient.iterateAllCustomers(apiKey)) {
      result.total++;
      const mapped = lexofficeToKundeInput(contact);

      // Pflichtfeld-Check: skip wenn alle Namen-Felder leer sind
      if (mapped.typ === 'privat' && !mapped.vorname && !mapped.nachname) {
        result.skipped++;
        continue;
      }
      if (mapped.typ === 'firma' && !mapped.firmenname) {
        result.skipped++;
        continue;
      }

      // Privat: wenn nur eines von vorname/nachname leer, das andere als
      // Fallback nutzen — Schema verlangt beide
      const payload: KundeInput =
        mapped.typ === 'privat'
          ? {
              ...mapped,
              vorname: mapped.vorname || mapped.nachname,
              nachname: mapped.nachname || mapped.vorname,
            }
          : mapped;

      const knownLocalId = known.get(contact.id);
      try {
        if (knownLocalId) {
          updateKunde(db, knownLocalId, payload);
          result.updated++;
        } else {
          // Anlegen — und lexoffice_id setzen (geschieht via SQL-Update direkt,
          // weil createKunde lexoffice_id immer auf null setzt)
          const created = createKunde(db, payload);
          db.prepare('UPDATE kunde SET lexoffice_id = ? WHERE id = ?').run(contact.id, created.id);
          result.added++;
        }
      } catch (err) {
        result.errors.push({
          lexofficeId: contact.id,
          reason: err instanceof Error ? err.message : 'Unbekannter Fehler',
        });
      }
    }
  } catch (err) {
    if (err instanceof LexofficeError) {
      throw new LexofficeServiceError('API_ERROR', err.message, {
        code: err.code,
        status: err.status,
      });
    }
    throw err;
  }

  // Last-Sync-Timestamp speichern
  setConfig(db, 'lexoffice_last_sync', new Date().toISOString());
  logger.info('lexoffice.sync_completed', { ...result });

  return result;
}

/**
 * Legt einen Kunden in Lexoffice an und liefert die neue Lexoffice-ID
 * zurück. Fehler werden geworfen; Aufrufer entscheidet was zu tun ist
 * (z.B. lokal trotzdem speichern und Status melden).
 */
export async function createKundeInLexoffice(
  db: Database.Database,
  input: Parameters<typeof kundeToLexofficeInput>[0],
): Promise<string> {
  const apiKey = readApiKey(db);
  try {
    const payload = kundeToLexofficeInput(input);
    const created = await lexofficeClient.createContact(apiKey, payload);
    return created.id;
  } catch (err) {
    if (err instanceof LexofficeError) {
      throw new LexofficeServiceError('API_ERROR', err.message, {
        code: err.code,
        status: err.status,
      });
    }
    throw err;
  }
}
