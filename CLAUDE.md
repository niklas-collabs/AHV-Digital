# AHV Arbeitszettel — Projekt-Regeln

## Wer ich bin

Ich heiße Niklas, betreibe einen SHK-Betrieb (Heizung, Sanitär, Klima) in Deutschland und bin **kein professioneller Entwickler**. Ich habe Grundkenntnisse in JS/HTML, kann Code lesen, aber bitte erkläre nicht-triviale Architekturentscheidungen kurz auf Deutsch.

## Was wir bauen

**AHV Arbeitszettel** — eine Progressive Web App (PWA) zur Verwaltung von Arbeitszetteln, Angeboten, Lieferscheinen, Wartungsplänen und Kunden für meinen SHK-Betrieb. Läuft auf dem Handy (Baustelle) und im Browser (Büro).

Es gibt eine Vorgängerversion in Vanilla JS / einer einzigen HTML-Datei. **Diese bauen wir komplett neu — sauber, modular, wartbar.** Die alte Datei `legacy/index.html` (kommt in den Repo-Ordner) ist **nur Referenz für Features und UI-Ideen** — kein Code wird daraus kopiert.

## Tech-Stack (festgelegt, nicht zur Diskussion)

### Frontend (`/client`)
- **Vite + React 18 + TypeScript** (strict mode)
- **Tailwind CSS + shadcn/ui** für UI-Komponenten
- **React Router v6** für Navigation
- **TanStack Query** für Server-State (Caching, Retries, Offline-Verhalten)
- **Zustand** für minimalen Client-State (Theme, Sprache, Auth-Token)
- **React Hook Form + Zod** für Formulare und Validierung
- **vite-plugin-pwa** für Service Worker, Offline, Install-Prompt
- **date-fns** für Datums-Handling (deutsche Locale)
- **lucide-react** für Icons

### Backend (`/server`)
- **Express + TypeScript** (strict mode)
- **better-sqlite3** (synchron, schnell, einfacher als async sqlite)
- **Zod** für Request-Validierung an jedem Endpoint
- **bcrypt** für PIN-Hash, **jose** für JWT-Tokens
- **nodemailer** für Gmail SMTP
- **web-push** für Push-Notifications
- **multer** für Datei-Uploads (Logo, Fotos)
- **pdfkit** für PDF-Generierung (server-side)
- **node-cron** für Wartungs-Erinnerungs-Checks

### Geteilt (`/shared`)
- TypeScript-Typen die Frontend und Backend teilen (Auftrag, Kunde, Wartungsplan, etc.)

### Deployment
- Render.com (wie bisher), eine einzige Node-Instanz
- Express serviert auch das gebaute Frontend (`client/dist`) als statische Dateien

## Projektstruktur

```
ahv-arbeitszettel/
├── client/              # Vite React App
│   ├── src/
│   │   ├── pages/       # Eine Datei pro Route
│   │   ├── components/  # Wiederverwendbare UI
│   │   ├── features/    # Feature-spezifische Komponenten + Logik
│   │   ├── lib/         # API-Client, Utilities
│   │   ├── hooks/       # Custom React Hooks
│   │   ├── stores/      # Zustand-Stores
│   │   ├── i18n/        # DE/EN Übersetzungen
│   │   └── types/       # Frontend-spezifische Typen
│   └── vite.config.ts
├── server/              # Express API
│   ├── src/
│   │   ├── routes/      # Eine Datei pro Resource
│   │   ├── services/    # Business-Logik
│   │   ├── db/
│   │   │   ├── migrations/  # SQL-Migrations, nummeriert
│   │   │   ├── schema.ts    # TypeScript-Repräsentation
│   │   │   └── client.ts    # better-sqlite3 Singleton
│   │   ├── middleware/  # Auth, Error-Handler, Logging
│   │   ├── lib/         # Externe APIs (Lexoffice, PDF, E-Mail)
│   │   └── index.ts     # Entry Point
│   └── tsconfig.json
├── shared/              # Geteilt zwischen Client und Server
│   └── types.ts
├── package.json         # npm workspaces root
├── CLAUDE.md            # Diese Datei
├── SPEC.md              # Detaillierte Feature-Spezifikation
└── legacy/
    └── index.html       # Alte App, nur als Referenz
```

## Architektur-Regeln

1. **Datenmodell first.** Bevor ein Feature gebaut wird, ist der TypeScript-Typ in `/shared/types.ts` definiert und die SQL-Migration geschrieben.
2. **Validierung an der Grenze.** Jeder Endpoint validiert seinen Input mit Zod, bevor irgendwas passiert.
3. **Keine Geschäftslogik in Routes.** Routes machen nur Validierung + Service-Aufruf + Response-Mapping. Logik gehört in `server/src/services/`.
4. **Keine Geschäftslogik im UI.** React-Komponenten zeigen Daten an und triggern Mutations. Berechnungen, Transformationen, Validierung gehören in `lib/` oder Hooks.
5. **API-Calls nur über TanStack Query.** Kein nacktes `fetch` in Komponenten. Es gibt einen `apiClient` in `client/src/lib/api.ts` der für alle Requests genutzt wird.
6. **Kein Auth-Bypass.** Jeder `/api/*`-Endpoint außer `/api/auth/*` ist hinter dem PIN-Auth-Middleware.
7. **Migrationen sind unveränderlich.** Einmal committed wird eine Migration nie geändert — neue Migrations werden hinzugefügt.

## Coding-Konventionen

- **TypeScript strict.** Kein `any`, kein `as unknown as ...`. Wenn ein Typ unklar ist: nachfragen.
- **Funktionale Komponenten + Hooks.** Keine Klassen-Komponenten.
- **Named exports** überall (kein `export default` außer wo Vite/React es zwingend verlangt).
- **Datei-Naming:** `kebab-case.ts` für Module, `PascalCase.tsx` für Komponenten.
- **Variablennamen:** Domain-Begriffe auf Deutsch (`auftrag`, `kunde`, `wartungsplan`, `pauschale`, `stufe`), Technisches auf Englisch (`useAuftrag`, `fetchKunden`).
- **Kommentare auf Deutsch** wenn sie das Domain-Modell betreffen, sonst Englisch.
- **Keine `console.log` im Commit.** Im Backend: structured logging via Helper.
- **Fehlerbehandlung explizit.** Kein silent fail. UI zeigt Toast bei Fehlern.

## Was nicht passieren darf

- ❌ Code aus `legacy/index.html` blind kopieren — wir bauen neu.
- ❌ Neue Frameworks/Libraries hinzufügen ohne Rückfrage.
- ❌ Multi-Tenancy einbauen — bleibt single-user.
- ❌ Auth-Tokens / API-Keys ins Frontend leaken.
- ❌ Direkte SQL-Queries in Routes (nur über `services/`).
- ❌ Tests "schreiben um zu passen" — Tests testen Verhalten, nicht Implementierung.

## Workflow für neue Features

1. **Spec lesen.** Welche Phase? Welcher Abschnitt in `SPEC.md`?
2. **Plan-Übersicht** bei großen Phasen — 3–5 Zeilen was geplant ist, kein Detail-Fragen-Block. Bei kleineren Änderungen direkt loslegen.
3. **Pragmatische Entscheidungen** für Datei-Naming, Sortierreihenfolge, Default-Werte, kleine UX-Details — keine Rückfrage nötig.
4. **Rückfrage nur bei echten Spec-Lücken** (Soft- vs. Hard-Delete, Auth ja/nein für einen Endpoint, abweichende Architektur-Entscheidungen). Lieber eine knappe Klärung als später ein Refactoring.
5. **Datenmodell zuerst.** Typ + Migration + Service-Skelett — dann erst UI.
6. **Eine Phase nach der anderen.** Phase 2 wird nicht angefangen, bevor Phase 1 lauffähig und abgenommen ist.
7. **Tech-Stack bleibt dicht.** Keine neuen Frameworks/Libs ohne kurze Frage.
8. **Niklas kann jederzeit stoppen** und Änderungen am gerade geschriebenen Code verlangen — wird im nächsten Commit gefixt.

## Tests

- **Backend:** Vitest für Services. Jeder Service hat mindestens einen Happy-Path-Test.
- **Frontend:** Vitest + Testing Library nur für komplexe Logik (z.B. Auto-Save-Hook, Offline-Queue). Keine UI-Snapshot-Tests.
- **E2E:** Vorerst keine. Eventuell später Playwright.

## Phasen-Übersicht (Details in SPEC.md)

- **Phase 1 — Fundament:** Setup, Auth, Aufträge-CRUD, Kunden lokal, einfaches PDF, Settings, Theme/Sprache
- **Phase 2 — Pro-Features:** Lexoffice, Gmail-Versand, Fotos+Annotation, Unterschrift, Vorlagen, Teilleistungen, Pipeline-Konvertierung
- **Phase 3 — Erweitert:** Wartungspläne, Push-Notifications, QR-Codes, Checklisten, Offline-Queue (PWA), Auto-Save, Logging/Backup, PLZ-Lookup

Jede Phase ist einzeln deploybar und nutzbar.

## Kontakt zur Spec

Detaillierte Anforderungen je Feature, Datenmodell, API-Endpoints und Akzeptanzkriterien stehen in **`SPEC.md`**. Diese Datei wird gelesen wenn an einem konkreten Feature gearbeitet wird.

## Wenn etwas unklar ist

Frag mich. Ich bin verfügbar.
