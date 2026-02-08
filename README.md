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
- **Stack-Limit**: Maximale Anzahl sichtbarer Karten konfigurierbar
- **Stack-Offset**: Abstand zwischen gestapelten Karten einstellbar
- **Timestamp-Tracking**: Speichert automatisch, wann eine Card zuletzt im Center angesehen wurde

### XML-Verwaltung
- **Laden**: XML-Dateien mit Lernkarten importieren
- **Speichern**: Aktuelle Anordnung + Metadaten als XML exportieren
- **Auto-Limit**: Gespeicherte Stack-Limits werden wiederhergestellt
- **LastViewed**: Zeitstempel (`YYYY-MM-DD HH:MM:SS`) für jede Card gespeichert

## Bedienung

### Buttons
- **LADEN**: XML-Datei auswählen
- **SPEICHERN**: Aktuelle Anordnung speichern (mit Timestamp)
- **Layout: 2x2 / 80/20**: Layout wechseln
- **2 Seiten / 3 Seiten**: PDF-Ansicht umschalten
- **↑ ↓**: Karten durchblättern
- **L: [Limit]**: Stack-Limit eingeben
- **S: [Offset]px**: Stack-Offset eingeben

### Tastaturkürzel
- **Leertaste / ESC**: Fullscreen-Viewer schließen
- **ESC**: Card aus Center zurück zu Q1
- **← / →**: Karten-Seiten vor/zurück
- **Delete**: Card aus Center löschen

### Drag & Drop
1. Card auf Center ziehen → PDF wird geladen + Timestamp gespeichert
2. Card auf Quadrant ziehen → zwischen Quadranten verschieben

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
        <Speicherort>Mathe Kapitel 5#C:\PDFs\math.pdf</Speicherort>
        <LastViewed>2024-01-15 14:32:45</LastViewed>
    </Notentisch>
    
    <Notentisch>
        <NotID>2</NotID>
        <ArbeitsStatus>gelernt</ArbeitsStatus>
        <Speicherort>Englisch Unit 3#C:\PDFs\english.pdf</Speicherort>
        <LastViewed>2024-01-15 13:15:22</LastViewed>
    </Notentisch>
    
</root>
```

### Feldwerte

| Feld | Wert | Beispiel |
|------|------|----------|
| `NotID` | Eindeutige ID | `1`, `2`, `3` |
| `ArbeitsStatus` | Q1-Q4 Status | `neueIdee`, `wiederholen`, `geuebt`, `gelernt` |
| `Speicherort` | Name#Pfad | `Mathe#C:\PDFs\math.pdf` |
| `LastViewed` | Timestamp | `2024-01-15 14:32:45` |
| `StaffelLimit` | Max. sichtbare Cards | `8`, `10`, `12` |

### Access-Import

Die XML ist **direkt in Access importierbar**:
1. Access öffnen → "Externe Daten" → "XML importieren"
2. `notenblaetter_cards_updated.xml` auswählen
3. Access erstellt automatisch Tabellen mit allen Feldern
4. `LastViewed` ist im Format `YYYY-MM-DD HH:MM:SS` (datumkompatibel)

### Workflow mit Access

```
Notentisch (Web)          →  XML exportieren  →  Access importieren
  ↓ Änderungen                                          ↓
  ↓ Neue Timestamps                          Access-Datenbank
  ↓                                                  ↓
  ← XML neu laden          ← Access exportiert   Auswertungen
```

## Technologie

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **PDF-Rendering**: PDF.js
- **Architektur**: Separierte HTML/CSS/JavaScript in `board.html`, `board.js`
- **Launcher**: `Notentisch.bat` (einfach) oder `Notentisch.vbs` (GUI)

## Installation & Start

### Empfohlene Methode (PowerShell-Server)

1. **Doppelklick auf `notentisch_start.vbs`**
   - Startet automatisch den PowerShell-Server auf Port 8080
   - Öffnet Browser mit `http://localhost:8080/board.html`
   - **Vorteil**: Greift auf PDFs außerhalb des Projekt-Ordners zu

### Alternative Methode (Python-Server)

1. **Doppelklick auf `Notentisch.vbs`** (erfordert Python 3.6+)
   - Startet Python-Server auf Port 8000
   - Öffnet Browser mit komplexer URL
   - **Nachteil**: PDFs müssen im OneDrive-Root erreichbar sein

## Workflow: Access → Notentisch → Speichern

┌─────────────────────────────────────────────────────────────┐
│ 1. Microsoft Access                                         │
│    └─ Export Tabelle "NotenTisch" als XML                   │
│       ├─ Notentisch.xml (Kartendaten)                       │
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
│       ├─ Lädt Kartendaten (NotID, ArbeitsStatus, Pfad)      │
│       ├─ Sucht Vorschaubilder in Cards_Export/              │
│       │  (kompensiert Access-Bugs automatisch!)             │
│       └─ Zeigt Cards in 4 Quadranten                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Mit Karten arbeiten                                      │
│    ├─ Drag Card ins Center → PDF lädt automatisch           │
│    │  └─ LastViewed Timestamp wird gesetzt                  │
│    ├─ Drag zwischen Quadranten → Status ändert sich         │
│    └─ Tastatur: ESC/Delete/Pfeile                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Speichern                                                │
│    └─ Click SPEICHERN                                       │
│       └─ Download: Notentisch.xml (mit gleichem Namen)      │
│          ├─ Aktualisierte ArbeitsStatus                     │
│          └─ LastViewed Timestamps                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Zurück zu Access (Optional)                              │
│    └─ Import aktualisierte Notentisch.xml                   │
│       └─ Auswertungen mit LastViewed-Daten                  │
└─────────────────────────────────────────────────────────────┘
**Wichtig**: Access-Export kann Dateinamen-Bugs haben:
- Broken UTF-8: `München` → `MÃ¼nchen`
- Trailing Spaces: `Name.png` → `Name   .png` (1-4 Leerzeichen)
- Das Board kompensiert diese Bugs automatisch!

### 2. XML-Datei laden

1. Click auf **LADEN** Button
2. Wähle `Notentisch.xml`
3. Board lädt:
   - **Kartendaten** aus XML (NotID, ArbeitsStatus, Speicherort)
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

### 3. Mit Karten arbeiten

- **Drag ins Center**: PDF wird automatisch geladen
- **Zwischen Quadranten**: Karten verschieben (Status ändert sich)
- **Timestamp**: Beim Drag ins Center wird `LastViewed` gesetzt

### 4. Speichern

1. Click auf **SPEICHERN** Button
2. Datei wird gespeichert mit dem ursprünglichen Dateinamen (z.B. `Notentisch.xml`)
3. Enthält:
   - Aktualisierte `ArbeitsStatus` (neueIdee/wiederholen/geuebt/gelernt)
   - `LastViewed` Timestamps (Format: `YYYY-MM-DD HH:MM:SS`)
   - Stack-Limit Einstellung

**Tipp**: In den Browser-Einstellungen "Vor jedem Download nach Speicherort fragen" aktivieren, um die Datei direkt zu überschreiben.

### 5. Zurück nach Access (Optional)

**In Microsoft Access:**
```
Import XML-Datei
  ↓
Tabelle wird aktualisiert
  ↓
Auswertungen mit LastViewed-Timestamps
```

## Datei-Übersicht

### Starter-Dateien
- **`notentisch_start.vbs`** - PowerShell-Server Launcher (empfohlen)
- `Notentisch.vbs` - Python-Server Launcher (alternative)
- `Notentisch.bat` - Python-Server CMD Launcher (alternative)
- `start_server.ps1` - PowerShell-Server (wird von notentisch_start.vbs aufgerufen)

### Haupt-Anwendung
- **`board.html`** - HTML-Struktur und Styles
- **`board.js`** - JavaScript-Logik (PDF-Laden, Drag&Drop, XML-Handling)

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

### Für Python-Server (alternative)
- **Windows 7+** oder andere Betriebssysteme
- **Python 3.6+** (muss im PATH sein)
- **Moderner Browser** (Chrome, Firefox, Edge, Safari)

---
*Letztes Update: Februar 2026*
- Automatisches PDF-Laden mit PowerShell-Server
- Robuste Card-Vorschaubilder (Access-Export Bug-Fixes)
- Verzögertes Laden verhindert Server-Overload

