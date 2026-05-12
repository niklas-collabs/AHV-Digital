import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { runMigrations } from '../db/migrations/runner.js';
import {
  getOrGenerateVapidKeys,
  listSubscriptions,
  subscribeInputSchema,
  subscribePush,
  unsubscribePush,
} from './push-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

const sampleSub = {
  endpoint: 'https://push.example.com/abc',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  user_agent: 'Mozilla/5.0 Test',
};

describe('push-service', () => {
  describe('VAPID-Keys', () => {
    it('generiert beim ersten Aufruf und cached danach', () => {
      const db = makeDb();
      const k1 = getOrGenerateVapidKeys(db);
      expect(k1.publicKey).toBeTruthy();
      expect(k1.privateKey).toBeTruthy();
      const k2 = getOrGenerateVapidKeys(db);
      expect(k2.publicKey).toBe(k1.publicKey);
    });
  });

  describe('subscribe/unsubscribe', () => {
    it('legt eine neue Subscription an', () => {
      const db = makeDb();
      const result = subscribePush(db, sampleSub);
      expect(result.created).toBe(true);
      expect(listSubscriptions(db).length).toBe(1);
    });

    it('aktualisiert eine bestehende Subscription mit gleichem Endpoint', () => {
      const db = makeDb();
      const first = subscribePush(db, sampleSub);
      const second = subscribePush(db, {
        ...sampleSub,
        keys: { p256dh: 'neu', auth: 'neu' },
      });
      expect(second.created).toBe(false);
      expect(second.id).toBe(first.id);
      expect(listSubscriptions(db).length).toBe(1);
      expect(listSubscriptions(db)[0]?.keys_p256dh).toBe('neu');
    });

    it('unsubscribe entfernt nach endpoint', () => {
      const db = makeDb();
      subscribePush(db, sampleSub);
      expect(unsubscribePush(db, sampleSub.endpoint)).toBe(true);
      expect(listSubscriptions(db).length).toBe(0);
    });

    it('unsubscribe liefert false bei unbekanntem Endpoint', () => {
      const db = makeDb();
      expect(unsubscribePush(db, 'https://gibts-nicht.example.com')).toBe(false);
    });
  });

  describe('Zod', () => {
    it('lehnt ungültigen Endpoint ab', () => {
      expect(() =>
        subscribeInputSchema.parse({
          endpoint: 'not-a-url',
          keys: { p256dh: 'x', auth: 'y' },
        }),
      ).toThrow(ZodError);
    });

    it('lehnt fehlende Keys ab', () => {
      expect(() =>
        subscribeInputSchema.parse({
          endpoint: 'https://push.example.com',
          keys: { p256dh: '', auth: '' },
        }),
      ).toThrow(ZodError);
    });
  });
});
