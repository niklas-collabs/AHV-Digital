# AHV Arbeitszettel — Spezifikation

Diese Datei beschreibt **was** gebaut wird. Die Regeln **wie** gebaut wird stehen in `CLAUDE.md`.

Die Spec ist in drei Phasen geteilt. **Eine Phase wird komplett fertiggestellt und von mir abgenommen, bevor die nächste beginnt.**

---

## Glossar (deutsche Domain-Begriffe)

- **Auftrag** — Sammelbegriff für Arbeitszettel, Angebot oder Lieferschein
- **Arbeitszettel** — Dokument was nach getaner Arbeit ausgefüllt wird (mit Unterschrift)
- **Angebot** — Kostenvoranschlag mit Preisen, ohne Unterschrift
- **Lieferschein** — Dokument über gelieferte Materialien
- **Teilleistung** — Ein Auftrag kann aus mehreren Teilleistungen bestehen (z.B. Großbaustelle in Etappen)
- **Pauschale** — Vordefinierter Posten mit festem Preis (z.B. "Anfahrt 30€", "Pressgeräteeinsatz 25€")
- **Stufe** — Mitarbeiter-Lohnstufe mit Stundenpreis (z.B. Geselle 45€, Helfer 30€, Meister 65€)
- **Wartungsplan** — Wiederkehrende Wartung einer Anlage (z.B. Heizung jährlich) mit Erinnerung
- **Anlage** — Ein konkretes Stück Technik beim Kunden (z.B. "Gasheizung Keller bei Müller")
- **Vorlage** — Gespeicherter Auftrags-Entwurf zur Wiederverwendung

---

## Datenmodell (komplett, alle Phasen)

In `/shared/types.ts` als TypeScript-Interfaces, in SQLite als Tabellen.

### `auftrag`
```typescript
interface Auftrag {
  id: string;                    // UUID
  typ: 'arbeitszettel' | 'angebot' | 'lieferschein';
  status: 'entwurf' | 'abgeschickt';
  titel: string;
  datum: string;                 // ISO date
  beschreibung: string;
  notiz_intern: string;
  kunde_id: string | null;       // Referenz auf kunde
  kunde_snapshot: KundeSnapshot; // Kopie der Kundendaten zum Zeitpunkt der Erstellung
  objekt_adresse: string | null; // Falls Einsatzort != Kundenadresse
  mitarbeiter: AuftragMitarbeiter[];
  materialien: AuftragMaterial[];
  fotos: string[];               // Pfade zu Foto-Dateien (Server-side)
  signature_data_url: string | null;
  checkliste: ChecklistenItem[] | null;
  erstellt_am: string;           // ISO datetime
  geaendert_am: string;
  abgeschickt_am: string | null;
}

interface AuftragMitarbeiter {
  name: string;
  stufe_id: string | null;
  stufe_bezeichnung: string;
  stundenpreis: number;
  stunden: number;
}

interface AuftragMaterial {
  name: string;
  menge: number;
  einheit: string;
  preis_netto: number;
  mwst_prozent: number;
  ist_lohnkosten: boolean;
}

interface ChecklistenItem {
  text: string;
  checked: boolean;
}
```

### `kunde`
```typescript
interface Kunde {
  id: string;
  typ: 'privat' | 'firma';
  firmenname: string | null;
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  lexoffice_id: string | null;   // Verknüpfung zu Lexoffice (Phase 2)
  notiz: string | null;
  erstellt_am: string;
  geaendert_am: string;
}

type KundeSnapshot = Pick<Kunde, 'typ'|'firmenname'|'vorname'|'nachname'|'email'|'strasse'|'plz'|'ort'>;
```

### `mitarbeiter_stufe`
```typescript
interface Stufe {
  id: string;
  bezeichnung: string;     // "Geselle", "Helfer", "Meister"
  stundenpreis: number;    // €/Std netto
  reihenfolge: number;     // Sortierung
}
```

### `pauschale`
```typescript
interface Pauschale {
  id: string;
  name: string;
  preis_netto: number;
  einheit: string;         // "Psch", "Stk", "m", "m²", "l", "kg"
  mwst_prozent: number;    // 19, 7, 0
  ist_lohnkosten: boolean; // Für Steuer-Reporting (§35a EStG)
}
```

### `vorlage`
```typescript
interface Vorlage {
  id: string;
  name: string;
  typ: 'arbeitszettel' | 'angebot' | 'lieferschein';
  data: Partial<Auftrag>;  // Vorausgefüllte Felder
  erstellt_am: string;
}
```

### `wartungsplan`
```typescript
interface Wartungsplan {
  id: string;
  kunde_id: string | null;
  kunde_name: string;      // Für Freitext falls kein Kunde verknüpft
  anlage: string;          // "Gasheizung Keller"
  standort: string | null; // "Keller, EG links"
  intervall_monate: number;
  erinnerung_tage: number; // X Tage vor Fälligkeit erinnern
  letzte_wartung: string | null;     // ISO date
  naechste_wartung: string;          // berechnet
  notiz: string | null;
  foto_pfad: string | null;
  qr_code_id: string | null;
  erstellt_am: string;
}

interface WartungsHistorie {
  id: string;
  wartungsplan_id: string;
  durchgefuehrt_am: string;
  notiz: string | null;
  foto_pfad: string | null;
  auftrag_id: string | null;  // Verknüpfter Arbeitszettel falls vorhanden
}
```

### `checkliste` (Vorlagen-Checklisten, nicht zu verwechseln mit der inline-Checkliste in Aufträgen)
```typescript
interface ChecklisteVorlage {
  id: string;
  name: string;
  typ: 'wartung' | 'arbeitszettel' | 'angebot';
  items: { text: string }[];
}
```

### `anlage_qr`
```typescript
interface AnlagenQR {
  id: string;            // UUID, wird in QR-Code kodiert
  kunde_id: string | null;
  kunde_name: string;
  anlage: string;
  standort: string | null;
  wartungsplan_id: string | null;
  erstellt_am: string;
}
```

### `config` (Key-Value)
```typescript
type ConfigKey =
  | 'firma'              // FirmaConfig (Name, Adresse, USt-Nr, etc.)
  | 'gmail'              // GmailConfig (User, AppPasswort)
  | 'lexoffice_api_key'  // string
  | 'logo'               // { path, mime }
  | 'theme_default'      // 'dark' | 'light'
  | 'language_default'   // 'de' | 'en'
  | 'vapid_keys';        // { publicKey, privateKey }
```

### `auth`
```typescript
interface AuthState {
  pin_hash: string | null;     // bcrypt
  failed_attempts: number;
  locked_until: string | null; // ISO datetime
}
```

### `push_subscription`
Web-Push-Subscription pro Gerät.

### `log`
Aktionsprotokoll (was wurde wann gemacht).

---

## API-Übersicht (komplett, alle Phasen)

Alle Endpoints unter `/api`, alle (außer `/api/auth/*`) hinter Auth-Middleware.

```
POST   /api/auth/login          { pin } → { token }
POST   /api/auth/setup          { pin, oldPin? } → { token }
GET    /api/auth/status         → { needsSetup: boolean }

GET    /api/auftraege?status=entwurf|abgeschickt&kunde_id=...
GET    /api/auftraege/:id
POST   /api/auftraege           Body: AuftragInput → { id }
PUT    /api/auftraege/:id
DELETE /api/auftraege/:id
POST   /api/auftraege/:id/abschicken  { sendKunde, sendFotos }
POST   /api/auftraege/:id/convert     { neuer_typ }
POST   /api/auftraege/:id/teilleistung
GET    /api/auftraege/:id/pdf

GET    /api/kunden?q=suchbegriff
GET    /api/kunden/:id
POST   /api/kunden
PUT    /api/kunden/:id
DELETE /api/kunden/:id
POST   /api/kunden/sync-lexoffice    (Phase 2)

GET    /api/stufen
POST   /api/stufen
PUT    /api/stufen/:id
DELETE /api/stufen/:id

GET    /api/pauschalen
POST   /api/pauschalen
PUT    /api/pauschalen/:id
DELETE /api/pauschalen/:id

GET    /api/vorlagen
POST   /api/vorlagen
PUT    /api/vorlagen/:id
DELETE /api/vorlagen/:id

GET    /api/wartungsplaene
GET    /api/wartungsplaene/:id
POST   /api/wartungsplaene
PUT    /api/wartungsplaene/:id
DELETE /api/wartungsplaene/:id
POST   /api/wartungsplaene/:id/erledigt   { datum, notiz, foto }

GET    /api/checklisten
POST   /api/checklisten
PUT    /api/checklisten/:id
DELETE /api/checklisten/:id

GET    /api/anlagen-qr
POST   /api/anlagen-qr
GET    /api/anlagen-qr/:id          (für QR-Scan-Aufruf)
DELETE /api/anlagen-qr/:id

GET    /api/config
PUT    /api/config                  Body: { key, value }
POST   /api/logo                    multipart/form-data
DELETE /api/logo

POST   /api/push/subscribe
POST   /api/push/unsubscribe

GET    /api/log
GET    /api/export                  → JSON-Backup aller Daten
GET    /api/plz/:plz                → { found, city }   (Phase 3, optional externe API)
```

---

## PHASE 1 — Fundament

**Ziel:** Eine lauffähige App mit der ich Aufträge anlegen, ausdrucken (PDF) und lokal verwalten kann. Noch ohne externe Integrationen, noch ohne Wartung/QR/Checklisten.

**Akzeptanzkriterium:** Ich kann auf dem Handy einen Arbeitszettel anlegen, einen Kunden zuordnen, Stunden und Material erfassen, eine PDF generieren und herunterladen — alles über die installierte PWA.

### 1.1 Projekt-Setup
- npm Workspaces initialisieren (`client`, `server`, `shared`)
- Root-Scripts: `dev` (startet beide parallel), `build`, `start`
- Tailwind + shadcn/ui einrichten (mit Dark-Mode-Support)
- ESLint + Prettier (sanft, nicht streng)
- Render.com `render.yaml` für Deploy-Setup
- README mit Anleitung wie ich lokal starte

### 1.2 Datenbank-Foundation
- `better-sqlite3` Singleton in `server/src/db/client.ts`
- Einfaches Migrations-System (`migrations/001_init.sql`, `002_...`, automatisch beim Start)
- Erste Migration: alle Tabellen aus dem Datenmodell oben (auch wenn manche erst in Phase 2/3 genutzt werden — Schema einmal richtig anlegen)
- Backup-Strategie: täglich Kopie der DB-Datei in `data/backups/`

### 1.3 Auth (PIN)
- 4-stelliger PIN, bcrypt-gehasht in DB
- Login-Page (Pin-Pad UI wie in Legacy)
- JWT-Token (jose), 24h gültig, in HTTP-only Cookie ODER localStorage (entscheide und begründe)
- Middleware `requireAuth` für alle `/api/*` außer `/api/auth/*`
- Brute-Force-Schutz: nach 5 Fehlversuchen 15 min Lock
- Setup-Flow: beim ersten Start ohne PIN → leerer PIN setzt initialen PIN

### 1.4 Settings & Firma
- Firmendaten erfassen (Name, Adresse, USt-Nr, Tel, E-Mail)
- Logo-Upload (PNG/JPG, max 1MB, gespeichert in `data/uploads/logo.{ext}`)
- Theme: Dark (default) / Light
- Sprache: DE (default) / EN
- Settings persistiert serverseitig (config-Tabelle)

### 1.5 Stammdaten-Verwaltung
- Stufen anlegen/bearbeiten/löschen
- Pauschalen anlegen/bearbeiten/löschen (mit Lohnkosten-Flag für §35a)
- Beides UI in Settings-Modal

### 1.6 Kunden-Verwaltung (lokal)
- Liste mit Suche
- Anlegen (Privat / Firma)
- Bearbeiten, Löschen (Soft-Delete falls Aufträge verknüpft? → einfache Lösung: Löschen verbieten wenn Aufträge existieren)
- PLZ-Feld erstmal frei, kein Lookup

### 1.7 Aufträge-CRUD (alle drei Typen)
- Liste mit zwei Tabs (Entwürfe / Archiv)
- Suche über Titel und Kundenname
- Formular für alle drei Typen (Arbeitszettel/Angebot/Lieferschein) mit Typ-Umschalter
- Pflichtfelder: Titel, Datum, Kunde
- Mitarbeiter-Zeilen (Name + Stufe + Stunden)
- Material-Zeilen (Name + Menge + Einheit + Preis + MwSt)
- Pauschalen-Chips zum Schnell-Hinzufügen
- Beschreibung + interne Notiz
- Speichern als Entwurf, Abschicken setzt Status (lokal — E-Mail-Versand kommt in Phase 2)
- Löschen mit Bestätigung

### 1.8 PDF-Generierung
- `pdfkit` Server-side
- Layout: Logo + Firmenheader oben, Kundenadresse, Auftragsdaten, Tabellen für Mitarbeiter und Material, Summen, Fußzeile mit USt-Nr/IBAN
- Drei leicht unterschiedliche Layouts pro Typ (Angebot zeigt Preise, Arbeitszettel hat Unterschriftsfeld, Lieferschein ohne Preise)
- Endpoint `GET /api/auftraege/:id/pdf` liefert PDF-Stream

### 1.9 PWA-Basis
- Manifest mit Icons in mehreren Größen
- Service Worker via `vite-plugin-pwa` (Strategie: NetworkFirst für API, CacheFirst für Assets)
- Install-Prompt funktioniert auf iOS und Android

### 1.10 UX-Grundlagen
- Mobile-first Layout (Bottom-Tabs Entwürfe / Archiv / Kunden / Settings)
- Sticky Header mit Logo, Theme-Toggle, Settings-Button
- Toast-System für Feedback
- Loading-States überall wo Daten geladen werden
- Fehler-Handling: API-Fehler zeigen Toast mit Message

**Phase 1 ist fertig wenn:** Ich kann offline einen Arbeitszettel anlegen, ihn als PDF generieren und auf meinem Handy als App nutzen.

---

## PHASE 2 — Pro-Features

**Ziel:** Externe Integrationen und Komfort-Features die täglichen Einsatz angenehm machen.

### 2.1 Lexoffice-Integration
- API-Key in Settings speichern (verschlüsselt? → mindestens nur server-side, niemals an Client liefern)
- Beim Anlegen eines Kunden in App: optional auch in Lexoffice anlegen (Checkbox)
- Manueller Sync-Button: "Kunden aus Lexoffice abgleichen" (alle laden, neue ergänzen, bestehende per Lexoffice-ID matchen)
- Connection-Test in Settings ("Verbindung prüfen")

### 2.2 Gmail-Versand
- App-Passwort in Settings (nicht reguläres Passwort)
- Beim Abschicken: PDF generieren, an Firma-E-Mail (Standard) und optional an Kunde mailen
- Optional Fotos als Anhänge mitschicken
- Test-Mail-Funktion in Settings
- Versand-Status in Aktionsprotokoll loggen

### 2.3 Fotos
- Foto-Upload via Datei-Input (mit `capture="environment"` für Kamera)
- Server-side Komprimierung (sharp): max 1600px Kante, JPEG 80%
- Speicherung in `data/uploads/auftraege/<auftrag_id>/<uuid>.jpg`
- In DB nur Pfade
- Thumbnail-Grid in der UI mit Lösch-Button
- Maximal 10 Fotos pro Auftrag

### 2.4 Foto-Annotation
- Klick auf Foto öffnet Vollbild-Editor
- Zeichnen mit 5 Farben (rot, grün, blau, gelb, weiß)
- Undo
- Speichern überschreibt Original (alte Version verworfen)

### 2.5 Unterschrift
- Canvas am Ende des Arbeitszettel-Formulars
- Touch-fähig
- Wird nur bei `typ === 'arbeitszettel'` angezeigt
- Speicherung als data-URL im Auftrag

### 2.6 Vorlagen
- "Als Vorlage speichern"-Button im Auftragsformular
- Vorlagen-Verwaltung in Settings (Liste, Löschen)
- "Aus Vorlage neu" beim Anlegen eines Auftrags
- Vorlagen sind typ-spezifisch

### 2.7 Teilleistungen
- Innerhalb eines Auftrags können mehrere Teilleistungen angelegt werden
- Jede Teilleistung hat eigene Mitarbeiter + Material + Datum
- PDF zeigt alle Teilleistungen aufsummiert

### 2.8 Pipeline-Konvertierung
- Aus Angebot → Arbeitszettel erstellen (übernimmt Material, ergänzt Mitarbeiter-Felder)
- Aus Arbeitszettel → Angebot erstellen (für Nachträge)
- Auftrag duplizieren (Kopie als Entwurf)
- Verknüpfung in DB: `urspruenglicher_auftrag_id` für Nachverfolgung

**Phase 2 ist fertig wenn:** Ich nutze die App seit zwei Wochen produktiv im Betrieb.

---

## PHASE 3 — Erweitert

**Ziel:** Wartungs-Workflow, Offline-Robustheit, Skalierungs-Vorbereitungen.

### 3.1 Wartungspläne
- CRUD für Wartungspläne
- Berechnung `naechste_wartung` aus `letzte_wartung + intervall_monate`
- Status: OK / Bald fällig / Überfällig (basierend auf `erinnerung_tage`)
- Tab "Wartung" mit Liste sortiert nach Fälligkeit
- "Erledigt"-Flow: Datum, Notiz, Foto → erstellt Eintrag in `wartungs_historie`, setzt `letzte_wartung` neu, berechnet nächsten Termin
- Optional: aus "Erledigt" direkt einen Arbeitszettel erstellen (vorausgefüllt)

### 3.2 Push-Notifications
- VAPID-Keys einmalig in Config generieren beim Setup
- "Push aktivieren" in Settings → Subscription speichern
- Cron-Job `node-cron` täglich um 7:00: prüft alle Wartungspläne, sendet Push für fällige
- Klick auf Notification öffnet App im Wartungs-Tab

### 3.3 QR-Codes für Anlagen
- Anlage anlegen (mit Verknüpfung zu Kunde + optional Wartungsplan)
- QR-Code generieren (Library: `qrcode`)
- QR-Code als PNG downloadbar zum Ausdrucken
- Beim Scan landet User auf `/qr/:id` → zeigt Anlagen-Historie + Schnellzugriff "Neuer Arbeitszettel für diese Anlage"

### 3.4 Checklisten-Vorlagen
- Vorlagen-Verwaltung in Settings (Name, Typ, Items)
- Im Auftragsformular: "Checkliste laden" Dropdown
- Items werden als Inline-Checkliste im Auftrag gespeichert
- Im PDF werden abgehakte Items dargestellt

### 3.5 Offline-Robustheit
- Ausgehende Mutations bei fehlender Verbindung in IndexedDB queuen (Library: `idb`)
- Bei Wiederverbindung: Queue abarbeiten, Konflikt-Strategie "last-write-wins"
- Offline-Indikator in UI
- Aufträge die nur lokal existieren mit "🔄 Wird synchronisiert"-Badge

### 3.6 Auto-Save
- Im Auftragsformular: nach 30 Sekunden Inaktivität automatisch speichern
- Indikator "Gespeichert" / "Ungespeichert"
- Beim Verlassen der Seite mit ungespeicherten Änderungen: Bestätigung

### 3.7 PLZ-Lookup
- Endpoint `GET /api/plz/:plz` nutzt freie API (z.B. zippopotam.us oder lokale CSV)
- Bei Eingabe einer 5-stelligen PLZ in Kunden-Formular: Ort automatisch füllen

### 3.8 Aktionsprotokoll
- Jede wichtige Aktion (Auftrag erstellt/abgeschickt, Kunde angelegt, E-Mail versendet, Wartung erledigt) in `log` Tabelle
- Anzeige in Settings (letzte 100 Einträge)

### 3.9 Backup & Export
- "Backup herunterladen": JSON-Datei mit allen Daten + Fotos als ZIP
- "Backup wiederherstellen": Upload und Import
- Tägliches Auto-Backup in `data/backups/`, 30 Tage rotation

### 3.10 Spracheinstellung erweitern
- Volle DE/EN-Übersetzung aller UI-Texte
- Datum/Zahl-Formatierung passt sich an
- PDF-Sprache folgt App-Sprache

**Phase 3 ist fertig wenn:** Die App ist Feature-vollständig gegenüber der Legacy-Version.

---

## Nicht im Scope (vorerst)

- Multi-User / Mandantenfähigkeit
- Mobile-Apps (iOS/Android nativ) — bleibt PWA
- Buchhaltungs-Export (DATEV) — Lexoffice macht das
- Zeiterfassung der Mitarbeiter live (wird im Auftrag manuell eingetragen)
- Lager-/Materialverwaltung mit Beständen
- Disposition / Tourenplanung
- Kundenportal

Diese Themen werden bewusst ausgeklammert. Wenn sich später ergibt dass eines davon doch wichtig ist, wird es separat besprochen.

---

## Offene Fragen die du mir stellen darfst

Wenn an einer Stelle in der Spec etwas unklar ist — z.B. genaue Validierungsregel, Default-Wert, Edge-Case — frag bevor du programmierst. Die Spec deckt nicht alles ab, das ist gewollt.
