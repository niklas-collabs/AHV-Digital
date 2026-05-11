import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { isValidBackupName, listBackups, runBackup } from './backup-service.js';

/** Erzeugt eine echte SQLite-Datei (im WAL-Mode), wie die App es im
 *  Live-Betrieb tut — sonst kann db.backup() nicht arbeiten. */
function createTestDb(dbPath: string): void {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE foo (id INTEGER PRIMARY KEY, val TEXT)');
  db.prepare('INSERT INTO foo (val) VALUES (?)').run('hello');
  db.close();
}

describe('runBackup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'ahv-backup-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a copy of the DB file with ISO date in name', async () => {
    const dbPath = path.join(tmpDir, 'ahv.db');
    const backupDir = path.join(tmpDir, 'backups');
    createTestDb(dbPath);

    const result = await runBackup(dbPath, backupDir);

    expect(result.backupFile).not.toBeNull();
    expect(result.backupFile).toMatch(/ahv-\d{4}-\d{2}-\d{2}\.db$/);
    expect(readdirSync(backupDir).length).toBe(1);
  });

  it('liefert eine konsistente, lesbare DB als Backup', async () => {
    const dbPath = path.join(tmpDir, 'ahv.db');
    const backupDir = path.join(tmpDir, 'backups');
    createTestDb(dbPath);

    const result = await runBackup(dbPath, backupDir);
    expect(result.backupFile).not.toBeNull();

    // Backup öffnen und Daten prüfen
    const backup = new Database(result.backupFile!, { readonly: true });
    const row = backup.prepare('SELECT val FROM foo WHERE id = 1').get() as
      | { val: string }
      | undefined;
    backup.close();
    expect(row?.val).toBe('hello');
  });

  it('returns null backupFile when DB does not exist', async () => {
    const result = await runBackup(
      path.join(tmpDir, 'missing.db'),
      path.join(tmpDir, 'backups'),
    );
    expect(result.backupFile).toBeNull();
    expect(result.deleted).toEqual([]);
  });

  it('deletes backups older than 30 days', async () => {
    const dbPath = path.join(tmpDir, 'ahv.db');
    const backupDir = path.join(tmpDir, 'backups');
    createTestDb(dbPath);

    mkdirSync(backupDir, { recursive: true });
    const oldFile = path.join(backupDir, 'ahv-2020-01-01.db');
    writeFileSync(oldFile, 'old');
    const oldTime = (Date.now() - 35 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(oldFile, oldTime, oldTime);

    const result = await runBackup(dbPath, backupDir);

    expect(result.deleted).toContain('ahv-2020-01-01.db');
    expect(result.backupFile).not.toBeNull();
    expect(statSync(result.backupFile!).size).toBeGreaterThan(0);
  });

  it('ignores non-matching files in backupDir', async () => {
    const dbPath = path.join(tmpDir, 'ahv.db');
    const backupDir = path.join(tmpDir, 'backups');
    createTestDb(dbPath);
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(path.join(backupDir, 'README.md'), 'not a backup');
    const oldTime = (Date.now() - 100 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(path.join(backupDir, 'README.md'), oldTime, oldTime);

    const result = await runBackup(dbPath, backupDir);

    expect(result.deleted).not.toContain('README.md');
  });
});

describe('listBackups', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'ahv-backup-list-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('liefert leere Liste wenn Verzeichnis fehlt', () => {
    expect(listBackups(path.join(tmpDir, 'nope'))).toEqual([]);
  });

  it('liefert Backups, neueste zuerst, ignoriert Fremd-Dateien', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, 'ahv-2024-01-01.db'), 'a');
    writeFileSync(path.join(tmpDir, 'ahv-2024-06-15.db'), 'b');
    writeFileSync(path.join(tmpDir, 'README.md'), 'no');
    const oldTime = (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(path.join(tmpDir, 'ahv-2024-01-01.db'), oldTime, oldTime);

    const list = listBackups(tmpDir);
    expect(list.length).toBe(2);
    expect(list[0]?.filename).toBe('ahv-2024-06-15.db');
    expect(list[1]?.filename).toBe('ahv-2024-01-01.db');
  });
});

describe('isValidBackupName', () => {
  it('akzeptiert nur ahv-YYYY-MM-DD.db', () => {
    expect(isValidBackupName('ahv-2026-05-10.db')).toBe(true);
    expect(isValidBackupName('ahv-2026-05-10.db.bak')).toBe(false);
    expect(isValidBackupName('../etc/passwd')).toBe(false);
    expect(isValidBackupName('ahv-2026-05-10')).toBe(false);
  });
});
