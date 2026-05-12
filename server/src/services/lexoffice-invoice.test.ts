import { describe, expect, it } from 'vitest';
import type { Auftrag } from '@ahv/shared';
import {
  auftragToInvoicePayload,
  computeLohnkosten,
} from './lexoffice-service.js';

function makeAuftrag(overrides: Partial<Auftrag> = {}): Auftrag {
  return {
    id: 'a-1',
    typ: 'arbeitszettel',
    status: 'entwurf',
    titel: 'Heizungswartung',
    datum: '2026-05-10',
    beschreibung: 'Test',
    notiz_intern: '',
    kunde_id: null,
    kunde_snapshot: {
      typ: 'privat',
      firmenname: null,
      vorname: 'Max',
      nachname: 'Mustermann',
      email: null,
      strasse: 'Hauptstr. 1',
      plz: '12345',
      ort: 'Berlin',
    },
    objekt_adresse: null,
    mitarbeiter: [],
    materialien: [],
    fotos: [],
    signature_data_url: null,
    checkliste: null,
    teilleistungen: [],
    urspruenglicher_auftrag_id: null,
    lexoffice_invoice_id: null,
    erstellt_am: '',
    geaendert_am: '',
    abgeschickt_am: null,
    ...overrides,
  };
}

describe('computeLohnkosten', () => {
  it('zählt Material nur mit ist_lohnkosten=true', () => {
    const a = makeAuftrag({
      materialien: [
        {
          name: 'Rohr',
          menge: 5,
          einheit: 'm',
          preis_netto: 10,
          mwst_prozent: 19,
          ist_lohnkosten: false,
        },
        {
          name: 'Anfahrt',
          menge: 1,
          einheit: 'Psch',
          preis_netto: 50,
          mwst_prozent: 19,
          ist_lohnkosten: true,
        },
      ],
    });
    const lk = computeLohnkosten(a, 19);
    // 50 netto + 9.50 ust = 59.50 brutto
    expect(lk.netto).toBeCloseTo(50, 2);
    expect(lk.ust).toBeCloseTo(9.5, 2);
    expect(lk.brutto).toBeCloseTo(59.5, 2);
  });

  it('zählt alle Mitarbeiter-Stunden als Lohn (Default 19%)', () => {
    const a = makeAuftrag({
      mitarbeiter: [
        {
          name: 'Max',
          stufe_id: null,
          stufe_bezeichnung: 'Geselle',
          stundenpreis: 50,
          stunden: 4,
        },
      ],
    });
    const lk = computeLohnkosten(a, 19);
    // 200 netto + 38 ust = 238 brutto
    expect(lk.netto).toBeCloseTo(200, 2);
    expect(lk.ust).toBeCloseTo(38, 2);
    expect(lk.brutto).toBeCloseTo(238, 2);
  });

  it('inkludiert Teilleistungen', () => {
    const a = makeAuftrag({
      teilleistungen: [
        {
          id: 't1',
          bezeichnung: 'Etappe 1',
          datum: '2026-05-10',
          notiz: '',
          mitarbeiter: [
            {
              name: 'Max',
              stufe_id: null,
              stufe_bezeichnung: 'Geselle',
              stundenpreis: 50,
              stunden: 2,
            },
          ],
          materialien: [
            {
              name: 'Pressgerät',
              menge: 1,
              einheit: 'Psch',
              preis_netto: 30,
              mwst_prozent: 19,
              ist_lohnkosten: true,
            },
          ],
        },
      ],
    });
    const lk = computeLohnkosten(a, 19);
    // Mitarbeiter: 100 netto + 19 ust
    // Pauschale:    30 netto + 5.70 ust
    // Total: 130 netto, 24.70 ust, 154.70 brutto
    expect(lk.netto).toBeCloseTo(130, 2);
    expect(lk.ust).toBeCloseTo(24.7, 2);
    expect(lk.brutto).toBeCloseTo(154.7, 2);
  });

  it('liefert 0 wenn keine Lohnkosten-Positionen vorhanden sind', () => {
    const a = makeAuftrag({
      materialien: [
        {
          name: 'Schraube',
          menge: 10,
          einheit: 'Stk',
          preis_netto: 1,
          mwst_prozent: 19,
          ist_lohnkosten: false,
        },
      ],
    });
    const lk = computeLohnkosten(a, 19);
    expect(lk.netto).toBe(0);
    expect(lk.brutto).toBe(0);
    expect(lk.ust).toBe(0);
  });

  it('rechnet exakt mit dem Beispiel aus dem Screenshot (852,04 / 136,04)', () => {
    // Beispiel-Konfiguration die die Zahlen aus dem Briefbogen liefert
    // Netto 716 → 19% USt = 136.04 → Brutto 852.04
    const a = makeAuftrag({
      mitarbeiter: [
        {
          name: 'M1',
          stufe_id: null,
          stufe_bezeichnung: 'Geselle',
          stundenpreis: 50,
          stunden: 8,
        },
        {
          name: 'M2',
          stufe_id: null,
          stufe_bezeichnung: 'Geselle',
          stundenpreis: 79,
          stunden: 4,
        },
      ],
    });
    const lk = computeLohnkosten(a, 19);
    expect(lk.netto).toBeCloseTo(716, 2);
    expect(lk.ust).toBeCloseTo(136.04, 2);
    expect(lk.brutto).toBeCloseTo(852.04, 2);
  });
});

describe('auftragToInvoicePayload', () => {
  it('sortiert lineItems in Reihenfolge Material → Pauschalen → Arbeitslohn', () => {
    const a = makeAuftrag({
      mitarbeiter: [
        {
          name: 'Max',
          stufe_id: null,
          stufe_bezeichnung: 'Geselle',
          stundenpreis: 50,
          stunden: 4,
        },
      ],
      materialien: [
        {
          name: 'Rohr',
          menge: 5,
          einheit: 'm',
          preis_netto: 10,
          mwst_prozent: 19,
          ist_lohnkosten: false,
        },
        {
          name: 'Anfahrt',
          menge: 1,
          einheit: 'Psch',
          preis_netto: 50,
          mwst_prozent: 19,
          ist_lohnkosten: true,
        },
      ],
    });
    const payload = auftragToInvoicePayload(a, null, {
      footerTemplate: 'Brutto {lohnkosten_brutto} · USt {lohnkosten_ust}',
      lohnMwst: 19,
    });
    expect(payload.lineItems.length).toBe(3);
    expect(payload.lineItems[0]?.name).toBe('Rohr');
    expect(payload.lineItems[1]?.name).toBe('Anfahrt');
    expect(payload.lineItems[2]?.name).toContain('Arbeitslohn');
  });

  it('verknüpft Kunde per contactId wenn lexoffice_id gegeben', () => {
    const a = makeAuftrag();
    const payload = auftragToInvoicePayload(a, 'lxof-contact-123', {
      footerTemplate: '',
      lohnMwst: 19,
    });
    expect(payload.address.contactId).toBe('lxof-contact-123');
    expect(payload.address.name).toBeUndefined();
  });

  it('nutzt Adresse aus Snapshot wenn keine contactId', () => {
    const a = makeAuftrag();
    const payload = auftragToInvoicePayload(a, null, {
      footerTemplate: '',
      lohnMwst: 19,
    });
    expect(payload.address.contactId).toBeUndefined();
    expect(payload.address.name).toBe('Max Mustermann');
    expect(payload.address.street).toBe('Hauptstr. 1');
    expect(payload.address.zip).toBe('12345');
  });

  it('rendert Footer-Template mit Lohnkosten-Platzhaltern', () => {
    const a = makeAuftrag({
      mitarbeiter: [
        {
          name: 'M',
          stufe_id: null,
          stufe_bezeichnung: 'G',
          stundenpreis: 50,
          stunden: 4,
        },
      ],
    });
    const payload = auftragToInvoicePayload(a, null, {
      footerTemplate:
        'Im Bruttobetrag sind {lohnkosten_brutto} Lohnkosten enthalten. Davon USt: {lohnkosten_ust}.',
      lohnMwst: 19,
    });
    expect(payload.remark).toContain('238,00 €');
    expect(payload.remark).toContain('38,00 €');
  });

  it('fügt mindestens einen Text-LineItem ein wenn der Auftrag leer ist', () => {
    const a = makeAuftrag();
    const payload = auftragToInvoicePayload(a, null, {
      footerTemplate: '',
      lohnMwst: 19,
    });
    expect(payload.lineItems.length).toBe(1);
    expect(payload.lineItems[0]?.type).toBe('text');
  });

  it('läßt remark leer wenn keine Lohnkosten vorhanden', () => {
    const a = makeAuftrag({
      materialien: [
        {
          name: 'Schraube',
          menge: 10,
          einheit: 'Stk',
          preis_netto: 1,
          mwst_prozent: 19,
          ist_lohnkosten: false,
        },
      ],
    });
    const payload = auftragToInvoicePayload(a, null, {
      footerTemplate: 'sollte nicht erscheinen',
      lohnMwst: 19,
    });
    expect(payload.remark).toBeUndefined();
  });
});
