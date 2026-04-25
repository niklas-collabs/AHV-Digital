# AHV-Digital — AHV Arbeitszettel

PWA zur Verwaltung von Arbeitszetteln, Angeboten, Lieferscheinen, Wartung und Kunden für SHK-Betrieb.

> **Status: Phase 1.1 — Setup.** Datenmodell, Auth, CRUD, PDF, PWA folgen ab 1.2.

## Tech-Stack

- **Frontend** (`client/`): Vite + React 18 + TypeScript strict, Tailwind + shadcn/ui (Dark Mode), Sonner für Toasts
- **Backend** (`server/`): Express + TypeScript strict
- **Geteilt** (`shared/`): TypeScript-Typen für Client und Server
- **Deployment:** Render.com Free-Plan (Phase 1), später Starter mit Persistent Disk

Details und Regeln in [`CLAUDE.md`](./CLAUDE.md), Feature-Spezifikation in [`SPEC.md`](./SPEC.md).

## Voraussetzungen

- **Node.js 20 LTS** ([Download](https://nodejs.org/en/download/) oder `winget install OpenJS.NodeJS.LTS`)
- Git
- (Optional, für GitHub-Workflow) **GitHub CLI** (`winget install GitHub.cli`)

## Lokal starten

```bash
# Einmalig nach dem Klonen / Auschecken:
npm install

# Dev-Server starten (Client + Server parallel):
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Health-Check: http://localhost:3000/api/health

Vite proxyt Requests an `/api/*` automatisch zum Backend, daher gibt es im Frontend keine CORS-Probleme.

## Production-Build

```bash
npm run build   # baut shared, client und server
npm start       # startet den Server, der client/dist mit ausliefert
```

## Projektstruktur

```
ahv-digital/
├── client/          # Vite + React PWA
├── server/          # Express API
├── shared/          # Geteilte TypeScript-Typen
├── legacy/          # Alte Vanilla-JS-App (nur Referenz)
├── CLAUDE.md        # Projekt-Regeln und Workflow
├── SPEC.md          # Feature-Spezifikation aller Phasen
├── render.yaml      # Render.com Deployment-Config
└── package.json     # npm Workspaces Root
```

## Deployment auf Render

1. Repo bei GitHub vorhanden (`AHV-Digital`, privat)
2. In Render: **New +** → **Blueprint** → Repo auswählen
3. Render liest `render.yaml` und legt den Service `ahv-digital` (Free-Plan, Frankfurt) an
4. Build: `npm ci && npm run build` — Start: `npm start`
5. URL: `https://ahv-digital.onrender.com`

> ⚠️ **Free-Plan-Caveat:** Der Service schläft nach ~15 min Inaktivität (Cold-Start ~30 s)
> und hat **keine Persistent Disk**. Sobald wir in Phase 1.2 SQLite einbauen, gehen Daten
> bei jedem Deploy verloren — also vor produktivem Einsatz auf **Starter ($7/Monat)** wechseln
> und den `disk:`-Block in `render.yaml` aktivieren.

## Skripte (Root)

| Befehl              | Wirkung                                     |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Startet Client + Server parallel im Watch   |
| `npm run build`     | Baut shared → client → server (für Deploy)  |
| `npm start`         | Startet den gebauten Server                 |
| `npm run lint`      | ESLint über das ganze Repo                  |
| `npm run format`    | Prettier formatiert alle Dateien            |

## Phasen-Plan (Kurz)

- **Phase 1 — Fundament:** Setup (1.1 ✓), DB, Auth, Settings, Stammdaten, Kunden, Aufträge, PDF, PWA, UX
- **Phase 2 — Pro:** Lexoffice, Gmail-Versand, Fotos + Annotation, Unterschrift, Vorlagen, Pipeline-Konvertierung
- **Phase 3 — Erweitert:** Wartung, Push, QR, Checklisten, Offline-Queue, Auto-Save, PLZ-Lookup, Logs, Backup, i18n
