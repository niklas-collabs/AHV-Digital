import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../db/migrations/runner.js';
import {
  AuthError,
  _resetJwtSecretCache,
  changeBenutzerPin,
  createBenutzer,
  deleteBenutzer,
  generateToken,
  getAuthStatus,
  listBenutzer,
  login,
  setupInitial,
  updateBenutzerName,
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

describe('auth-service (Multi-User)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-chars-long-xx';
    _resetJwtSecretCache();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    _resetJwtSecretCache();
  });

  describe('setupInitial', () => {
    it('legt den ersten Benutzer an', async () => {
      const db = makeDb();
      const result = await setupInitial(db, { name: 'Niklas', pin: '1234' });
      expect(result.userId).toBeTruthy();
      expect(result.token).toBeTruthy();
      const users = listBenutzer(db);
      expect(users.length).toBe(1);
      expect(users[0]?.name).toBe('Niklas');
    });

    it('lehnt Setup ab wenn schon ein Benutzer existiert', async () => {
      const db = makeDb();
      await setupInitial(db, { name: 'A', pin: '1234' });
      await expect(setupInitial(db, { name: 'B', pin: '5678' })).rejects.toThrow(AuthError);
    });

    it('validiert PIN-Format', async () => {
      const db = makeDb();
      await expect(setupInitial(db, { name: 'A', pin: 'abcd' })).rejects.toThrow(AuthError);
      await expect(setupInitial(db, { name: 'A', pin: '123' })).rejects.toThrow(AuthError);
    });

    it('validiert Name', async () => {
      const db = makeDb();
      await expect(setupInitial(db, { name: '', pin: '1234' })).rejects.toThrow(AuthError);
    });
  });

  describe('createBenutzer', () => {
    it('legt weiteren Benutzer an', async () => {
      const db = makeDb();
      await setupInitial(db, { name: 'Niklas', pin: '1234' });
      const tobi = await createBenutzer(db, { name: 'Tobi', pin: '5678' });
      expect(tobi.name).toBe('Tobi');
      expect(listBenutzer(db).length).toBe(2);
    });

    it('erlaubt gleichen PIN bei verschiedenen Benutzern (Option A: Auswahl + PIN)', async () => {
      const db = makeDb();
      await setupInitial(db, { name: 'A', pin: '1234' });
      await createBenutzer(db, { name: 'B', pin: '1234' });
      expect(listBenutzer(db).length).toBe(2);
    });
  });

  describe('login', () => {
    it('liefert Token bei korrektem PIN', async () => {
      const db = makeDb();
      const setup = await setupInitial(db, { name: 'Niklas', pin: '1234' });
      const result = await login(db, { userId: setup.userId, pin: '1234' });
      expect(result.token).toBeTruthy();
      expect(result.user.name).toBe('Niklas');
    });

    it('lehnt falschen PIN ab', async () => {
      const db = makeDb();
      const setup = await setupInitial(db, { name: 'Niklas', pin: '1234' });
      await expect(login(db, { userId: setup.userId, pin: '9999' })).rejects.toThrow(AuthError);
    });

    it('lehnt unbekannte userId mit INVALID_PIN ab (kein User-Enumeration)', async () => {
      const db = makeDb();
      await setupInitial(db, { name: 'A', pin: '1234' });
      try {
        await login(db, { userId: 'gibts-nicht', pin: '1234' });
        expect.fail('sollte werfen');
      } catch (err) {
        expect((err as AuthError).code).toBe('INVALID_PIN');
      }
    });

    it('sperrt nach 5 Fehlversuchen', async () => {
      const db = makeDb();
      const setup = await setupInitial(db, { name: 'A', pin: '1234' });
      for (let i = 0; i < 4; i++) {
        await expect(login(db, { userId: setup.userId, pin: '9999' })).rejects.toThrow(AuthError);
      }
      try {
        await login(db, { userId: setup.userId, pin: '9999' });
        expect.fail('sollte werfen');
      } catch (err) {
        expect((err as AuthError).code).toBe('LOCKED');
      }
    });

    it('Sperre eines Benutzers betrifft anderen nicht', async () => {
      const db = makeDb();
      const a = await setupInitial(db, { name: 'A', pin: '1234' });
      const b = await createBenutzer(db, { name: 'B', pin: '5678' });
      for (let i = 0; i < 5; i++) {
        await expect(login(db, { userId: a.userId, pin: '0000' })).rejects.toThrow();
      }
      // B kann weiter loggen
      const result = await login(db, { userId: b.id, pin: '5678' });
      expect(result.token).toBeTruthy();
    });
  });

  describe('changeBenutzerPin', () => {
    it('akzeptiert PIN-Wechsel mit korrektem oldPin', async () => {
      const db = makeDb();
      const setup = await setupInitial(db, { name: 'A', pin: '1234' });
      await changeBenutzerPin(db, setup.userId, '1234', '5678');
      await expect(login(db, { userId: setup.userId, pin: '5678' })).resolves.toBeDefined();
    });

    it('lehnt falschen oldPin ab', async () => {
      const db = makeDb();
      const setup = await setupInitial(db, { name: 'A', pin: '1234' });
      try {
        await changeBenutzerPin(db, setup.userId, '0000', '5678');
        expect.fail('sollte werfen');
      } catch (err) {
        expect((err as AuthError).code).toBe('OLD_PIN_INCORRECT');
      }
    });
  });

  describe('updateBenutzerName / deleteBenutzer', () => {
    it('benennt um', async () => {
      const db = makeDb();
      const setup = await setupInitial(db, { name: 'Alt', pin: '1234' });
      const updated = updateBenutzerName(db, setup.userId, 'Neu');
      expect(updated.name).toBe('Neu');
    });

    it('verbietet das Löschen des letzten Benutzers', async () => {
      const db = makeDb();
      const setup = await setupInitial(db, { name: 'A', pin: '1234' });
      try {
        deleteBenutzer(db, setup.userId);
        expect.fail('sollte werfen');
      } catch (err) {
        expect((err as AuthError).code).toBe('LAST_USER');
      }
    });

    it('erlaubt Löschen wenn mehrere existieren', async () => {
      const db = makeDb();
      const a = await setupInitial(db, { name: 'A', pin: '1234' });
      const b = await createBenutzer(db, { name: 'B', pin: '5678' });
      deleteBenutzer(db, a.userId);
      expect(listBenutzer(db).length).toBe(1);
      expect(listBenutzer(db)[0]?.id).toBe(b.id);
    });
  });

  describe('getAuthStatus', () => {
    it('needsSetup=true bei leerer DB', async () => {
      const db = makeDb();
      const status = await getAuthStatus(db, undefined);
      expect(status.needsSetup).toBe(true);
      expect(status.benutzer.length).toBe(0);
    });

    it('liefert Benutzer-Liste nach Setup', async () => {
      const db = makeDb();
      await setupInitial(db, { name: 'A', pin: '1234' });
      await createBenutzer(db, { name: 'B', pin: '5678' });
      const status = await getAuthStatus(db, undefined);
      expect(status.needsSetup).toBe(false);
      expect(status.benutzer.length).toBe(2);
      expect(status.authenticated).toBe(false);
      expect(status.user).toBeNull();
    });

    it('authenticated=true mit gültigem Token', async () => {
      const db = makeDb();
      const setup = await setupInitial(db, { name: 'Niklas', pin: '1234' });
      const status = await getAuthStatus(db, setup.token);
      expect(status.authenticated).toBe(true);
      expect(status.user?.name).toBe('Niklas');
    });

    it('authenticated=false wenn Token-User gelöscht wurde', async () => {
      const db = makeDb();
      const setup = await setupInitial(db, { name: 'A', pin: '1234' });
      await createBenutzer(db, { name: 'B', pin: '5678' });
      deleteBenutzer(db, setup.userId);
      const status = await getAuthStatus(db, setup.token);
      expect(status.authenticated).toBe(false);
      expect(status.user).toBeNull();
    });
  });

  describe('Token', () => {
    it('verify rejected bei verfälschtem Token', async () => {
      const token = await generateToken({ userId: 'u1', userName: 'Test' });
      const tampered = token + 'x';
      const result = await verifyToken(tampered);
      expect(result.valid).toBe(false);
    });
  });
});
