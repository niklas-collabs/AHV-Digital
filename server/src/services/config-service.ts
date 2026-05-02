import type Database from 'better-sqlite3';
import { z, type ZodSchema } from 'zod';
import type {
  ConfigKey,
  ConfigValueByKey,
  FirmaConfig,
  GmailConfig,
  Language,
  LogoConfig,
  ThemeMode,
  VapidKeys,
} from '@ahv/shared';

// === Zod-Schemas pro ConfigKey ===

const firmaSchema: z.ZodType<FirmaConfig> = z.object({
  name: z.string().min(1, 'Firmenname ist erforderlich'),
  strasse: z.string(),
  plz: z.string(),
  ort: z.string(),
  telefon: z.string(),
  email: z.string().email().or(z.literal('')),
  ust_nr: z.string(),
  iban: z.string(),
  bic: z.string(),
  bank: z.string(),
});

const gmailSchema: z.ZodType<GmailConfig> = z.object({
  user: z.string().email(),
  app_passwort: z.string().min(1),
});

const logoSchema: z.ZodType<LogoConfig> = z.object({
  path: z.string(),
  mime: z.string(),
});

const themeSchema: z.ZodType<ThemeMode> = z.enum(['dark', 'light']);
const languageSchema: z.ZodType<Language> = z.enum(['de', 'en']);

const vapidSchema: z.ZodType<VapidKeys> = z.object({
  publicKey: z.string(),
  privateKey: z.string(),
});

const lexofficeApiKeySchema = z.string();

const SCHEMAS: { [K in ConfigKey]: ZodSchema<ConfigValueByKey[K]> } = {
  firma: firmaSchema,
  gmail: gmailSchema,
  lexoffice_api_key: lexofficeApiKeySchema,
  logo: logoSchema,
  theme_default: themeSchema,
  language_default: languageSchema,
  vapid_keys: vapidSchema,
};

const ALL_KEYS: ConfigKey[] = [
  'firma',
  'gmail',
  'lexoffice_api_key',
  'logo',
  'theme_default',
  'language_default',
  'vapid_keys',
];

export function isConfigKey(value: unknown): value is ConfigKey {
  return typeof value === 'string' && (ALL_KEYS as string[]).includes(value);
}

// === Service ===

export type ConfigMap = {
  [K in ConfigKey]: ConfigValueByKey[K] | null;
};

/**
 * Liefert alle Config-Keys mit ihrem aktuellen Wert (oder null wenn nie
 * gesetzt). gmail.app_passwort und lexoffice_api_key werden NICHT redacted —
 * der Endpoint ist hinter Auth.
 */
export function getAllConfig(db: Database.Database): ConfigMap {
  const rows = db.prepare('SELECT key, value FROM config').all() as Array<{
    key: string;
    value: string;
  }>;

  const result = {} as ConfigMap;
  for (const key of ALL_KEYS) {
    result[key] = null;
  }
  for (const row of rows) {
    if (!isConfigKey(row.key)) continue;
    try {
      // Generic-cast ist hier ok: wir vertrauen dem Schema beim Schreiben.
      result[row.key] = JSON.parse(row.value) as never;
    } catch {
      // ignore corrupted entries
    }
  }
  return result;
}

export function getConfig<K extends ConfigKey>(
  db: Database.Database,
  key: K,
): ConfigValueByKey[K] | null {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as ConfigValueByKey[K];
  } catch {
    return null;
  }
}

/**
 * Setzt einen Config-Wert. Validiert das Value gegen das passende Zod-Schema —
 * wirft ZodError bei ungültigen Daten (vom error-handler in 400 übersetzt).
 */
export function setConfig<K extends ConfigKey>(
  db: Database.Database,
  key: K,
  value: unknown,
): ConfigValueByKey[K] {
  const schema = SCHEMAS[key];
  const parsed = schema.parse(value) as ConfigValueByKey[K];
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(parsed),
  );
  return parsed;
}

export function deleteConfig(db: Database.Database, key: ConfigKey): void {
  db.prepare('DELETE FROM config WHERE key = ?').run(key);
}
