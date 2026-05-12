-- Lexoffice-Push (Phase 4): wenn ein Auftrag als Rechnung in Lexoffice
-- angelegt wurde, speichern wir die Lexoffice-Invoice-ID. Erlaubt
-- Resync (Footer mit Lohnkosten aktualisieren) und Anzeige eines
-- Badges in der App.

ALTER TABLE auftrag
  ADD COLUMN lexoffice_invoice_id TEXT;

CREATE INDEX idx_auftrag_lexoffice_invoice
  ON auftrag(lexoffice_invoice_id);
