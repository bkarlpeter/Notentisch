# Digitaler Notentisch - Projekt Notentisch

Ein interaktives Web-basiertes Tool zur Verwaltung von Lernkarten in einem Kanban-ähnlichen 4-Quadranten-System (Eisenhower-Matrix).

## Features

### Layout-Modi
- **2x2 Layout**: Vier Quadranten (Q1-Q4) mit Center-PDF-Viewer
- **80/20 Layout**: Großes Center-Feld mit scrollbarer Sidebar für die 4 Quadranten

### PDF-Ansicht
- **2-Seiten-Modus**: Zwei PDF-Seiten nebeneinander
- **3-Seiten-Modus**: Drei PDF-Seiten nebeneinander (automatisch verkleinert)
- **Adaptive Skalierung**: Bilder nutzen die volle verfügbare Höhe und passen sich automatisch an
- **Seiten-Navigation**: Pfeile (◄ ►) zum Blättern durch die PDF-Seiten

### Karten-Management
- **Vier Quadranten** (Eisenhower):
  - Q1 (oben links): Neue Idee
  - Q2 (oben rechts): Wiederholen
  - Q3 (unten links): Geübt
  - Q4 (unten rechts): Gelernt
- **Stapel-Effekt**: Cards an den äußeren Rändern gestaffelt dargestellt
- **Drag & Drop**: Karten zwischen Quadranten und zum Center ziehen
- **Stack-Limit**: Maximale Anzahl sichtbarer Karten pro Quadrant konfigurierbar
- **Stack-Offset**: Abstand zwischen gestapelten Karten einstellbar
- **Timestamp-Tracking**: Speichert automatisch, wann eine Card zuletzt im Center angesehen wurde
- **Quadrant-Pagination**: Unabhängige Seitenverwaltung pro Quadrant
- **Quadrant-Spalten-Support**: Liest `<Quadrant>` XML-Spalte (1-4) und ordnet Karten automatisch zu

### XML-Verwaltung
- **Laden**: XML-Dateien mit Lernkarten importieren
- **Speichern**: Aktuelle Anordnung + Metadaten als XML exportieren
- **Auto-Limit**: Gespeicherte Stack-Limits werden wiederhergestellt
- **LastViewed**: Zeitstempel (`YYYY-MM-DD HH:MM:SS`) für jede Card gespeichert
- **Flexible Quadrant-Zuordnung**: Nutzt entweder `<Quadrant>` (1-4) oder `<ArbeitsStatus>` (neueIdee/wiederholen/geuebt/gelernt)

## Bedienung

### Buttons
- **LADEN**: XML-Datei auswählen
- **SPEICHERN**: Aktuelle Anordnung speichern (mit Timestamp)
- **Layout: 2x2 / 80/20**: Layout wechseln
- **2 Seiten / 3 Seiten**: PDF-Ansicht umschalten
- **↑ ↓**: Karten im aktuellen Quadrant durchblättern
- **L: [Limit]**: Stack-Limit eingeben (max. sichtbare Karten pro Quadrant)
- **S: [Offset]px**: Stack-Offset eingeben (Abstand zwischen Karten)

### Tastaturkürzel
- **Leertaste / ESC**: Fullscreen-Viewer schließen
- **ESC**: Card aus Center zurück zu Q1
- **← / →**: Karten-Seiten vor/zurück
- **Delete**: Card aus Center löschen

### Drag & Drop
1. Card auf Center ziehen → PDF wird geladen + Timestamp gespeichert
2. Card auf Quadrant ziehen → zwischen Quadranten verschieben (Status ändert sich sofort)
3. Im Quadrant klicken → aktiviert diesen Quadrant für die Pagination

## XML-Format

Die gespeicherte XML ist **vollständig Access-kompatibel** und kann direkt importiert werden.

### Struktur (vereinfacht)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<root>
    <StaffelLimit>8</StaffelLimit>
    
    <Notentisch>
        <NotID>1</NotID>
        <ArbeitsStatus>wiederholen</ArbeitsStatus>
        <Quadrant>2</Quadrant>
        <Speicherort>Mathe Kapitel 5#C:\PDFs\math.pdf</Speicherort>
        <LastViewed>2024-01-15 14:32:45</LastViewed>
    </Notentisch>
    
    <Notentisch>
        <NotID>2</NotID>
        <ArbeitsStatus>gelernt</ArbeitsStatus>
        <Quadrant>4</Quadrant>
        <Speicherort>Englisch Unit 3#C:\PDFs\english.pdf</Speicherort>
        <LastViewed>2024-01-15 13:15:22</LastViewed>
    </Notentisch>
    
</root>
```

### Feldwerte

| Feld | Wert | Beispiel | Notizen |
|------|------|----------|---------|
| `NotID` | Eindeutige ID | `1`, `2`, `3` | Erforderlich |
| `ArbeitsStatus` | Q1-Q4 Status | `neueIdee`, `wiederholen`, `geuebt`, `gelernt` | Fallback, wenn `<Quadrant>` fehlt |
| `Quadrant` | Quadrant-Nummer | `1`, `2`, `3`, `4` | **Neu!** Überschreibt `ArbeitsStatus` (optional) |
| `Speicherort` | Name#Pfad | `Mathe#C:\PDFs\math.pdf` | Erforderlich |
| `LastViewed` | Timestamp | `2024-01-15 14:32:45` | Wird beim Drag ins Center gesetzt |
| `StaffelLimit` | Max. sichtbare Cards | `8`, `10`, `12` | Pro Quadrant |

### Quadrant-Mapping

Wenn `<Quadrant>` vorhanden:
- `1` → Q1 (Neue Idee)
- `2` → Q2 (Wiederholen)
- `3` → Q3 (Geübt)
- `4` → Q4 (Gelernt)

Fallback auf `<ArbeitsStatus>`, wenn `<Quadrant>` fehlt oder ungültig ist.

### Access-Import

Die XML ist **direkt in Access importierbar**:
1. Access öffnen → "Externe Daten" → "XML importieren"
2. `notenblaetter_cards_updated.xml` auswählen
3. Access erstellt automatisch Tabellen mit allen Feldern (inkl. `Quadrant`)
4. `LastViewed` ist im Format `YYYY-MM-DD HH:MM:SS` (datumkompatibel)

### Workflow mit Access

```
Notentisch (Web)          →  XML exportieren  →  Access importieren
  ↓ Änderungen                                          ↓
  ↓ Neue Timestamps                          Access-Datenbank
  ↓ Quadrant-Wechsel                         (mit Quadrant-Spalte)
  ↓                                                  ↓
  ← XML neu laden          ← Access exportiert   Auswertungen
```

## Technologie

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **PDF-Rendering**: PDF.js
- **Architektur**: Separierte HTML/CSS/JavaScript in `board.html`, `board.js`
- **Launcher**: `notentisch_start.vbs` (PowerShell-Server)

## Installation & Start

### Empfohlene Methode (PowerShell-Server)

1. **Doppelklick auf `notentisch_start.vbs`**
   - Startet automatisch den PowerShell-Server auf Port 8080
   - Öffnet Browser mit `http://localhost:8080/board.html`
   - **Vorteil**: Greift auf PDFs außerhalb des Projekt-Ordners zu

### Alternative Methode (Python-Server - deprecated)

1. **Doppelklick auf `Notentisch.vbs`** (erfordert Python 3.6+)
   - Startet Python-Server auf Port 8000
   - **Nachteil**: PDFs müssen im OneDrive-Root erreichbar sein

## Workflow: Access → Notentisch → Speichern

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Microsoft Access                                         │
│    └─ Export Tabelle "NotenTisch" als XML                   │
│       ├─ Notentisch.xml (Kartendaten + Quadrant-Spalte)    │
│       └─ Cards_Export/*.png (Vorschaubilder)                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Start: notentisch_start.vbs (Doppelklick)                │
│    └─ Startet start_server.ps1 (PowerShell-Server)          │
│       ├─ Port 8080                                          │
│       └─ Öffnet http://localhost:8080/board.html            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Im Browser: Board laden                                  │
│    └─ Click LADEN → Select Notentisch.xml                   │
│       ├─ Liest <Quadrant>-Spalte (1-4) oder ArbeitsStatus   │
│       ├─ Ordnet Karten automatisch den richtigen            │
│       │  Quadranten zu                                      │
│       ├─ Unabhängige Pagination pro Quadrant                │
│       └─ Zeigt Cards in 4 Quadranten                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Mit Karten arbeiten                                      │
│    ├─ Drag Card ins Center → PDF lädt automatisch           │
│    │  └─ LastViewed Timestamp wird gesetzt                  │
│    ├─ Drag zwischen Quadranten → Status ändert sich         │
│    ├─ Klick in Quadrant → Pagination für diesen Quadranten │
│    └─ ↑/↓ Buttons → Navigiere Karten im Quadrant            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Speichern                                                │
│    └─ Click SPEICHERN                                       │
│       └─ Download: Notentisch.xml (mit gleichem Namen)      │
│          ├─ Aktualisierte ArbeitsStatus + Quadrant          │
│          └─ LastViewed Timestamps                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Zurück zu Access (Optional)                              │
│    └─ Import aktualisierte Notentisch.xml                   │
│       └─ Auswertungen mit LastViewed-Daten                  │
└─────────────────────────────────────────────────────────────┘
```

**Wichtig**: Access-Export kann Dateinamen-Bugs haben:
- Broken UTF-8: `München` → `MÃ¼nchen`
- Trailing Spaces: `Name.png` → `Name   .png` (1-4 Leerzeichen)
- Das Board kompensiert diese Bugs automatisch!

## Detaillierte Bedienung

### 1. XML-Datei laden

1. Click auf **LADEN** Button
2. Wähle `Notentisch.xml`
3. Board lädt:
   - **Kartendaten** aus XML (NotID, ArbeitsStatus, Quadrant, Speicherort)
   - **PDF-Pfade** aus `<Speicherort>` Element
   - **Vorschaubilder** aus `Cards_Export/` (automatische Suche)

**Pfad-Format in XML:**
```xml
<Speicherort>Titel#C:\Users\User\OneDrive\myMusic\Noten\Blätter\Datei.pdf</Speicherort>
```
oder relativ:
```xml
<Speicherort>Titel#..\..\myMusic\Noten\Blätter\Datei.pdf</Speicherort>
```

### 2. Mit Karten arbeiten

- **Drag ins Center**: PDF wird automatisch geladen
- **Zwischen Quadranten**: Karten verschieben (Status ändert sich)
- **Klick in Quadrant**: Aktiviert diesen Quadrant für die Pagination
- **↑/↓ Buttons**: Navigiert Karten im aktuellen Quadrant
- **Timestamp**: Beim Drag ins Center wird `LastViewed` gesetzt

### 3. Speichern

1. Click auf **SPEICHERN** Button
2. Datei wird heruntergeladen mit dem ursprünglichen Dateinamen (z.B. `Notentisch.xml`)
3. Enthält:
   - Aktualisierte `ArbeitsStatus` (neueIdee/wiederholen/geuebt/gelernt)
   - `Quadrant` Werte (1-4)
   - `LastViewed` Timestamps (Format: `YYYY-MM-DD HH:MM:SS`)
   - Stack-Limit Einstellung

**Tipp**: In den Browser-Einstellungen "Vor jedem Download nach Speicherort fragen" aktivieren, um die Datei direkt zu überschreiben.

## Datei-Übersicht

### Starter-Dateien
- **`notentisch_start.vbs`** - PowerShell-Server Launcher (empfohlen)
- `start_server.ps1` - PowerShell-Server (wird von notentisch_start.vbs aufgerufen)
- `Notentisch.vbs` - Python-Server Launcher (deprecated)
- `Notentisch.bat` - Python-Server CMD Launcher (deprecated)

### Haupt-Anwendung
- **`board.html`** - HTML-Struktur und Styles
- **`board.js`** - JavaScript-Logik (PDF-Laden, Drag&Drop, XML-Handling, Quadrant-Management)

### Access-Integration
- **`ExtractCards.ps1`** - PowerShell-Skript für Access-Export
- `Notentisch.xml` - Eingabe-Datei (vom Access exportiert)
- `notenblaetter_cards_updated.xml` - Ausgabe-Datei (zum Access-Import)

### Vorschaubilder
- **`Cards_Export/`** - Ordner mit PNG-Vorschaubildern (vom Access erstellt)
  - Format: `Kartenname.png` (190x250px Vorschau der ersten PDF-Seite)

### Dokumentation
- `README.md` - Diese Dokumentation
- `CHANGELOG.md` - Versionshistorie
- `Todo.txt` - Geplante Features (lokal, nicht in Git)

## Systemanforderungen

### Für PowerShell-Server (empfohlen)
- **Windows 10+** mit PowerShell 5.1+
- **Moderner Browser** (Chrome, Firefox, Edge)
- Keine zusätzliche Software nötig!

### Für Python-Server (deprecated)
- **Windows 7+** oder andere Betriebssysteme
- **Python 3.6+** (muss im PATH sein)
- **Moderner Browser** (Chrome, Firefox, Edge, Safari)

## Neuerungen (Februar 2026)

✅ **Quadrant-Spalten-Support**: Liest `<Quadrant>` XML-Spalte (1-4)
✅ **Unabhängige Pagination**: Jeder Quadrant hat eigenen Offset
✅ **Intelligente Quadrant-Zuordnung**: Nutzt `<Quadrant>` wenn vorhanden, sonst `<ArbeitsStatus>`
✅ **parseInt() für Quadrant-Werte**: Konvertiert String zu Integer
✅ **Fehlerfreie Spalten-Verwaltung**: Keine 27.000+ Spalten Bug mehr!

---
*Letztes Update: Februar 2026*
- Quadrant-Spalten-Support mit parseInt()
- Unabhängige Pagination pro Quadrant
- Automatisches PDF-Laden mit PowerShell-Server
- Robuste Card-Vorschaubilder (Access-Export Bug-Fixes)
- Verzögertes Laden verhindert Server-Overload

