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
import { runBackup } from './backup-service.js';

describe('runBackup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'ahv-backup-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a copy of the DB file with ISO date in name', () => {
    const dbPath = path.join(tmpDir, 'ahv.db');
    const backupDir = path.join(tmpDir, 'backups');
    writeFileSync(dbPath, 'fake-sqlite-content');

    const result = runBackup(dbPath, backupDir);

    expect(result.backupFile).not.toBeNull();
    expect(result.backupFile).toMatch(/ahv-\d{4}-\d{2}-\d{2}\.db$/);
    expect(readdirSync(backupDir).length).toBe(1);
  });

  it('returns null backupFile when DB does not exist', () => {
    const result = runBackup(path.join(tmpDir, 'missing.db'), path.join(tmpDir, 'backups'));
    expect(result.backupFile).toBeNull();
    expect(result.deleted).toEqual([]);
  });

  it('deletes backups older than 30 days', () => {
    const dbPath = path.join(tmpDir, 'ahv.db');
    const backupDir = path.join(tmpDir, 'backups');
    writeFileSync(dbPath, 'fake');

    // Lege ein "altes" Backup mit mtime 35 Tage in der Vergangenheit an
    mkdirSync(backupDir, { recursive: true });
    const oldFile = path.join(backupDir, 'ahv-2020-01-01.db');
    writeFileSync(oldFile, 'old');
    const oldTime = (Date.now() - 35 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(oldFile, oldTime, oldTime);

    const result = runBackup(dbPath, backupDir);

    expect(result.deleted).toContain('ahv-2020-01-01.db');
    // Heutiges Backup ist noch da
    expect(result.backupFile).not.toBeNull();
    expect(statSync(result.backupFile!).size).toBeGreaterThan(0);
  });

  it('ignores non-matching files in backupDir', () => {
    const dbPath = path.join(tmpDir, 'ahv.db');
    const backupDir = path.join(tmpDir, 'backups');
    writeFileSync(dbPath, 'fake');
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(path.join(backupDir, 'README.md'), 'not a backup');
    const oldTime = (Date.now() - 100 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(path.join(backupDir, 'README.md'), oldTime, oldTime);

    const result = runBackup(dbPath, backupDir);

    expect(result.deleted).not.toContain('README.md');
  });
});
