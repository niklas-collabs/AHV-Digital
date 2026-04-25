// Shared Types zwischen Client und Server.
// In Phase 1.2 kommen hier die echten Domain-Typen aus SPEC.md
// (Auftrag, Kunde, Stufe, Pauschale, Vorlage, Wartungsplan etc.).
// Für 1.1 nur ein Platzhalter, damit der Workspace einen Export hat.

export type HealthResponse = {
  ok: true;
  service: 'ahv-digital';
  version: string;
};
