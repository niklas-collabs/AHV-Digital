import bcrypt from 'bcrypt';
import { jwtVerify, SignJWT } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Benutzer } from '@ahv/shared';
import { logger } from '../lib/logger.js';

const PIN_LENGTH = 4;
const BCRYPT_COST = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const TOKEN_VALIDITY_HOURS = 24;
const TOKEN_ISSUER = 'ahv-digital';
const TOKEN_AUDIENCE = 'ahv-digital-app';

let cachedSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET muss in production gesetzt und mind. 32 Zeichen lang sein');
    }
    const random = randomBytes(32).toString('hex');
    logger.warn('JWT_SECRET nicht gesetzt — generiere zufaelligen Dev-Secret. Tokens werden bei jedem Restart ungültig.');
    cachedSecret = new TextEncoder().encode(random);
  } else {
    cachedSecret = new TextEncoder().encode(secret);
  }
  return cachedSecret;
}

export function _resetJwtSecretCache(): void {
  cachedSecret = null;
}

export type AuthErrorCode =
  | 'INVALID_FORMAT'
  | 'NEEDS_SETUP'
  | 'INVALID_PIN'
  | 'LOCKED'
  | 'OLD_PIN_REQUIRED'
  | 'OLD_PIN_INCORRECT'
  | 'USER_NOT_FOUND'
  | 'LAST_USER';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly meta: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function validatePin(pin: string): void {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    throw new AuthError('INVALID_FORMAT', `PIN muss genau ${PIN_LENGTH} Ziffern haben`);
  }
}

function validateName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    throw new AuthError('INVALID_FORMAT', 'Name muss 1–50 Zeichen lang sein');
  }
}

// === DB ===

interface BenutzerRow {
  id: string;
  name: string;
  pin_hash: string;
  failed_attempts: number;
  locked_until: string | null;
  erstellt_am: string;
}

function rowToBenutzer(row: BenutzerRow): Benutzer {
  return {
    id: row.id,
    name: row.name,
    erstellt_am: row.erstellt_am,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
  };
}

function isStillLocked(row: BenutzerRow, now: number): boolean {
  if (!row.locked_until) return false;
  return new Date(row.locked_until).getTime() > now;
}

export function listBenutzer(db: Database.Database): Benutzer[] {
  const rows = db
    .prepare(
      'SELECT id, name, pin_hash, failed_attempts, locked_until, erstellt_am FROM benutzer ORDER BY erstellt_am',
    )
    .all() as BenutzerRow[];
  return rows.map(rowToBenutzer);
}

export function getBenutzer(db: Database.Database, id: string): Benutzer | null {
  const row = db
    .prepare(
      'SELECT id, name, pin_hash, failed_attempts, locked_until, erstellt_am FROM benutzer WHERE id = ?',
    )
    .get(id) as BenutzerRow | undefined;
  return row ? rowToBenutzer(row) : null;
}

function getBenutzerRow(db: Database.Database, id: string): BenutzerRow | null {
  const row = db
    .prepare(
      'SELECT id, name, pin_hash, failed_attempts, locked_until, erstellt_am FROM benutzer WHERE id = ?',
    )
    .get(id) as BenutzerRow | undefined;
  return row ?? null;
}

function countBenutzer(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM benutzer').get() as { c: number };
  return row.c;
}

// === Token ===

export interface JwtPayload {
  userId: string;
  userName: string;
}

export async function generateToken(payload: JwtPayload): Promise<string> {
  return await new SignJWT({ name: payload.userName })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setExpirationTime(`${TOKEN_VALIDITY_HOURS}h`)
    .sign(getJwtSecret());
}

export async function verifyToken(
  token: string,
): Promise<{ valid: true; userId: string; userName: string } | { valid: false }> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
    const userId = String(payload.sub ?? '');
    const userName = String(payload.name ?? '');
    if (!userId) return { valid: false };
    return { valid: true, userId, userName };
  } catch {
    return { valid: false };
  }
}

// === Status ===

export interface AuthStatus {
  needsSetup: boolean;
  authenticated: boolean;
  lockedUntil: string | null;
  user: { id: string; name: string } | null;
  benutzer: { id: string; name: string }[];
}

export async function getAuthStatus(
  db: Database.Database,
  token: string | undefined,
): Promise<AuthStatus> {
  const benutzer = listBenutzer(db);
  const needsSetup = benutzer.length === 0;

  let authenticated = false;
  let user: { id: string; name: string } | null = null;

  if (token) {
    const result = await verifyToken(token);
    if (result.valid) {
      // Token gültig — aber gibt's den User noch?
      const stillExists = benutzer.find((b) => b.id === result.userId);
      if (stillExists) {
        authenticated = true;
        user = { id: stillExists.id, name: stillExists.name };
      }
    }
  }

  // Aggregierter lockedUntil: zeigt nur an wenn der ausgewählte User
  // gesperrt ist. Beim Login-Flow wird's pro Auswahl auch nochmal geprüft.
  const lockedUntil =
    user && isUserLocked(db, user.id) ? readLockedUntil(db, user.id) : null;

  return {
    needsSetup,
    authenticated,
    lockedUntil,
    user,
    benutzer: benutzer.map((b) => ({ id: b.id, name: b.name })),
  };
}

function isUserLocked(db: Database.Database, id: string): boolean {
  const row = getBenutzerRow(db, id);
  if (!row) return false;
  return isStillLocked(row, Date.now());
}

function readLockedUntil(db: Database.Database, id: string): string | null {
  const row = getBenutzerRow(db, id);
  return row?.locked_until ?? null;
}

// === Setup (erster Benutzer) ===

export interface SetupParams {
  name: string;
  pin: string;
}

export interface SetupResult {
  token: string;
  userId: string;
}

/**
 * Legt den ersten Benutzer an. Nur erlaubt wenn noch keiner existiert
 * — weitere User werden über createBenutzer angelegt.
 */
export async function setupInitial(
  db: Database.Database,
  params: SetupParams,
): Promise<SetupResult> {
  validateName(params.name);
  validatePin(params.pin);

  if (countBenutzer(db) > 0) {
    throw new AuthError(
      'INVALID_FORMAT',
      'Initial-Setup ist nur erlaubt wenn noch kein Benutzer existiert',
    );
  }

  const id = randomUUID();
  const pinHash = await bcrypt.hash(params.pin, BCRYPT_COST);
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO benutzer (id, name, pin_hash, failed_attempts, locked_until, erstellt_am) VALUES (?, ?, ?, 0, NULL, ?)',
  ).run(id, params.name.trim(), pinHash, now);

  logger.info('auth.initial_setup', { userId: id, name: params.name });

  const token = await generateToken({ userId: id, userName: params.name.trim() });
  return { token, userId: id };
}

// === Benutzer-Verwaltung (nach Setup) ===

export interface CreateBenutzerParams {
  name: string;
  pin: string;
}

export async function createBenutzer(
  db: Database.Database,
  params: CreateBenutzerParams,
): Promise<Benutzer> {
  validateName(params.name);
  validatePin(params.pin);

  const id = randomUUID();
  const pinHash = await bcrypt.hash(params.pin, BCRYPT_COST);
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO benutzer (id, name, pin_hash, failed_attempts, locked_until, erstellt_am) VALUES (?, ?, ?, 0, NULL, ?)',
  ).run(id, params.name.trim(), pinHash, now);

  logger.info('auth.user_created', { userId: id, name: params.name });

  const created = getBenutzer(db, id);
  if (!created) throw new Error('Benutzer nach Insert nicht gefunden');
  return created;
}

export function updateBenutzerName(
  db: Database.Database,
  id: string,
  name: string,
): Benutzer {
  validateName(name);
  const existing = getBenutzer(db, id);
  if (!existing) throw new AuthError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
  db.prepare('UPDATE benutzer SET name = ? WHERE id = ?').run(name.trim(), id);
  const updated = getBenutzer(db, id);
  if (!updated) throw new Error('Benutzer nach Update nicht gefunden');
  return updated;
}

export async function changeBenutzerPin(
  db: Database.Database,
  id: string,
  oldPin: string,
  newPin: string,
): Promise<void> {
  validatePin(newPin);
  const row = getBenutzerRow(db, id);
  if (!row) throw new AuthError('USER_NOT_FOUND', 'Benutzer nicht gefunden');

  if (!oldPin) {
    throw new AuthError('OLD_PIN_REQUIRED', 'Alter PIN ist erforderlich');
  }
  const oldMatches = await bcrypt.compare(oldPin, row.pin_hash);
  if (!oldMatches) {
    throw new AuthError('OLD_PIN_INCORRECT', 'Alter PIN ist falsch');
  }

  const newHash = await bcrypt.hash(newPin, BCRYPT_COST);
  db.prepare(
    'UPDATE benutzer SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
  ).run(newHash, id);

  logger.info('auth.pin_changed', { userId: id });
}

export function deleteBenutzer(db: Database.Database, id: string): void {
  if (countBenutzer(db) <= 1) {
    throw new AuthError(
      'LAST_USER',
      'Der letzte Benutzer kann nicht gelöscht werden — sonst gibt es keinen Zugang mehr',
    );
  }
  const existing = getBenutzer(db, id);
  if (!existing) throw new AuthError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
  db.prepare('DELETE FROM benutzer WHERE id = ?').run(id);
  logger.info('auth.user_deleted', { userId: id, name: existing.name });
}

// === Login ===

export interface LoginParams {
  userId: string;
  pin: string;
}

export interface LoginResult {
  token: string;
  user: { id: string; name: string };
}

export async function login(
  db: Database.Database,
  params: LoginParams,
): Promise<LoginResult> {
  validatePin(params.pin);

  const row = getBenutzerRow(db, params.userId);
  if (!row) {
    // Keine spezifische Fehlermeldung — der Frontend-Flow zeigt nur
    // Benutzer aus der Liste an, ein direkter Aufruf mit gefälschter ID
    // soll wie ein falscher PIN aussehen.
    throw new AuthError('INVALID_PIN', 'Falscher PIN');
  }

  const now = Date.now();
  if (isStillLocked(row, now)) {
    throw new AuthError('LOCKED', `Gesperrt bis ${row.locked_until}`, {
      lockedUntil: row.locked_until,
    });
  }

  const matches = await bcrypt.compare(params.pin, row.pin_hash);
  if (!matches) {
    const newAttempts = row.failed_attempts + 1;
    let lockedUntil: string | null = null;
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(now + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    }
    db.prepare(
      'UPDATE benutzer SET failed_attempts = ?, locked_until = ? WHERE id = ?',
    ).run(newAttempts, lockedUntil, row.id);

    if (lockedUntil) {
      logger.warn('auth.locked_out', { userId: row.id, attempts: newAttempts });
      throw new AuthError('LOCKED', `Gesperrt bis ${lockedUntil}`, { lockedUntil });
    }

    const attemptsLeft = MAX_FAILED_ATTEMPTS - newAttempts;
    logger.warn('auth.login_failed', {
      userId: row.id,
      attempts: newAttempts,
      attemptsLeft,
    });
    throw new AuthError('INVALID_PIN', 'Falscher PIN', { attemptsLeft });
  }

  // Erfolg → Counter zurücksetzen
  db.prepare('UPDATE benutzer SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(
    row.id,
  );
  logger.info('auth.login_success', { userId: row.id });

  const token = await generateToken({ userId: row.id, userName: row.name });
  return { token, user: { id: row.id, name: row.name } };
}
