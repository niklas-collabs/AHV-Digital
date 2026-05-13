-- Identity Lite: Multi-User mit getrennten PINs (Pfad 2 / Option A).
-- Aktuell nur die zwei Inhaber, kein Permission-Modell — alle haben
-- Vollzugriff. Pro Aktion wird der Urheber im Aktionsprotokoll
-- gespeichert.

CREATE TABLE benutzer (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  pin_hash        TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  erstellt_am     TEXT NOT NULL
);

-- Migration des bestehenden PIN-Hashs: wird automatisch zum ersten
-- Benutzer "Inhaber". Falls noch kein PIN gesetzt war, passiert hier
-- nichts — der Setup-Flow legt dann den ersten User an.
INSERT INTO benutzer (id, name, pin_hash, failed_attempts, locked_until, erstellt_am)
SELECT
  'migrated-' || lower(hex(randomblob(8))),
  'Inhaber',
  pin_hash,
  failed_attempts,
  locked_until,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM auth
WHERE pin_hash IS NOT NULL;

-- Aktionsprotokoll: Urheber-Spalten. Denormalisiertes user_name, damit
-- Einträge auch nach Benutzer-Löschung lesbar bleiben.
ALTER TABLE log ADD COLUMN user_id TEXT;
ALTER TABLE log ADD COLUMN user_name TEXT;

CREATE INDEX idx_log_user ON log(user_id);
