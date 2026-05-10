-- Pipeline-Konvertierung (Phase 2.8): Verknuepfung zum Vorgaenger-Auftrag.
-- Wird gesetzt beim Duplizieren oder Konvertieren (Angebot -> Arbeitszettel etc.).
-- ON DELETE SET NULL: wenn der urspruengliche Auftrag geloescht wird, bleibt
-- die Kopie bestehen, verliert aber den Verweis.

ALTER TABLE auftrag
  ADD COLUMN urspruenglicher_auftrag_id TEXT
  REFERENCES auftrag(id) ON DELETE SET NULL;

CREATE INDEX idx_auftrag_urspruenglicher
  ON auftrag(urspruenglicher_auftrag_id);
