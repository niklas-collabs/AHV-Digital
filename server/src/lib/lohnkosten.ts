import type { Auftrag } from '@ahv/shared';

/** Lohnkosten gem. § 35a EStG für einen Auftrag. */
export interface LohnkostenResult {
  netto: number;
  brutto: number;
  ust: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Lohnkosten-Anteil eines Auftrags.
 *
 *  - Material/Pauschalen mit ist_lohnkosten=true: zählen mit ihrem
 *    MwSt-Satz
 *  - Mitarbeiter-Stunden: zählen IMMER (das ist der Sinn von § 35a),
 *    MwSt aus Parameter (Standard 19%)
 *  - Teilleistungen werden mit aggregiert
 *
 * Wird sowohl im PDF (§35a-Ausweis am Ende der Rechnung) als auch beim
 * Lexoffice-Push (remark / Fußnote) verwendet. Eine einzige Wahrheit
 * sichert, dass der Kunde überall denselben Betrag sieht.
 */
export function computeLohnkosten(
  auftrag: Auftrag,
  lohnMwstProzent: number,
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

  const allMitarbeiter = [
    ...auftrag.mitarbeiter,
    ...auftrag.teilleistungen.flatMap((t) => t.mitarbeiter),
  ];
  for (const ma of allMitarbeiter) {
    const posNetto = round2(ma.stundenpreis * ma.stunden);
    const posUst = round2((posNetto * lohnMwstProzent) / 100);
    netto += posNetto;
    ust += posUst;
  }

  netto = round2(netto);
  ust = round2(ust);
  return { netto, ust, brutto: round2(netto + ust) };
}
