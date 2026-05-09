import nodemailer, { type Transporter } from 'nodemailer';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Auftrag, FirmaConfig, GmailConfig } from '@ahv/shared';
import { getConfig } from './config-service.js';
import { generateAuftragPdf } from '../lib/pdf-generator.js';
import { readFoto } from './foto-service.js';
import { readLogo } from './logo-service.js';
import { resolveUploadsDir } from '../db/client.js';
import { recordLog } from './log-service.js';
import { logger } from '../lib/logger.js';

export class MailServiceError extends Error {
  constructor(
    public readonly code:
      | 'NO_GMAIL_CONFIG'
      | 'NO_FIRMA_EMAIL'
      | 'NO_RECIPIENT'
      | 'AUTH_FAILED'
      | 'SMTP_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'MailServiceError';
  }
}

const TYP_LABEL: Record<Auftrag['typ'], string> = {
  arbeitszettel: 'Arbeitszettel',
  angebot: 'Angebot',
  lieferschein: 'Lieferschein',
};

function buildTransporter(gmail: GmailConfig): Transporter {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmail.user,
      pass: gmail.app_passwort,
    },
  });
}

function readGmailConfig(db: Database.Database): GmailConfig {
  const cfg = getConfig(db, 'gmail');
  if (!cfg || !cfg.user || !cfg.app_passwort) {
    throw new MailServiceError(
      'NO_GMAIL_CONFIG',
      'Gmail ist nicht konfiguriert. Bitte E-Mail-Adresse und App-Passwort in den Einstellungen hinterlegen.',
    );
  }
  return cfg;
}

async function sendWithErrorMapping(
  transporter: Transporter,
  options: nodemailer.SendMailOptions,
): Promise<void> {
  try {
    await transporter.sendMail(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/535|invalid|denied|auth/i.test(message)) {
      throw new MailServiceError(
        'AUTH_FAILED',
        'Gmail-Authentifizierung fehlgeschlagen. Stimmt das App-Passwort?',
      );
    }
    throw new MailServiceError('SMTP_ERROR', `Mail-Versand fehlgeschlagen: ${message}`);
  }
}

/**
 * Sendet eine Test-Mail an die Firma-Adresse, um die Gmail-Konfiguration
 * zu prüfen.
 */
export async function sendTestMail(db: Database.Database): Promise<{ to: string }> {
  const gmail = readGmailConfig(db);
  const firma = getConfig(db, 'firma');
  const to = firma?.email?.trim() || gmail.user;

  const transporter = buildTransporter(gmail);
  await sendWithErrorMapping(transporter, {
    from: `"${firma?.name ?? 'AHV Arbeitszettel'}" <${gmail.user}>`,
    to,
    subject: 'AHV Arbeitszettel — Test-Mail',
    text:
      'Dies ist eine Test-Mail aus AHV-Digital.\n\n' +
      'Wenn du diese Mail bekommst, ist die Gmail-Konfiguration korrekt.\n\n' +
      'Versendet: ' +
      new Date().toLocaleString('de-DE'),
  });

  recordLog(db, {
    action: 'mail.test_sent',
    message: `Test-Mail an ${to}`,
    metadata: { to },
  });

  return { to };
}

export interface SendAuftragMailOptions {
  /** Mail an Kunden-Email schicken (nur wenn vorhanden) */
  sendKunde: boolean;
  /** Foto-Anhänge mitschicken */
  sendFotos: boolean;
}

export interface SendAuftragMailResult {
  ok: true;
  recipients: string[];
  fotosAttached: number;
}

/**
 * Erzeugt das PDF zum Auftrag und mailt es an die Firma-E-Mail (immer)
 * sowie optional an die Kunden-Email aus dem Snapshot.
 */
export async function sendAuftragMail(
  db: Database.Database,
  auftrag: Auftrag,
  options: SendAuftragMailOptions,
): Promise<SendAuftragMailResult> {
  const gmail = readGmailConfig(db);
  const firma = getConfig(db, 'firma');
  const firmaEmail = firma?.email?.trim();
  if (!firmaEmail) {
    throw new MailServiceError(
      'NO_FIRMA_EMAIL',
      'Firma-E-Mail ist nicht hinterlegt. Bitte in den Einstellungen unter „Firma" eintragen.',
    );
  }

  const recipients: string[] = [firmaEmail];
  if (options.sendKunde) {
    const kundeEmail = auftrag.kunde_snapshot.email?.trim();
    if (kundeEmail) {
      recipients.push(kundeEmail);
    }
  }

  // PDF generieren
  const logo = readLogo(db, resolveUploadsDir());
  const pdfBuffer = await generateAuftragPdf({ auftrag, firma, logo });

  // Foto-Anhänge sammeln
  let fotoAttachments: { filename: string; content: Buffer; contentType: string }[] = [];
  if (options.sendFotos && auftrag.fotos.length > 0) {
    fotoAttachments = auftrag.fotos
      .map((filename, idx) => {
        const buffer = readFoto(resolveUploadsDir(), auftrag.id, filename);
        if (!buffer) return null;
        return {
          filename: `foto-${idx + 1}.jpg`,
          content: buffer,
          contentType: 'image/jpeg',
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  const titel = auftrag.titel || `${TYP_LABEL[auftrag.typ]} ${auftrag.id.slice(0, 8)}`;
  const datum = formatDate(auftrag.datum);
  const safeFilename =
    titel.replace(/[^a-zA-Z0-9-_äöüÄÖÜ ]/g, '').replace(/\s+/g, '_').slice(0, 60) || 'auftrag';

  const transporter = buildTransporter(gmail);
  await sendWithErrorMapping(transporter, {
    from: `"${firma?.name ?? 'AHV Arbeitszettel'}" <${gmail.user}>`,
    to: recipients,
    subject: `${TYP_LABEL[auftrag.typ]}: ${titel}`,
    text: buildBody(auftrag, firma),
    attachments: [
      {
        filename: `${auftrag.typ}_${safeFilename}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
      ...fotoAttachments,
    ],
  });

  recordLog(db, {
    action: 'auftrag.mail_sent',
    entity_type: 'auftrag',
    entity_id: auftrag.id,
    message: `Mail an ${recipients.join(', ')} (${fotoAttachments.length} Foto(s))`,
    metadata: {
      recipients,
      fotosAttached: fotoAttachments.length,
      typ: auftrag.typ,
    },
  });

  logger.info('mail.auftrag_sent', {
    auftragId: auftrag.id,
    recipients: recipients.length,
    fotos: fotoAttachments.length,
  });

  return { ok: true, recipients, fotosAttached: fotoAttachments.length };
}

function buildBody(auftrag: Auftrag, firma: FirmaConfig | null): string {
  const titel = auftrag.titel || `${TYP_LABEL[auftrag.typ]} ${auftrag.id.slice(0, 8)}`;
  const datum = formatDate(auftrag.datum);
  const firmaName = firma?.name ?? '';
  const lines = [
    `anbei senden wir Ihnen den ${TYP_LABEL[auftrag.typ]} "${titel}" vom ${datum}.`,
    '',
  ];

  if (auftrag.beschreibung.trim()) {
    lines.push('Kurzbeschreibung:', auftrag.beschreibung.trim(), '');
  }

  lines.push('Bei Rückfragen sind wir gerne für Sie da.', '');
  if (firmaName) {
    lines.push('Mit freundlichen Grüßen', firmaName);
  } else {
    lines.push('Mit freundlichen Grüßen');
  }

  return 'Sehr geehrte Damen und Herren,\n\n' + lines.join('\n');
}

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Liefert ob die Mail-Funktion grundsätzlich nutzbar ist (Gmail + Firma-Email
 * konfiguriert). Wird vom Frontend für die Sichtbarkeit der Sende-Optionen
 * genutzt.
 */
export function getMailReadiness(
  db: Database.Database,
): { gmailSet: boolean; firmaEmailSet: boolean } {
  const gmail = getConfig(db, 'gmail');
  const firma = getConfig(db, 'firma');
  return {
    gmailSet: !!gmail?.user && !!gmail?.app_passwort,
    firmaEmailSet: !!firma?.email?.trim(),
  };
}
