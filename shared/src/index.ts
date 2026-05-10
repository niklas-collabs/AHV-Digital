// Shared Types zwischen Client und Server.
// Vollständiges Domain-Modell aus SPEC.md (alle Phasen) — die DB-Tabellen
// sind in 001_init.sql 1:1 abgebildet.

// === Auftrag ===

export type AuftragTyp = 'arbeitszettel' | 'angebot' | 'lieferschein';
export type AuftragStatus = 'entwurf' | 'abgeschickt';
export type KundeTyp = 'privat' | 'firma';

export interface AuftragMitarbeiter {
  name: string;
  stufe_id: string | null;
  stufe_bezeichnung: string;
  stundenpreis: number;
  stunden: number;
}

export interface AuftragMaterial {
  name: string;
  menge: number;
  einheit: string;
  preis_netto: number;
  mwst_prozent: number;
  ist_lohnkosten: boolean;
}

export interface ChecklistenItem {
  text: string;
  checked: boolean;
}

/** Teilleistung (Phase 2.7): ein Auftrag kann aus mehreren bestehen,
 *  z.B. Etappen einer Großbaustelle. Jede Teilleistung hat eigenes Datum,
 *  Mitarbeiter- und Material-Zeilen; Summen werden aufaddiert. */
export interface Teilleistung {
  id: string;
  bezeichnung: string;
  datum: string; // ISO date
  notiz: string;
  mitarbeiter: AuftragMitarbeiter[];
  materialien: AuftragMaterial[];
}

export interface KundeSnapshot {
  typ: KundeTyp;
  firmenname: string | null;
  vorname: string;
  nachname: string;
  email: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
}

export interface Auftrag {
  id: string;
  typ: AuftragTyp;
  status: AuftragStatus;
  titel: string;
  datum: string; // ISO date (YYYY-MM-DD)
  beschreibung: string;
  notiz_intern: string;
  kunde_id: string | null;
  kunde_snapshot: KundeSnapshot;
  objekt_adresse: string | null;
  mitarbeiter: AuftragMitarbeiter[];
  materialien: AuftragMaterial[];
  fotos: string[]; // Pfade zu Foto-Dateien (Server-side)
  signature_data_url: string | null;
  checkliste: ChecklistenItem[] | null;
  /** Optionale Teilleistungen (Phase 2.7). Leer-Array wenn nicht
   *  verwendet — Top-Level mitarbeiter/materialien bleiben dann
   *  die einzige Datenquelle. */
  teilleistungen: Teilleistung[];
  /** Verweis auf den Auftrag, aus dem dieser kopiert/konvertiert wurde
   *  (Pipeline 2.8). Null wenn neu angelegt. */
  urspruenglicher_auftrag_id: string | null;
  erstellt_am: string; // ISO datetime
  geaendert_am: string;
  abgeschickt_am: string | null;
}

// === Kunde ===

export interface Kunde {
  id: string;
  typ: KundeTyp;
  firmenname: string | null;
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  lexoffice_id: string | null;
  notiz: string | null;
  erstellt_am: string;
  geaendert_am: string;
}

// === Stammdaten ===

export interface Stufe {
  id: string;
  bezeichnung: string; // "Geselle", "Helfer", "Meister"
  stundenpreis: number; // €/Std netto
  reihenfolge: number;
}

export interface Pauschale {
  id: string;
  name: string;
  preis_netto: number;
  einheit: string; // "Psch", "Stk", "m", "m²", "l", "kg"
  mwst_prozent: number; // 19, 7, 0
  ist_lohnkosten: boolean; // §35a EStG
}

export interface Vorlage {
  id: string;
  name: string;
  typ: AuftragTyp;
  data: Partial<Auftrag>;
  erstellt_am: string;
}

// === Wartung ===

export interface Wartungsplan {
  id: string;
  kunde_id: string | null;
  kunde_name: string; // Freitext-Fallback
  anlage: string; // "Gasheizung Keller"
  standort: string | null;
  intervall_monate: number;
  erinnerung_tage: number;
  letzte_wartung: string | null; // ISO date
  naechste_wartung: string;
  notiz: string | null;
  foto_pfad: string | null;
  qr_code_id: string | null;
  erstellt_am: string;
}

export interface WartungsHistorie {
  id: string;
  wartungsplan_id: string;
  durchgefuehrt_am: string;
  notiz: string | null;
  foto_pfad: string | null;
  auftrag_id: string | null;
}

// === Checklisten-Vorlagen ===

export type ChecklistenVorlageTyp = 'wartung' | 'arbeitszettel' | 'angebot';

export interface ChecklistenVorlage {
  id: string;
  name: string;
  typ: ChecklistenVorlageTyp;
  items: { text: string }[];
}

// === QR-Codes für Anlagen ===

export interface AnlagenQR {
  id: string; // UUID, im QR-Code kodiert
  kunde_id: string | null;
  kunde_name: string;
  anlage: string;
  standort: string | null;
  wartungsplan_id: string | null;
  erstellt_am: string;
}

// === Config (Key-Value, Wert ist JSON-serialisiert) ===

export interface FirmaConfig {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  ust_nr: string;
  iban: string;
  bic: string;
  bank: string;
}

export interface GmailConfig {
  user: string;
  app_passwort: string;
}

export interface LogoConfig {
  path: string;
  mime: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export type ThemeMode = 'dark' | 'light';
export type Language = 'de' | 'en';

export type ConfigKey =
  | 'firma'
  | 'gmail'
  | 'lexoffice_api_key'
  | 'lexoffice_last_sync'
  | 'logo'
  | 'theme_default'
  | 'language_default'
  | 'vapid_keys';

// Mapping Key → erwartete Wert-Form (typed Helper für die Config-API in 1.4).
export interface ConfigValueByKey {
  firma: FirmaConfig;
  gmail: GmailConfig;
  lexoffice_api_key: string;
  lexoffice_last_sync: string; // ISO datetime
  logo: LogoConfig;
  theme_default: ThemeMode;
  language_default: Language;
  vapid_keys: VapidKeys;
}

// === Lexoffice (Phase 2.1) ===

export interface LexofficeStatusResponse {
  apiKeySet: boolean;
  lastSync: string | null;
}

export interface LexofficeTestResponse {
  ok: true;
  /** Anzahl der Kontakte in Lexoffice (zur Orientierung) */
  contactsTotal: number;
}

export interface LexofficeSyncResult {
  added: number;
  updated: number;
  skipped: number;
  total: number;
  /** Bei Fehlern in einzelnen Records — Sync läuft soweit wie möglich weiter */
  errors: { lexofficeId: string; reason: string }[];
}

// === Auth & System ===

export interface AuthState {
  pin_hash: string | null;
  failed_attempts: number;
  locked_until: string | null;
}

export interface PushSubscription {
  id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  user_agent: string | null;
  erstellt_am: string;
}

export interface LogEntry {
  id: number;
  timestamp: string;
  action: string; // z.B. 'auftrag.created', 'kunde.deleted'
  entity_type: string | null;
  entity_id: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
}

// === HTTP Responses (geteilt zwischen Client/Server) ===

export interface HealthResponse {
  ok: true;
  service: 'ahv-digital';
  version: string;
  db: 'ok' | 'error';
}

export interface AuthStatusResponse {
  needsSetup: boolean;
  authenticated: boolean;
  lockedUntil: string | null;
}

/**
 * Standard-Fehler-Antwort der API. Spezifische Endpoints können
 * zusaetzliche Felder mitgeben (z.B. attemptsLeft, lockedUntil bei Auth).
 */
export interface ApiErrorResponse {
  error: string;
  code: string;
  [key: string]: unknown;
}
