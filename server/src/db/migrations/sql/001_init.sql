-- AHV-Digital Initial Schema (Phase 1.2)
-- Alle Tabellen aus SPEC.md — auch fuer spaetere Phasen, damit das Schema
-- einmal komplett angelegt wird und Migrations spaeter additiv bleiben.

-- === Stammdaten ===

CREATE TABLE kunde (
  id              TEXT PRIMARY KEY,
  typ             TEXT NOT NULL CHECK(typ IN ('privat', 'firma')),
  firmenname      TEXT,
  vorname         TEXT NOT NULL DEFAULT '',
  nachname        TEXT NOT NULL DEFAULT '',
  email           TEXT,
  telefon         TEXT,
  strasse         TEXT,
  plz             TEXT,
  ort             TEXT,
  lexoffice_id    TEXT UNIQUE,
  notiz           TEXT,
  erstellt_am     TEXT NOT NULL,
  geaendert_am    TEXT NOT NULL
);
CREATE INDEX idx_kunde_nachname    ON kunde(nachname);
CREATE INDEX idx_kunde_firmenname  ON kunde(firmenname);
CREATE INDEX idx_kunde_lexoffice   ON kunde(lexoffice_id);

CREATE TABLE stufe (
  id              TEXT PRIMARY KEY,
  bezeichnung     TEXT NOT NULL,
  stundenpreis    REAL NOT NULL DEFAULT 0,
  reihenfolge     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_stufe_reihenfolge ON stufe(reihenfolge);

CREATE TABLE pauschale (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  preis_netto     REAL NOT NULL DEFAULT 0,
  einheit         TEXT NOT NULL DEFAULT 'Psch',
  mwst_prozent    REAL NOT NULL DEFAULT 19,
  ist_lohnkosten  INTEGER NOT NULL DEFAULT 0  -- 0/1 (boolean)
);

-- === Auftrag ===
-- mitarbeiter, materialien, fotos, checkliste, kunde_snapshot werden als
-- JSON-Text gespeichert (Snapshot-Charakter — alte Auftraege behalten alte Werte
-- auch wenn sich Stufen/Pauschalen/Kunden spaeter aendern).

CREATE TABLE auftrag (
  id                  TEXT PRIMARY KEY,
  typ                 TEXT NOT NULL CHECK(typ IN ('arbeitszettel', 'angebot', 'lieferschein')),
  status              TEXT NOT NULL CHECK(status IN ('entwurf', 'abgeschickt')),
  titel               TEXT NOT NULL DEFAULT '',
  datum               TEXT NOT NULL,
  beschreibung        TEXT NOT NULL DEFAULT '',
  notiz_intern        TEXT NOT NULL DEFAULT '',
  kunde_id            TEXT,
  kunde_snapshot      TEXT NOT NULL DEFAULT '{}',  -- JSON KundeSnapshot
  objekt_adresse      TEXT,
  mitarbeiter         TEXT NOT NULL DEFAULT '[]',  -- JSON AuftragMitarbeiter[]
  materialien         TEXT NOT NULL DEFAULT '[]',  -- JSON AuftragMaterial[]
  fotos               TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  signature_data_url  TEXT,
  checkliste          TEXT,                        -- JSON ChecklistenItem[] | null
  erstellt_am         TEXT NOT NULL,
  geaendert_am        TEXT NOT NULL,
  abgeschickt_am      TEXT,
  FOREIGN KEY (kunde_id) REFERENCES kunde(id) ON DELETE RESTRICT
);
CREATE INDEX idx_auftrag_status   ON auftrag(status);
CREATE INDEX idx_auftrag_kunde    ON auftrag(kunde_id);
CREATE INDEX idx_auftrag_typ      ON auftrag(typ);
CREATE INDEX idx_auftrag_datum    ON auftrag(datum);

CREATE TABLE vorlage (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  typ             TEXT NOT NULL CHECK(typ IN ('arbeitszettel', 'angebot', 'lieferschein')),
  data            TEXT NOT NULL DEFAULT '{}',     -- JSON Partial<Auftrag>
  erstellt_am     TEXT NOT NULL
);
CREATE INDEX idx_vorlage_typ ON vorlage(typ);

-- === Wartung & QR ===

CREATE TABLE anlage_qr (
  id              TEXT PRIMARY KEY,
  kunde_id        TEXT,
  kunde_name      TEXT NOT NULL DEFAULT '',
  anlage          TEXT NOT NULL,
  standort        TEXT,
  wartungsplan_id TEXT,                            -- FK kommt nach wartungsplan-CREATE (siehe unten)
  erstellt_am     TEXT NOT NULL,
  FOREIGN KEY (kunde_id) REFERENCES kunde(id) ON DELETE SET NULL
);
CREATE INDEX idx_anlage_qr_kunde ON anlage_qr(kunde_id);

CREATE TABLE wartungsplan (
  id                  TEXT PRIMARY KEY,
  kunde_id            TEXT,
  kunde_name          TEXT NOT NULL DEFAULT '',
  anlage              TEXT NOT NULL,
  standort            TEXT,
  intervall_monate    INTEGER NOT NULL DEFAULT 12,
  erinnerung_tage     INTEGER NOT NULL DEFAULT 14,
  letzte_wartung      TEXT,
  naechste_wartung    TEXT NOT NULL,
  notiz               TEXT,
  foto_pfad           TEXT,
  qr_code_id          TEXT,
  erstellt_am         TEXT NOT NULL,
  FOREIGN KEY (kunde_id)   REFERENCES kunde(id)     ON DELETE SET NULL,
  FOREIGN KEY (qr_code_id) REFERENCES anlage_qr(id) ON DELETE SET NULL
);
CREATE INDEX idx_wartungsplan_naechste ON wartungsplan(naechste_wartung);
CREATE INDEX idx_wartungsplan_kunde    ON wartungsplan(kunde_id);

CREATE TABLE wartungs_historie (
  id                  TEXT PRIMARY KEY,
  wartungsplan_id     TEXT NOT NULL,
  durchgefuehrt_am    TEXT NOT NULL,
  notiz               TEXT,
  foto_pfad           TEXT,
  auftrag_id          TEXT,
  FOREIGN KEY (wartungsplan_id) REFERENCES wartungsplan(id) ON DELETE CASCADE,
  FOREIGN KEY (auftrag_id)      REFERENCES auftrag(id)      ON DELETE SET NULL
);
CREATE INDEX idx_wartungs_historie_plan ON wartungs_historie(wartungsplan_id);

CREATE TABLE checkliste_vorlage (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  typ             TEXT NOT NULL CHECK(typ IN ('wartung', 'arbeitszettel', 'angebot')),
  items           TEXT NOT NULL DEFAULT '[]'      -- JSON {text:string}[]
);
CREATE INDEX idx_checkliste_vorlage_typ ON checkliste_vorlage(typ);

-- === Auth, Config, System ===

-- single-row Auth-Tabelle (id ist immer 1, per CHECK-Constraint erzwungen)
CREATE TABLE auth (
  id                INTEGER PRIMARY KEY CHECK(id = 1),
  pin_hash          TEXT,
  failed_attempts   INTEGER NOT NULL DEFAULT 0,
  locked_until      TEXT
);
INSERT INTO auth (id, pin_hash, failed_attempts) VALUES (1, NULL, 0);

CREATE TABLE config (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL DEFAULT 'null'    -- JSON
);

CREATE TABLE push_subscription (
  id              TEXT PRIMARY KEY,
  endpoint        TEXT NOT NULL UNIQUE,
  keys_p256dh     TEXT NOT NULL,
  keys_auth       TEXT NOT NULL,
  user_agent      TEXT,
  erstellt_am     TEXT NOT NULL
);

CREATE TABLE log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       TEXT NOT NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  message         TEXT NOT NULL DEFAULT '',
  metadata        TEXT                            -- JSON | NULL
);
CREATE INDEX idx_log_timestamp ON log(timestamp);
CREATE INDEX idx_log_entity    ON log(entity_type, entity_id);
