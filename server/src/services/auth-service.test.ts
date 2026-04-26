import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../db/migrations/runner.js';
import {
  AuthError,
  _resetJwtSecretCache,
  generateToken,
  getAuthStatus,
  login,
  setupPin,
  verifyToken,
} from './auth-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

describe('auth-service', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-chars-long-xx';
    _resetJwtSecretCache();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    _resetJwtSecretCache();
  });

  describe('setupPin', () => {
    it('setzt initialen PIN auf leerer auth-Zeile', async () => {
      const db = makeDb();
      const result = await setupPin(db, { pin: '1234' });
      expect(result.token).toBeTypeOf('string');

      const row = db.prepare('SELECT pin_hash FROM auth WHERE id = 1').get() as {
        pin_hash: string | null;
      };
      expect(row.pin_hash).not.toBeNull();
      expect(row.pin_hash?.length).toBeGreaterThan(20); // bcrypt hash
    });

    it('lehnt PIN mit weniger als 4 Ziffern ab', async () => {
      const db = makeDb();
      await expect(setupPin(db, { pin: '12' })).rejects.toThrow(AuthError);
    });

    it('lehnt PIN mit nicht-Ziffern ab', async () => {
      const db = makeDb();
      await expect(setupPin(db, { pin: '12ab' })).rejects.toThrow(AuthError);
    });

    it('verlangt oldPin bei bestehendem PIN', async () => {
      const db = makeDb();
      await setupPin(db, { pin: '1234' });
      await expect(setupPin(db, { pin: '5678' })).rejects.toMatchObject({
        code: 'OLD_PIN_REQUIRED',
      });
    });

    it('lehnt falschen oldPin ab', async () => {
      const db = makeDb();
      await setupPin(db, { pin: '1234' });
      await expect(setupPin(db, { pin: '5678', oldPin: '0000' })).rejects.toMatchObject({
        code: 'OLD_PIN_INCORRECT',
      });
    });

    it('akzeptiert PIN-Wechsel mit korrektem oldPin', async () => {
      const db = makeDb();
      await setupPin(db, { pin: '1234' });
      const result = await setupPin(db, { pin: '5678', oldPin: '1234' });
      expect(result.token).toBeTypeOf('string');

      // Alter PIN funktioniert nicht mehr
      await expect(login(db, '1234')).rejects.toMatchObject({ code: 'INVALID_PIN' });
      // Neuer PIN funktioniert
      await expect(login(db, '5678')).resolves.toMatchObject({ token: expect.any(String) });
    });
  });

  describe('login', () => {
    it('wirft NEEDS_SETUP wenn kein PIN gesetzt ist', async () => {
      const db = makeDb();
      await expect(login(db, '1234')).rejects.toMatchObject({ code: 'NEEDS_SETUP' });
    });

    it('liefert Token bei korrektem PIN', async () => {
      const db = makeDb();
      await setupPin(db, { pin: '1234' });
      const result = await login(db, '1234');
      expect(result.token).toBeTypeOf('string');
    });

    it('zaehlt failed_attempts hoch bei falschem PIN', async () => {
      const db = makeDb();
      await setupPin(db, { pin: '1234' });

      try {
        await login(db, '0000');
        expect.fail('sollte werfen');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).code).toBe('INVALID_PIN');
        expect((err as AuthError).meta.attemptsLeft).toBe(4);
      }

      const row = db.prepare('SELECT failed_attempts FROM auth WHERE id = 1').get() as {
        failed_attempts: number;
      };
      expect(row.failed_attempts).toBe(1);
    });

    it('sperrt nach 5 Fehlversuchen', async () => {
      const db = makeDb();
      await setupPin(db, { pin: '1234' });

      for (let i = 0; i < 4; i++) {
        await expect(login(db, '0000')).rejects.toMatchObject({ code: 'INVALID_PIN' });
      }

      // 5. Versuch → Lockout
      await expect(login(db, '0000')).rejects.toMatchObject({ code: 'LOCKED' });

      // Auch ein korrekter PIN scheitert wegen aktivem Lock
      await expect(login(db, '1234')).rejects.toMatchObject({ code: 'LOCKED' });

      const row = db.prepare('SELECT locked_until FROM auth WHERE id = 1').get() as {
        locked_until: string | null;
      };
      expect(row.locked_until).not.toBeNull();
      expect(new Date(row.locked_until!).getTime()).toBeGreaterThan(Date.now());
    });

    it('setzt counter zurueck bei Erfolg', async () => {
      const db = makeDb();
      await setupPin(db, { pin: '1234' });
      await expect(login(db, '0000')).rejects.toThrow();
      await expect(login(db, '0000')).rejects.toThrow();

      await login(db, '1234');

      const row = db.prepare('SELECT failed_attempts, locked_until FROM auth WHERE id = 1').get() as {
        failed_attempts: number;
        locked_until: string | null;
      };
      expect(row.failed_attempts).toBe(0);
      expect(row.locked_until).toBeNull();
    });

    it('akzeptiert Login wieder nachdem locked_until in der Vergangenheit liegt', async () => {
      const db = makeDb();
      await setupPin(db, { pin: '1234' });

      // Lock manuell auf vergangenes Datum setzen
      const past = new Date(Date.now() - 60_000).toISOString();
      db.prepare('UPDATE auth SET failed_attempts = 5, locked_until = ? WHERE id = 1').run(past);

      const result = await login(db, '1234');
      expect(result.token).toBeTypeOf('string');
    });
  });

  describe('token', () => {
    it('generate + verify roundtrip', async () => {
      const token = await generateToken();
      const result = await verifyToken(token);
      expect(result.valid).toBe(true);
    });

    it('weist ungueltigen Token zurueck', async () => {
      const result = await verifyToken('not.a.valid.jwt');
      expect(result.valid).toBe(false);
    });

    it('weist Token mit anderem Secret zurueck', async () => {
      const token = await generateToken();

      // Anderes Secret
      process.env.JWT_SECRET = 'different-secret-also-32-chars-long-xxx';
      _resetJwtSecretCache();

      const result = await verifyToken(token);
      expect(result.valid).toBe(false);
    });
  });

  describe('getAuthStatus', () => {
    it('meldet needsSetup=true auf leerer DB', async () => {
      const db = makeDb();
      const status = await getAuthStatus(db, undefined);
      expect(status).toEqual({
        needsSetup: true,
        authenticated: false,
        lockedUntil: null,
      });
    });

    it('meldet authenticated=true mit gueltigem Token', async () => {
      const db = makeDb();
      await setupPin(db, { pin: '1234' });
      const result = await login(db, '1234');
      const status = await getAuthStatus(db, result.token);
      expect(status.authenticated).toBe(true);
      expect(status.needsSetup).toBe(false);
    });

    it('meldet lockedUntil bei aktivem Lock', async () => {
      const db = makeDb();
      await setupPin(db, { pin: '1234' });
      const future = new Date(Date.now() + 5 * 60_000).toISOString();
      db.prepare('UPDATE auth SET failed_attempts = 5, locked_until = ? WHERE id = 1').run(future);

      const status = await getAuthStatus(db, undefined);
      expect(status.lockedUntil).toBe(future);
    });
  });
});
