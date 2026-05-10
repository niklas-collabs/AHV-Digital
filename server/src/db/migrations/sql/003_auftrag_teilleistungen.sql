-- Teilleistungen (Phase 2.7): JSON-Array mit eigenen Mitarbeiter- und
-- Material-Zeilen pro Teilleistung. Default '[]' damit alte Aufträge
-- ohne Migration-Lauf konsistent bleiben.

ALTER TABLE auftrag
  ADD COLUMN teilleistungen TEXT NOT NULL DEFAULT '[]';
