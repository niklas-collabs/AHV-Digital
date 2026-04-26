import bcrypt from 'bcrypt';
import { jwtVerify, SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
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
    logger.warn('JWT_SECRET nicht gesetzt — generiere zufaelligen Dev-Secret. Tokens werden bei jedem Restart ungueltig.');
    cachedSecret = new TextEncoder().encode(random);
  } else {
    cachedSecret = new TextEncoder().encode(secret);
  }
  return cachedSecret;
}

/**
 * Nur fuer Tests: Secret-Cache leeren, damit ein frisches JWT_SECRET (env)
 * beim naechsten Aufruf wieder gelesen wird.
 */
export function _resetJwtSecretCache(): void {
  cachedSecret = null;
}

export type AuthErrorCode =
  | 'INVALID_FORMAT'
  | 'NEEDS_SETUP'
  | 'INVALID_PIN'
  | 'LOCKED'
  | 'OLD_PIN_REQUIRED'
  | 'OLD_PIN_INCORRECT';

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

interface AuthRow {
  pin_hash: string | null;
  failed_attempts: number;
  locked_until: string | null;
}

function readAuthRow(db: Database.Database): AuthRow {
  const row = db
    .prepare('SELECT pin_hash, failed_attempts, locked_until FROM auth WHERE id = 1')
    .get() as AuthRow | undefined;
  if (!row) {
    throw new Error('auth-Tabelle hat keinen Eintrag — Migration nicht durchgelaufen?');
  }
  return row;
}

function isStillLocked(row: AuthRow, now: number): boolean {
  if (!row.locked_until) return false;
  return new Date(row.locked_until).getTime() > now;
}

// === Token ===

export async function generateToken(): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin')
    .setIssuedAt()
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setExpirationTime(`${TOKEN_VALIDITY_HOURS}h`)
    .sign(getJwtSecret());
}

export async function verifyToken(
  token: string,
): Promise<{ valid: true; sub: string } | { valid: false }> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
    return { valid: true, sub: String(payload.sub ?? '') };
  } catch {
    return { valid: false };
  }
}

// === Status ===

export interface AuthStatus {
  needsSetup: boolean;
  authenticated: boolean;
  lockedUntil: string | null;
}

export async function getAuthStatus(
  db: Database.Database,
  token: string | undefined,
): Promise<AuthStatus> {
  const row = readAuthRow(db);
  const now = Date.now();
  const stillLocked = isStillLocked(row, now);

  let authenticated = false;
  if (token) {
    const result = await verifyToken(token);
    if (result.valid) authenticated = true;
  }

  return {
    needsSetup: !row.pin_hash,
    authenticated,
    lockedUntil: stillLocked ? row.locked_until : null,
  };
}

// === Setup ===

export interface SetupParams {
  pin: string;
  oldPin?: string;
}

export interface SetupResult {
  token: string;
}

export async function setupPin(
  db: Database.Database,
  params: SetupParams,
): Promise<SetupResult> {
  validatePin(params.pin);

  const row = readAuthRow(db);

  if (row.pin_hash) {
    if (!params.oldPin) {
      throw new AuthError('OLD_PIN_REQUIRED', 'Alter PIN ist erforderlich');
    }
    const oldMatches = await bcrypt.compare(params.oldPin, row.pin_hash);
    if (!oldMatches) {
      throw new AuthError('OLD_PIN_INCORRECT', 'Alter PIN ist falsch');
    }
  }

  const newHash = await bcrypt.hash(params.pin, BCRYPT_COST);
  db.prepare(
    'UPDATE auth SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = 1',
  ).run(newHash);

  logger.info('auth.pin_changed', { initial: !row.pin_hash });

  const token = await generateToken();
  return { token };
}

// === Login ===

export interface LoginResult {
  token: string;
}

export async function login(db: Database.Database, pin: string): Promise<LoginResult> {
  validatePin(pin);

  const row = readAuthRow(db);

  if (!row.pin_hash) {
    throw new AuthError('NEEDS_SETUP', 'Es ist noch kein PIN gesetzt');
  }

  const now = Date.now();
  if (isStillLocked(row, now)) {
    throw new AuthError('LOCKED', `Gesperrt bis ${row.locked_until}`, {
      lockedUntil: row.locked_until,
    });
  }

  const matches = await bcrypt.compare(pin, row.pin_hash);
  if (!matches) {
    const newAttempts = row.failed_attempts + 1;
    let lockedUntil: string | null = null;
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(now + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    }
    db.prepare('UPDATE auth SET failed_attempts = ?, locked_until = ? WHERE id = 1').run(
      newAttempts,
      lockedUntil,
    );

    if (lockedUntil) {
      logger.warn('auth.locked_out', { attempts: newAttempts });
      throw new AuthError('LOCKED', `Gesperrt bis ${lockedUntil}`, { lockedUntil });
    }

    const attemptsLeft = MAX_FAILED_ATTEMPTS - newAttempts;
    logger.warn('auth.login_failed', { attempts: newAttempts, attemptsLeft });
    throw new AuthError('INVALID_PIN', 'Falscher PIN', { attemptsLeft });
  }

  // Erfolg → Counter zuruecksetzen
  db.prepare('UPDATE auth SET failed_attempts = 0, locked_until = NULL WHERE id = 1').run();
  logger.info('auth.login_success');

  const token = await generateToken();
  return { token };
}
