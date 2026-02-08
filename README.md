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

## Dateien

- `board.html` - HTML-Struktur und Styles
- `board.js` - Alle JavaScript-Funktionen
- `Notentisch.bat` - Windows Batch Launcher
- `Notentisch.vbs` - Windows VBS Launcher (mit GUI)
- `README.md` - Diese Dokumentation
- `CHANGELOG.md` - Versionshistorie
- `Todo.txt` - Open Tasks & Roadmap

## Installation

1. Alle Dateien in den selben Ordner kopieren
2. **Option A**: `Notentisch.bat` doppelklicken
3. **Option B**: `Notentisch.vbs` doppelklicken
4. Browser öffnet sich automatisch auf `http://localhost:8000`
5. XML-Datei mit Lernkarten laden (Button "LADEN")

## Systemanforderungen

- **Windows 7+** oder andere Betriebssysteme mit Python
- **Python 3.6+** (muss im PATH sein)
- **Moderner Browser** (Chrome, Firefox, Edge, Safari)

---
*Letztes Update: 2024 - Dynamische PDF-Skalierung, Layout-Modi, Timestamp-Tracking*
