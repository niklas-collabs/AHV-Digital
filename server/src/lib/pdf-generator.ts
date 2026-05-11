import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Auftrag,
  AuftragMaterial,
  AuftragMitarbeiter,
  AuftragTyp,
  FirmaConfig,
  KundeSnapshot,
  Teilleistung,
} from '@ahv/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Eingebettete TTFs liegen neben dem Code (in src/assets/fonts beim Dev,
// in dist/assets/fonts nach Build — copy-sql.js kopiert sie mit).
const FONT_DIR = path.resolve(__dirname, '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Roboto-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Roboto-Bold.ttf');

// Pdfkit-Font-Aliase (bei jedem Doc registriert)
const F_REGULAR = 'body';
const F_BOLD = 'body-bold';

export interface PdfContext {
  auftrag: Auftrag;
  firma: FirmaConfig | null;
  logo: { buffer: Buffer; mime: string } | null;
}

const TYP_LABEL: Record<AuftragTyp, string> = {
  arbeitszettel: 'Arbeitszettel',
  angebot: 'Angebot',
  lieferschein: 'Lieferschein',
};

const COLOR_TEXT = '#1a1a1a';
const COLOR_MUTED = '#6b6b6b';
const COLOR_LINE = '#bdbdbd';
const COLOR_HEAD = '#2563eb';

const PAGE_MARGIN = 50;

/**
 * Erzeugt das PDF zu einem Auftrag und gibt den Buffer zurück. Drei Layouts
 * je nach Typ:
 *  - Arbeitszettel: Mitarbeiter + Material (ohne Preise), Unterschriftsfeld
 *  - Angebot:        Material mit Preisen + Summen netto/MwSt/brutto
 *  - Lieferschein:   Material ohne Preise, Empfangs-Unterschriftsfeld
 */
export function generateAuftragPdf(ctx: PdfContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, info: buildPdfInfo(ctx) });
      doc.registerFont(F_REGULAR, FONT_REGULAR);
      doc.registerFont(F_BOLD, FONT_BOLD);
      doc.font(F_REGULAR);

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawHeader(doc, ctx);
      drawKundeAndMeta(doc, ctx);
      drawTitle(doc, ctx);
      if (ctx.auftrag.beschreibung.trim()) {
        drawBeschreibung(doc, ctx);
      }

      const showPrices = ctx.auftrag.typ === 'angebot';
      const showMitarbeiter = ctx.auftrag.typ === 'arbeitszettel';

      if (showMitarbeiter && ctx.auftrag.mitarbeiter.length > 0) {
        drawMitarbeiterTable(doc, ctx.auftrag.mitarbeiter);
      }
      if (ctx.auftrag.materialien.length > 0) {
        drawMaterialTable(doc, ctx.auftrag.materialien, { showPrices });
      }

      // Teilleistungen (Phase 2.7): jeweils eigener Block mit Datum,
      // Bezeichnung, Mitarbeiter- und Material-Tabelle. Summen werden
      // bei drawSummen über alle Materialien aufaddiert.
      for (const t of ctx.auftrag.teilleistungen) {
        drawTeilleistung(doc, t, { showPrices, showMitarbeiter });
      }

      if (showPrices) {
        const allMat = collectAllMaterialien(ctx.auftrag);
        if (allMat.length > 0) {
          drawSummen(doc, allMat);
        }
      }

      if (ctx.auftrag.typ !== 'angebot') {
        drawSignatureField(doc, ctx);
      }

      drawFooter(doc, ctx);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ============================================================================
// Header
// ============================================================================

function drawHeader(doc: PDFKit.PDFDocument, ctx: PdfContext): void {
  const top = PAGE_MARGIN;
  const right = doc.page.width - PAGE_MARGIN;

  // Logo links (falls da), max 110×60
  if (ctx.logo) {
    try {
      doc.image(ctx.logo.buffer, PAGE_MARGIN, top, { fit: [110, 60] });
    } catch {
      // Bild defekt → einfach überspringen, Header bleibt sonst gleich
    }
  }

  // Firma-Adresse rechts
  if (ctx.firma) {
    doc
      .font(F_BOLD)
      .fontSize(11)
      .fillColor(COLOR_TEXT)
      .text(ctx.firma.name || '', PAGE_MARGIN + 130, top, { width: right - PAGE_MARGIN - 130, align: 'right' });

    doc
      .font(F_REGULAR)
      .fontSize(9)
      .fillColor(COLOR_MUTED);

    const adressZeilen = [
      ctx.firma.strasse,
      [ctx.firma.plz, ctx.firma.ort].filter(Boolean).join(' '),
      ctx.firma.telefon ? `Tel.: ${ctx.firma.telefon}` : '',
      ctx.firma.email,
    ].filter(Boolean);

    for (const zeile of adressZeilen) {
      doc.text(zeile, { width: right - PAGE_MARGIN - 130, align: 'right' });
    }
  }

  // Trennlinie unter Header
  doc
    .moveTo(PAGE_MARGIN, top + 75)
    .lineTo(right, top + 75)
    .lineWidth(0.5)
    .strokeColor(COLOR_LINE)
    .stroke();

  doc.y = top + 90;
  doc.fillColor(COLOR_TEXT);
}

// ============================================================================
// Kunde & Meta
// ============================================================================

function drawKundeAndMeta(doc: PDFKit.PDFDocument, ctx: PdfContext): void {
  const startY = doc.y;
  const colWidth = (doc.page.width - PAGE_MARGIN * 2 - 20) / 2;

  // Links: Kunde (Snapshot)
  doc
    .font(F_BOLD)
    .fontSize(8)
    .fillColor(COLOR_MUTED)
    .text('KUNDE', PAGE_MARGIN, startY, { width: colWidth });

  doc
    .moveDown(0.2)
    .font(F_REGULAR)
    .fontSize(10)
    .fillColor(COLOR_TEXT);

  const kundeLines = formatKundeLines(ctx.auftrag.kunde_snapshot);
  for (const line of kundeLines) {
    doc.text(line, { width: colWidth });
  }

  if (ctx.auftrag.objekt_adresse) {
    doc
      .moveDown(0.5)
      .font(F_BOLD)
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text('EINSATZORT', { width: colWidth })
      .moveDown(0.2)
      .font(F_REGULAR)
      .fontSize(10)
      .fillColor(COLOR_TEXT)
      .text(ctx.auftrag.objekt_adresse, { width: colWidth });
  }

  const leftEnd = doc.y;

  // Rechts: Meta (Datum, Typ, ID-Kurz)
  const rightX = PAGE_MARGIN + colWidth + 20;

  doc
    .font(F_BOLD)
    .fontSize(8)
    .fillColor(COLOR_MUTED)
    .text('DATUM', rightX, startY, { width: colWidth });

  doc
    .moveDown(0.2)
    .font(F_REGULAR)
    .fontSize(10)
    .fillColor(COLOR_TEXT)
    .text(formatDate(ctx.auftrag.datum), rightX);

  doc
    .moveDown(0.5)
    .font(F_BOLD)
    .fontSize(8)
    .fillColor(COLOR_MUTED)
    .text('TYP', rightX, undefined, { continued: false })
    .moveDown(0.2)
    .font(F_REGULAR)
    .fontSize(10)
    .fillColor(COLOR_TEXT)
    .text(TYP_LABEL[ctx.auftrag.typ], rightX);

  doc
    .moveDown(0.5)
    .font(F_BOLD)
    .fontSize(8)
    .fillColor(COLOR_MUTED)
    .text('AUFTRAGS-NR.', rightX, undefined, { continued: false })
    .moveDown(0.2)
    .font(F_REGULAR)
    .fontSize(10)
    .fillColor(COLOR_TEXT)
    .text(ctx.auftrag.id.slice(0, 8).toUpperCase(), rightX);

  const rightEnd = doc.y;

  doc.y = Math.max(leftEnd, rightEnd) + 15;
  doc.x = PAGE_MARGIN;
}

function formatKundeLines(snap: KundeSnapshot): string[] {
  const lines: string[] = [];
  if (snap.typ === 'firma') {
    if (snap.firmenname) lines.push(snap.firmenname);
    const ans = [snap.vorname, snap.nachname].filter(Boolean).join(' ');
    if (ans) lines.push(ans);
  } else {
    const name = [snap.vorname, snap.nachname].filter(Boolean).join(' ');
    if (name) lines.push(name);
  }
  if (snap.strasse) lines.push(snap.strasse);
  const ort = [snap.plz, snap.ort].filter(Boolean).join(' ');
  if (ort) lines.push(ort);
  if (lines.length === 0) lines.push('—');
  return lines;
}

// ============================================================================
// Titel + Beschreibung
// ============================================================================

function drawTitle(doc: PDFKit.PDFDocument, ctx: PdfContext): void {
  doc
    .font(F_BOLD)
    .fontSize(16)
    .fillColor(COLOR_HEAD)
    .text(`${TYP_LABEL[ctx.auftrag.typ]}: ${ctx.auftrag.titel || '(ohne Titel)'}`, PAGE_MARGIN, doc.y, {
      width: doc.page.width - PAGE_MARGIN * 2,
    });
  doc.moveDown(0.5);
  doc.fillColor(COLOR_TEXT);
}

function drawBeschreibung(doc: PDFKit.PDFDocument, ctx: PdfContext): void {
  doc
    .font(F_BOLD)
    .fontSize(8)
    .fillColor(COLOR_MUTED)
    .text('BESCHREIBUNG', PAGE_MARGIN);
  doc
    .moveDown(0.2)
    .font(F_REGULAR)
    .fontSize(10)
    .fillColor(COLOR_TEXT)
    .text(ctx.auftrag.beschreibung, { width: doc.page.width - PAGE_MARGIN * 2 });
  doc.moveDown(0.7);
}

// ============================================================================
// Tabellen
// ============================================================================

interface ColumnDef {
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

function drawTable(
  doc: PDFKit.PDFDocument,
  columns: ColumnDef[],
  rows: string[][],
  options: { headerLabel: string },
): void {
  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  const totalDefined = columns.reduce((s, c) => s + c.width, 0);
  // Skaliere so, dass Summe der widths == tableWidth
  const scale = tableWidth / totalDefined;
  const widths = columns.map((c) => c.width * scale);

  doc
    .font(F_BOLD)
    .fontSize(8)
    .fillColor(COLOR_MUTED)
    .text(options.headerLabel, PAGE_MARGIN);
  doc.moveDown(0.3);

  let cursorY = doc.y;
  let cursorX = PAGE_MARGIN;

  // Header-Zeile
  doc.font(F_BOLD).fontSize(9).fillColor(COLOR_TEXT);
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    doc.text(col.label, cursorX, cursorY, { width: widths[i]!, align: col.align ?? 'left' });
    cursorX += widths[i]!;
  }
  cursorY = doc.y + 2;
  doc
    .moveTo(PAGE_MARGIN, cursorY)
    .lineTo(PAGE_MARGIN + tableWidth, cursorY)
    .lineWidth(0.5)
    .strokeColor(COLOR_LINE)
    .stroke();
  cursorY += 4;

  // Daten-Zeilen
  doc.font(F_REGULAR).fontSize(9).fillColor(COLOR_TEXT);
  for (const row of rows) {
    cursorX = PAGE_MARGIN;
    const startY = cursorY;
    let maxY = cursorY;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]!;
      doc.text(row[i] ?? '', cursorX, startY, { width: widths[i]!, align: col.align ?? 'left' });
      maxY = Math.max(maxY, doc.y);
      cursorX += widths[i]!;
    }
    cursorY = maxY + 4;
    if (cursorY > doc.page.height - PAGE_MARGIN - 80) {
      doc.addPage();
      cursorY = PAGE_MARGIN;
    }
  }

  doc.y = cursorY + 6;
  doc.x = PAGE_MARGIN;
}

function drawMitarbeiterTable(
  doc: PDFKit.PDFDocument,
  rows: AuftragMitarbeiter[],
): void {
  drawTable(
    doc,
    [
      { label: 'Name', width: 3 },
      { label: 'Stufe', width: 2.5 },
      { label: 'Stunden', width: 1.5, align: 'right' },
    ],
    rows.map((m) => [
      m.name || '—',
      m.stufe_bezeichnung || '—',
      formatDecimal(m.stunden, 2) + ' h',
    ]),
    { headerLabel: 'MITARBEITER' },
  );
}

function drawMaterialTable(
  doc: PDFKit.PDFDocument,
  rows: AuftragMaterial[],
  options: { showPrices: boolean },
): void {
  const baseCols: ColumnDef[] = [
    { label: 'Bezeichnung', width: options.showPrices ? 3.5 : 5 },
    { label: 'Menge', width: 1, align: 'right' },
    { label: 'Einheit', width: 1 },
  ];

  if (options.showPrices) {
    baseCols.push(
      { label: 'EUR netto', width: 1.2, align: 'right' },
      { label: 'MwSt', width: 0.8, align: 'right' },
      { label: 'Summe', width: 1.5, align: 'right' },
    );
  }

  drawTable(
    doc,
    baseCols,
    rows.map((m) => {
      const base = [m.name || '—', formatDecimal(m.menge, 2), m.einheit];
      if (options.showPrices) {
        const summe = m.menge * m.preis_netto;
        base.push(
          formatEuro(m.preis_netto),
          `${m.mwst_prozent}%`,
          formatEuro(summe),
        );
      }
      return base;
    }),
    { headerLabel: 'POSITIONEN' },
  );
}

// ============================================================================
// Teilleistungen
// ============================================================================

function drawTeilleistung(
  doc: PDFKit.PDFDocument,
  t: Teilleistung,
  options: { showPrices: boolean; showMitarbeiter: boolean },
): void {
  // Seitenumbruch wenn weniger als ~120 px Restplatz auf der Seite
  if (doc.y > doc.page.height - PAGE_MARGIN - 120) {
    doc.addPage();
  }
  doc.moveDown(0.5);

  const right = doc.page.width - PAGE_MARGIN;
  const headerY = doc.y;

  doc
    .font(F_BOLD)
    .fontSize(11)
    .fillColor(COLOR_HEAD)
    .text(t.bezeichnung || 'Teilleistung', PAGE_MARGIN, headerY, {
      width: right - PAGE_MARGIN - 100,
    });

  doc
    .font(F_REGULAR)
    .fontSize(9)
    .fillColor(COLOR_MUTED)
    .text(formatDate(t.datum), PAGE_MARGIN, headerY, {
      width: right - PAGE_MARGIN,
      align: 'right',
    });

  doc.fillColor(COLOR_TEXT);
  doc.moveDown(0.3);

  if (t.notiz.trim()) {
    doc
      .font(F_REGULAR)
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(t.notiz, PAGE_MARGIN, doc.y, { width: right - PAGE_MARGIN });
    doc.moveDown(0.3);
    doc.fillColor(COLOR_TEXT);
  }

  if (options.showMitarbeiter && t.mitarbeiter.length > 0) {
    drawMitarbeiterTable(doc, t.mitarbeiter);
  }
  if (t.materialien.length > 0) {
    drawMaterialTable(doc, t.materialien, { showPrices: options.showPrices });
  }
}

function collectAllMaterialien(auftrag: Auftrag): AuftragMaterial[] {
  return [
    ...auftrag.materialien,
    ...auftrag.teilleistungen.flatMap((t) => t.materialien),
  ];
}

// ============================================================================
// Summen
// ============================================================================

function drawSummen(doc: PDFKit.PDFDocument, materialien: AuftragMaterial[]): void {
  // Berechne pro MwSt-Satz
  const byMwst = new Map<number, { netto: number; ust: number }>();
  for (const m of materialien) {
    const netto = m.menge * m.preis_netto;
    const ust = (netto * m.mwst_prozent) / 100;
    const cur = byMwst.get(m.mwst_prozent) ?? { netto: 0, ust: 0 };
    cur.netto += netto;
    cur.ust += ust;
    byMwst.set(m.mwst_prozent, cur);
  }
  const sortedSaetze = [...byMwst.keys()].sort((a, b) => b - a);
  const summeNetto = [...byMwst.values()].reduce((s, v) => s + v.netto, 0);
  const summeUst = [...byMwst.values()].reduce((s, v) => s + v.ust, 0);
  const summeBrutto = summeNetto + summeUst;

  const right = doc.page.width - PAGE_MARGIN;
  const left = right - 200;

  doc.moveDown(0.5);
  let y = doc.y;

  function drawLine(label: string, value: string, options: { bold?: boolean } = {}) {
    doc
      .font(options.bold ? F_BOLD : F_REGULAR)
      .fontSize(10)
      .fillColor(COLOR_TEXT)
      .text(label, left, y, { width: 110 })
      .text(value, left + 110, y, { width: 90, align: 'right' });
    y = doc.y + 2;
  }

  drawLine('Summe netto', formatEuro(summeNetto));
  for (const satz of sortedSaetze) {
    const v = byMwst.get(satz)!;
    drawLine(`zzgl. ${satz}% USt`, formatEuro(v.ust));
  }
  doc
    .moveTo(left, y + 1)
    .lineTo(right, y + 1)
    .lineWidth(0.5)
    .strokeColor(COLOR_LINE)
    .stroke();
  y += 4;
  drawLine('Gesamtbetrag', formatEuro(summeBrutto), { bold: true });

  // §35a EStG: Lohnkostenanteil separat ausweisen, falls vorhanden.
  // Privatkunden können diesen Betrag in der Steuererklärung absetzen.
  const lohnkostenBrutto = materialien
    .filter((m) => m.ist_lohnkosten)
    .reduce((sum, m) => {
      const netto = m.menge * m.preis_netto;
      return sum + netto * (1 + m.mwst_prozent / 100);
    }, 0);
  if (lohnkostenBrutto > 0) {
    y += 6;
    doc
      .font(F_REGULAR)
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text(
        `davon Lohnkosten gem. § 35a EStG (brutto): ${formatEuro(lohnkostenBrutto)}`,
        left,
        y,
        { width: 200, align: 'right' },
      );
    y = doc.y + 2;
    doc.fillColor(COLOR_TEXT);
  }

  doc.y = y + 10;
  doc.x = PAGE_MARGIN;
}

// ============================================================================
// Unterschrift
// ============================================================================

function drawSignatureField(doc: PDFKit.PDFDocument, ctx: PdfContext): void {
  // Mindestens 90 px für die Unterschrift reservieren — sonst Seitenumbruch
  if (doc.y > doc.page.height - PAGE_MARGIN - 120) {
    doc.addPage();
  }
  doc.moveDown(2);

  const y = doc.y;
  const right = doc.page.width - PAGE_MARGIN;
  const lineY = y + 35;

  // Falls Unterschrift schon erfasst, zeichne sie ein
  const sig = ctx.auftrag.signature_data_url;
  if (sig && sig.startsWith('data:image/')) {
    try {
      const base64 = sig.split(',')[1];
      if (base64) {
        const buf = Buffer.from(base64, 'base64');
        doc.image(buf, PAGE_MARGIN, y, { fit: [200, 40] });
      }
    } catch {
      // ignore
    }
  }

  // Unterschriftslinie
  doc
    .moveTo(PAGE_MARGIN, lineY)
    .lineTo(PAGE_MARGIN + 220, lineY)
    .lineWidth(0.5)
    .strokeColor(COLOR_LINE)
    .stroke();

  doc
    .font(F_REGULAR)
    .fontSize(8)
    .fillColor(COLOR_MUTED)
    .text(
      ctx.auftrag.typ === 'lieferschein' ? 'Empfangsbestätigung Kunde' : 'Unterschrift Kunde',
      PAGE_MARGIN,
      lineY + 4,
    );

  // Datum-Linie rechts
  doc
    .moveTo(right - 150, lineY)
    .lineTo(right, lineY)
    .stroke();
  doc
    .text('Datum', right - 150, lineY + 4)
    .moveDown();

  doc.y = lineY + 25;
}

// ============================================================================
// Fußzeile
// ============================================================================

function drawFooter(doc: PDFKit.PDFDocument, ctx: PdfContext): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - PAGE_MARGIN + 5;
    const right = doc.page.width - PAGE_MARGIN;

    doc
      .moveTo(PAGE_MARGIN, y - 5)
      .lineTo(right, y - 5)
      .lineWidth(0.5)
      .strokeColor(COLOR_LINE)
      .stroke();

    doc.font(F_REGULAR).fontSize(7).fillColor(COLOR_MUTED);

    if (ctx.firma) {
      const lines: string[] = [];
      if (ctx.firma.name) lines.push(ctx.firma.name);
      const adr = [ctx.firma.strasse, [ctx.firma.plz, ctx.firma.ort].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' · ');
      if (adr) lines.push(adr);
      if (ctx.firma.ust_nr) lines.push(`USt-Nr.: ${ctx.firma.ust_nr}`);
      const bank = [ctx.firma.bank, ctx.firma.iban, ctx.firma.bic].filter(Boolean).join(' · ');
      if (bank) lines.push(bank);
      doc.text(lines.join(' | '), PAGE_MARGIN, y, {
        width: right - PAGE_MARGIN - 60,
      });
    }

    doc.text(`Seite ${i - range.start + 1} / ${range.count}`, right - 60, y, {
      width: 60,
      align: 'right',
    });
  }
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatDecimal(n: number, digits: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}

function buildPdfInfo(ctx: PdfContext): PDFKit.DocumentInfo {
  return {
    Title: `${TYP_LABEL[ctx.auftrag.typ]}: ${ctx.auftrag.titel || ctx.auftrag.id.slice(0, 8)}`,
    Author: ctx.firma?.name ?? 'AHV Arbeitszettel',
    Producer: 'AHV-Digital',
    Creator: 'AHV-Digital',
    CreationDate: new Date(ctx.auftrag.erstellt_am),
  };
}
