import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../db/migrations/runner.js';
import { setConfig } from './config-service.js';
import { createKunde, listKunden } from './kunde-service.js';
import {
  LexofficeServiceError,
  kundeToLexofficeInput,
  syncLexofficeKunden,
  testLexofficeConnection,
} from './lexoffice-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '..', 'db', 'migrations', 'sql');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, SQL_DIR);
  return db;
}

const TEST_API_KEY = 'lxof_test_key_at_least_20_chars_long';

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init ?? {});
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('kundeToLexofficeInput', () => {
  it('mappt Privatkunde korrekt', () => {
    const result = kundeToLexofficeInput({
      typ: 'privat',
      vorname: 'Max',
      nachname: 'Mustermann',
      email: 'max@example.com',
      strasse: 'Musterstr 1',
      plz: '12345',
      ort: 'Berlin',
    });
    expect(result.person?.firstName).toBe('Max');
    expect(result.person?.lastName).toBe('Mustermann');
    expect(result.company).toBeUndefined();
    expect(result.emailAddresses?.business).toEqual(['max@example.com']);
    expect(result.addresses?.billing?.[0]?.street).toBe('Musterstr 1');
    expect(result.addresses?.billing?.[0]?.zip).toBe('12345');
    expect(result.addresses?.billing?.[0]?.countryCode).toBe('DE');
  });

  it('mappt Firma mit Ansprechpartner', () => {
    const result = kundeToLexofficeInput({
      typ: 'firma',
      firmenname: 'AHV GmbH',
      vorname: 'Niklas',
      nachname: 'Hochmuth',
    });
    expect(result.company?.name).toBe('AHV GmbH');
    expect(result.company?.contactPersons?.[0]?.firstName).toBe('Niklas');
    expect(result.person).toBeUndefined();
  });

  it('lässt addresses weg wenn keine Adresse vorhanden', () => {
    const result = kundeToLexofficeInput({ typ: 'privat', vorname: 'X', nachname: 'Y' });
    expect(result.addresses).toBeUndefined();
  });
});

describe('lexoffice-service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('testLexofficeConnection', () => {
    it('wirft NO_API_KEY ohne gespeicherten Key', async () => {
      const db = makeDb();
      await expect(testLexofficeConnection(db)).rejects.toMatchObject({ code: 'NO_API_KEY' });
    });

    it('liefert contactsTotal aus dem ersten-Seite-Response', async () => {
      const db = makeDb();
      setConfig(db, 'lexoffice_api_key', TEST_API_KEY);
      mockFetch(() =>
        jsonResponse({
          content: [],
          first: true,
          last: true,
          totalPages: 1,
          totalElements: 42,
          numberOfElements: 0,
          size: 1,
          number: 0,
        }),
      );
      const result = await testLexofficeConnection(db);
      expect(result.contactsTotal).toBe(42);
    });

    it('wandelt 401 in API_ERROR um', async () => {
      const db = makeDb();
      setConfig(db, 'lexoffice_api_key', TEST_API_KEY);
      mockFetch(() => jsonResponse({ message: 'Invalid key' }, 401));
      await expect(testLexofficeConnection(db)).rejects.toBeInstanceOf(LexofficeServiceError);
    });
  });

  describe('syncLexofficeKunden', () => {
    it('legt neue Kunden an und überspringt bestehende per lexoffice_id', async () => {
      const db = makeDb();
      setConfig(db, 'lexoffice_api_key', TEST_API_KEY);

      // Bestehender Kunde mit lexoffice_id="lex-1" → soll geupdated werden
      const existing = createKunde(db, {
        typ: 'privat',
        vorname: 'Alt',
        nachname: 'Vorname',
      });
      db.prepare('UPDATE kunde SET lexoffice_id = ? WHERE id = ?').run('lex-1', existing.id);

      mockFetch((url) => {
        if (url.includes('page=0')) {
          return jsonResponse({
            content: [
              {
                id: 'lex-1',
                version: 1,
                roles: { customer: {} },
                person: { firstName: 'Neu', lastName: 'Vorname' },
              },
              {
                id: 'lex-2',
                version: 1,
                roles: { customer: {} },
                company: { name: 'AHV GmbH' },
                addresses: { billing: [{ street: 'X', zip: '11111', city: 'Berlin' }] },
              },
              {
                // Sollte übersprungen werden (kein Name)
                id: 'lex-3',
                version: 1,
                roles: { customer: {} },
                person: { firstName: '', lastName: '' },
              },
            ],
            first: true,
            last: true,
            totalPages: 1,
            totalElements: 3,
            numberOfElements: 3,
            size: 100,
            number: 0,
          });
        }
        return jsonResponse({}, 404);
      });

      const result = await syncLexofficeKunden(db);

      expect(result.added).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.total).toBe(3);
      expect(result.errors).toEqual([]);

      const all = listKunden(db);
      expect(all.length).toBe(2);
      const updated = all.find((k) => k.lexoffice_id === 'lex-1');
      expect(updated?.vorname).toBe('Neu');
      const created = all.find((k) => k.lexoffice_id === 'lex-2');
      expect(created?.firmenname).toBe('AHV GmbH');
      expect(created?.ort).toBe('Berlin');
    });

    it('paginiert über mehrere Seiten', async () => {
      const db = makeDb();
      setConfig(db, 'lexoffice_api_key', TEST_API_KEY);

      mockFetch((url) => {
        if (url.includes('page=0')) {
          return jsonResponse({
            content: [
              {
                id: 'a',
                version: 1,
                roles: { customer: {} },
                person: { firstName: 'A', lastName: 'A' },
              },
            ],
            first: true,
            last: false,
            totalPages: 2,
            totalElements: 2,
            numberOfElements: 1,
            size: 1,
            number: 0,
          });
        }
        if (url.includes('page=1')) {
          return jsonResponse({
            content: [
              {
                id: 'b',
                version: 1,
                roles: { customer: {} },
                person: { firstName: 'B', lastName: 'B' },
              },
            ],
            first: false,
            last: true,
            totalPages: 2,
            totalElements: 2,
            numberOfElements: 1,
            size: 1,
            number: 1,
          });
        }
        return jsonResponse({}, 500);
      });

      const result = await syncLexofficeKunden(db);
      expect(result.total).toBe(2);
      expect(result.added).toBe(2);
    });

    it('wirft NO_API_KEY ohne Key', async () => {
      const db = makeDb();
      await expect(syncLexofficeKunden(db)).rejects.toMatchObject({ code: 'NO_API_KEY' });
    });
  });
});
