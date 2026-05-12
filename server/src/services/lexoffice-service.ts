import type Database from 'better-sqlite3';
import type { Auftrag, LexofficeSyncResult, LexofficeTestResponse } from '@ahv/shared';
import {
  type LexofficeContact,
  type LexofficeContactInput,
  type LexofficeInvoice,
  type LexofficeInvoiceInput,
  type LexofficeLineItem,
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
import { getAuftrag } from './auftrag-service.js';
import { recordLog } from './log-service.js';
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

// ============================================================================
// Auftrag → Lexoffice Invoice (Phase 4)
// ============================================================================

const DEFAULT_FOOTER_TEMPLATE =
  'Im Bruttobetrag sind {lohnkosten_brutto} Lohnkosten enthalten.\nDie darin enthaltene Umsatzsteuer beträgt {lohnkosten_ust}.';

const DEFAULT_LOHN_MWST = 19;

/** Format EUR mit Komma — exakt wie es Niklas in den Footer schreibt. */
function formatEuroComma(n: number): string {
  return `${n
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
}

export interface LohnkostenResult {
  netto: number;
  brutto: number;
  ust: number;
}

/**
 * Berechnet die Lohnkosten-Anteile eines Auftrags (für den §35a-Footer).
 *
 * - Material/Pauschalen mit ist_lohnkosten=true: brutto = netto * (1 + mwst/100)
 * - Teilleistungen werden ebenfalls aggregiert (gleiche Logik)
 * - Mitarbeiter-Stunden: ALLE als Lohnkosten gezählt, MwSt aus Config
 *   (default 19%)
 *
 * Liefert exakt zwei Nachkommastellen — pro Position gerundet damit das
 * mit dem zusammenpasst was Lexoffice am Ende ausrechnet.
 */
export function computeLohnkosten(
  auftrag: Auftrag,
  lohnMwst: number,
): LohnkostenResult {
  let netto = 0;
  let ust = 0;

  for (const m of auftrag.materialien) {
    if (!m.ist_lohnkosten) continue;
    const posNetto = round2(m.menge * m.preis_netto);
    const posUst = round2((posNetto * m.mwst_prozent) / 100);
    netto += posNetto;
    ust += posUst;
  }

  for (const t of auftrag.teilleistungen) {
    for (const m of t.materialien) {
      if (!m.ist_lohnkosten) continue;
      const posNetto = round2(m.menge * m.preis_netto);
      const posUst = round2((posNetto * m.mwst_prozent) / 100);
      netto += posNetto;
      ust += posUst;
    }
  }

  // Mitarbeiter-Stunden: immer Lohnkosten
  const allMitarbeiter = [
    ...auftrag.mitarbeiter,
    ...auftrag.teilleistungen.flatMap((t) => t.mitarbeiter),
  ];
  for (const ma of allMitarbeiter) {
    const posNetto = round2(ma.stundenpreis * ma.stunden);
    const posUst = round2((posNetto * lohnMwst) / 100);
    netto += posNetto;
    ust += posUst;
  }

  netto = round2(netto);
  ust = round2(ust);
  const brutto = round2(netto + ust);
  return { netto, brutto, ust };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Setzt Platzhalter im Footer-Template. */
function renderFooter(template: string, lk: LohnkostenResult): string {
  return template
    .replace(/\{lohnkosten_brutto\}/g, formatEuroComma(lk.brutto))
    .replace(/\{lohnkosten_ust\}/g, formatEuroComma(lk.ust))
    .replace(/\{lohnkosten_netto\}/g, formatEuroComma(lk.netto));
}

/**
 * Mappt einen Auftrag auf den Lexoffice-Invoice-Payload.
 *
 * Reihenfolge der lineItems (laut Spec von Niklas):
 *  1. Materialien (ist_lohnkosten=false)
 *  2. Pauschalen / Lohnkosten-Material (ist_lohnkosten=true)
 *  3. Arbeitsleistung (Mitarbeiter als service-LineItems)
 *
 * Teilleistungen werden in dieselben drei Gruppen gemerged.
 */
export function auftragToInvoicePayload(
  auftrag: Auftrag,
  kundeLexofficeId: string | null,
  options: { footerTemplate: string; lohnMwst: number },
): LexofficeInvoiceInput {
  // Alle Material-Zeilen (top + teilleistungen) zusammenfassen
  const alleMaterialien = [
    ...auftrag.materialien,
    ...auftrag.teilleistungen.flatMap((t) => t.materialien),
  ];
  const alleMitarbeiter = [
    ...auftrag.mitarbeiter,
    ...auftrag.teilleistungen.flatMap((t) => t.mitarbeiter),
  ];

  const materialItems: LexofficeLineItem[] = alleMaterialien
    .filter((m) => !m.ist_lohnkosten)
    .map((m) => ({
      type: 'custom',
      name: m.name || 'Material',
      quantity: m.menge,
      unitName: m.einheit || 'Stk',
      unitPrice: {
        currency: 'EUR',
        netAmount: round2(m.preis_netto),
        taxRatePercentage: m.mwst_prozent,
      },
    }));

  const pauschalenItems: LexofficeLineItem[] = alleMaterialien
    .filter((m) => m.ist_lohnkosten)
    .map((m) => ({
      type: 'custom',
      name: m.name || 'Pauschale',
      quantity: m.menge,
      unitName: m.einheit || 'Psch',
      unitPrice: {
        currency: 'EUR',
        netAmount: round2(m.preis_netto),
        taxRatePercentage: m.mwst_prozent,
      },
    }));

  // Mitarbeiter zu service-Items aggregieren — gleicher Stundenpreis kann
  // zusammengezogen werden ist nice, aber zu komplex; wir nehmen pro
  // Mitarbeiter-Eintrag eine Zeile.
  const lohnItems: LexofficeLineItem[] = alleMitarbeiter
    .filter((ma) => ma.stunden > 0)
    .map((ma) => ({
      type: 'custom',
      name: `Arbeitslohn ${ma.stufe_bezeichnung || ''}${ma.name ? ` (${ma.name})` : ''}`.trim(),
      quantity: ma.stunden,
      unitName: 'h',
      unitPrice: {
        currency: 'EUR',
        netAmount: round2(ma.stundenpreis),
        taxRatePercentage: options.lohnMwst,
      },
    }));

  const lineItems = [...materialItems, ...pauschalenItems, ...lohnItems];

  // Empty-Items haben wir vermieden — aber Lexoffice braucht mindestens 1
  if (lineItems.length === 0) {
    lineItems.push({
      type: 'text',
      name: auftrag.titel || 'Leistung',
      description: auftrag.beschreibung || '',
    });
  }

  const lohnkosten = computeLohnkosten(auftrag, options.lohnMwst);
  const footer = lohnkosten.brutto > 0 ? renderFooter(options.footerTemplate, lohnkosten) : '';

  // Adresse: Wenn lexoffice_id da → verknüpfen, sonst aus Snapshot bauen
  const snap = auftrag.kunde_snapshot;
  const addressName =
    snap.typ === 'firma'
      ? snap.firmenname ?? ''
      : [snap.vorname, snap.nachname].filter(Boolean).join(' ');

  return {
    voucherDate: `${auftrag.datum}T00:00:00.000+02:00`,
    address: kundeLexofficeId
      ? { contactId: kundeLexofficeId }
      : {
          name: addressName || 'Kunde',
          street: snap.strasse ?? undefined,
          zip: snap.plz ?? undefined,
          city: snap.ort ?? undefined,
          countryCode: 'DE',
        },
    lineItems,
    totalPrice: { currency: 'EUR' },
    taxConditions: { taxType: 'net' },
    shippingConditions: {
      shippingDate: `${auftrag.datum}T00:00:00.000+02:00`,
      shippingType: 'service',
    },
    paymentConditions: {
      paymentTermLabel: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
      paymentTermDuration: 14,
    },
    title: auftrag.titel || `${auftrag.typ}`,
    introduction: auftrag.beschreibung || undefined,
    remark: footer || undefined,
  };
}

function readFooterTemplate(db: Database.Database): string {
  return getConfig(db, 'lexoffice_footer_template') ?? DEFAULT_FOOTER_TEMPLATE;
}

function readLohnMwst(db: Database.Database): number {
  return getConfig(db, 'lexoffice_lohn_mwst') ?? DEFAULT_LOHN_MWST;
}

/**
 * Schickt einen Auftrag als Rechnung-Entwurf an Lexoffice.
 *
 * Ablauf:
 *  1. Auftrag laden, prüfen ob schon synced
 *  2. Falls Kunde keine lexoffice_id hat → erst in Lexoffice anlegen
 *  3. Invoice-Payload bauen + POST /invoices?finalize=false (Draft)
 *  4. lexoffice_invoice_id im Auftrag speichern
 */
export async function pushAuftragToLexoffice(
  db: Database.Database,
  auftragId: string,
): Promise<{ invoiceId: string; created: boolean }> {
  readApiKey(db); // wirft NO_API_KEY wenn fehlend

  const auftrag = getAuftrag(db, auftragId);
  if (!auftrag) {
    throw new LexofficeServiceError('API_ERROR', 'Auftrag nicht gefunden');
  }

  // Wenn schon synced → das ist ein Resync-Call (Footer neu rechnen)
  if (auftrag.lexoffice_invoice_id) {
    await resyncLexofficeFooter(db, auftragId);
    return { invoiceId: auftrag.lexoffice_invoice_id, created: false };
  }

  // Kunde sicherstellen
  let kundeLexofficeId: string | null = null;
  if (auftrag.kunde_id) {
    const kunde = getKunde(db, auftrag.kunde_id);
    if (kunde) {
      if (kunde.lexoffice_id) {
        kundeLexofficeId = kunde.lexoffice_id;
      } else {
        // Neuer Kunde → in Lexoffice anlegen + lokal verknüpfen
        kundeLexofficeId = await createKundeInLexoffice(db, kunde);
        db.prepare('UPDATE kunde SET lexoffice_id = ? WHERE id = ?').run(
          kundeLexofficeId,
          kunde.id,
        );
      }
    }
  }

  const payload = auftragToInvoicePayload(auftrag, kundeLexofficeId, {
    footerTemplate: readFooterTemplate(db),
    lohnMwst: readLohnMwst(db),
  });

  try {
    const created = await lexofficeClient.createInvoice(readApiKey(db), payload, {
      finalize: false,
    });
    db.prepare('UPDATE auftrag SET lexoffice_invoice_id = ? WHERE id = ?').run(
      created.id,
      auftragId,
    );
    recordLog(db, {
      action: 'lexoffice.invoice_created',
      entity_type: 'auftrag',
      entity_id: auftragId,
      message: `Lexoffice-Rechnung ${created.id.slice(0, 8)} angelegt`,
      metadata: { invoiceId: created.id },
    });
    logger.info('lexoffice.invoice_created', {
      auftragId,
      invoiceId: created.id,
    });
    return { invoiceId: created.id, created: true };
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

/**
 * Holt die aktuelle Invoice aus Lexoffice, berechnet die Lohnkosten aus
 * den dort vorhandenen lineItems (User könnte Preise geändert haben),
 * und schreibt nur den Remark-Text neu — keine Positions-Änderungen.
 *
 * Klappt nur solange die Invoice noch Draft ist. Bei finalisierten
 * Rechnungen wirft Lexoffice CONFLICT.
 */
export async function resyncLexofficeFooter(
  db: Database.Database,
  auftragId: string,
): Promise<{ ok: true }> {
  const apiKey = readApiKey(db);
  const auftrag = getAuftrag(db, auftragId);
  if (!auftrag?.lexoffice_invoice_id) {
    throw new LexofficeServiceError(
      'API_ERROR',
      'Auftrag wurde noch nicht zu Lexoffice gepusht',
    );
  }

  try {
    const invoice: LexofficeInvoice = await lexofficeClient.getInvoice(
      apiKey,
      auftrag.lexoffice_invoice_id,
    );

    // Lohnkosten aus dem aktuellen Lexoffice-Stand neu berechnen.
    // Heuristik: alle items mit name beginnt "Arbeitslohn" oder name in
    // den App-Pauschalen-Namen, die als ist_lohnkosten markiert sind.
    // Pragmatisch nehmen wir Folgendes: wir markieren die Lohnkosten-
    // Items beim initialen Anlegen über ein Custom-Pattern im Namen.
    // Da das fehleranfällig ist, rechnen wir hier aus DEM AUFTRAG neu
    // (nicht aus Lexoffice) und schreiben den Footer um. Der User soll
    // wissen: Lohnkosten beziehen sich auf die App-Werte. Wenn er in
    // Lexoffice Preise ändert, müsste er auch in der App ändern und
    // erneut syncen.
    //
    // Das ist für Phase 1 sauberer als ein fragiler Pattern-Match auf
    // Lexoffice-LineItems.
    const lohnkosten = computeLohnkosten(auftrag, readLohnMwst(db));
    const footer =
      lohnkosten.brutto > 0
        ? renderFooter(readFooterTemplate(db), lohnkosten)
        : '';

    const updated: LexofficeInvoiceInput & { version: number } = {
      ...invoice,
      remark: footer || invoice.remark || '',
      version: invoice.version,
    };

    await lexofficeClient.updateInvoice(apiKey, auftrag.lexoffice_invoice_id, updated);
    recordLog(db, {
      action: 'lexoffice.invoice_resynced',
      entity_type: 'auftrag',
      entity_id: auftragId,
      message: 'Lohnkosten-Footer aktualisiert',
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof LexofficeError) {
      if (err.code === 'CONFLICT') {
        throw new LexofficeServiceError(
          'API_ERROR',
          'Rechnung wurde in Lexoffice bereits finalisiert und kann nicht mehr geändert werden',
          { code: err.code, status: err.status },
        );
      }
      throw new LexofficeServiceError('API_ERROR', err.message, {
        code: err.code,
        status: err.status,
      });
    }
    throw err;
  }
}
