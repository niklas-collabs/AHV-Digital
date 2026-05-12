import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import webpush from 'web-push';
import type { VapidKeys } from '@ahv/shared';
import { getConfig, setConfig } from './config-service.js';
import { listWartungsplaene, statusOf } from './wartungsplan-service.js';
import { recordLog } from './log-service.js';
import { logger } from '../lib/logger.js';

export class PushError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'INVALID_KEYS',
    message: string,
  ) {
    super(message);
    this.name = 'PushError';
  }
}

export const subscribeInputSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  user_agent: z.string().optional(),
});
export type SubscribeInput = z.infer<typeof subscribeInputSchema>;

interface SubscriptionRow {
  id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  user_agent: string | null;
  erstellt_am: string;
}

/**
 * Liefert die VAPID-Keys oder erzeugt sie beim ersten Aufruf. Der Public-Key
 * geht ans Frontend (zum Subscriben), der Private-Key bleibt server-seitig.
 * Die Erzeugung ist deterministisch über eine Lifetime — einmal generiert,
 * bleiben sie für alle Subscriptions gültig.
 */
export function getOrGenerateVapidKeys(db: Database.Database): VapidKeys {
  const existing = getConfig(db, 'vapid_keys');
  if (existing) return existing;
  const generated = webpush.generateVAPIDKeys();
  setConfig(db, 'vapid_keys', generated);
  logger.info('push.vapid_generated');
  return generated;
}

/**
 * Konfiguriert webpush für den aktuellen Server. Wird beim Start aufgerufen
 * (damit der erste Push nicht warten muss bis jemand /vapid-public-key
 * abruft).
 */
export function initWebPush(db: Database.Database, subject: string): void {
  const keys = getOrGenerateVapidKeys(db);
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
}

export function listSubscriptions(db: Database.Database): SubscriptionRow[] {
  return db.prepare('SELECT * FROM push_subscription ORDER BY erstellt_am DESC').all() as SubscriptionRow[];
}

/**
 * Subscribed ein Gerät. Endpoint ist UNIQUE — wenn derselbe Browser das
 * Setup nochmal aufruft, wird der bestehende Eintrag aktualisiert.
 */
export function subscribePush(
  db: Database.Database,
  input: SubscribeInput,
): { id: string; created: boolean } {
  const existing = db
    .prepare('SELECT id FROM push_subscription WHERE endpoint = ?')
    .get(input.endpoint) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE push_subscription
         SET keys_p256dh = ?, keys_auth = ?, user_agent = ?
       WHERE id = ?`,
    ).run(input.keys.p256dh, input.keys.auth, input.user_agent ?? null, existing.id);
    return { id: existing.id, created: false };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO push_subscription (id, endpoint, keys_p256dh, keys_auth, user_agent, erstellt_am)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.endpoint,
    input.keys.p256dh,
    input.keys.auth,
    input.user_agent ?? null,
    new Date().toISOString(),
  );
  recordLog(db, {
    action: 'push.subscribed',
    message: 'Push-Notification aktiviert',
    metadata: { user_agent: input.user_agent ?? null },
  });
  return { id, created: true };
}

export function unsubscribePush(db: Database.Database, endpoint: string): boolean {
  const result = db.prepare('DELETE FROM push_subscription WHERE endpoint = ?').run(endpoint);
  if (result.changes > 0) {
    recordLog(db, {
      action: 'push.unsubscribed',
      message: 'Push-Notification deaktiviert',
    });
    return true;
  }
  return false;
}

/**
 * Schickt eine Notification an alle subscribed Geräte. Bei 410 Gone /
 * 404 / 403 wird die Subscription automatisch gelöscht (Gerät weg).
 */
export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToAll(
  db: Database.Database,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; removed: number }> {
  const subs = listSubscriptions(db);
  let sent = 0;
  let failed = 0;
  let removed = 0;

  const json = JSON.stringify(payload);

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        },
        json,
      );
      sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410 || status === 403) {
        db.prepare('DELETE FROM push_subscription WHERE id = ?').run(sub.id);
        removed++;
      } else {
        failed++;
        logger.warn('push.send_failed', {
          status,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { sent, failed, removed };
}

/**
 * Prüft alle Wartungspläne und schickt Push für fällige/überfällige.
 * Wird vom Cron-Job um 7:00 Lokalzeit aufgerufen. Sendet nur, wenn
 * mindestens ein Plan Aufmerksamkeit braucht — keine spam-mässigen
 * "Heute keine Wartung fällig"-Pushes.
 */
export async function checkAndSendWartungsReminder(
  db: Database.Database,
): Promise<{ totalSent: number; remindersCount: number }> {
  const plaene = listWartungsplaene(db);
  const dueOrSoon = plaene.filter((p) => statusOf(p) !== 'ok');
  if (dueOrSoon.length === 0) {
    return { totalSent: 0, remindersCount: 0 };
  }

  const ueberfaellig = dueOrSoon.filter((p) => statusOf(p) === 'ueberfaellig');
  const bald = dueOrSoon.filter((p) => statusOf(p) === 'bald');

  const parts: string[] = [];
  if (ueberfaellig.length > 0) {
    parts.push(`${ueberfaellig.length} überfällig`);
  }
  if (bald.length > 0) {
    parts.push(`${bald.length} bald fällig`);
  }
  const body =
    dueOrSoon.length <= 3
      ? dueOrSoon.map((p) => `${p.anlage} (${p.kunde_name})`).join(', ')
      : parts.join(' · ');

  const result = await sendPushToAll(db, {
    title: 'AHV Wartungs-Erinnerung',
    body,
    url: '/wartung',
    tag: 'ahv-wartung-daily',
  });
  recordLog(db, {
    action: 'push.wartung_reminder',
    message: `${dueOrSoon.length} fällige Wartungen, ${result.sent} Push gesendet`,
    metadata: result,
  });
  return { totalSent: result.sent, remindersCount: dueOrSoon.length };
}
