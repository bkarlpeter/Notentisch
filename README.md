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

### XML-Verwaltung
- **Laden**: XML-Dateien mit Lernkarten importieren
- **Speichern**: Aktuelle Anordnung als XML exportieren
- **Auto-Limit**: Gespeicherte Stack-Limits werden wiederhergestellt

## Bedienung

### Buttons
- **LADEN**: XML-Datei auswählen
- **SPEICHERN**: Aktuelle Anordnung speichern
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
1. Card auf Center ziehen → PDF wird geladen
2. Card auf Quadrant ziehen → zwischen Quadranten verschieben

## Technologie

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **PDF-Rendering**: PDF.js
- **Architektur**: Separierte HTML/CSS/JavaScript in `board.html`, `board.css`, `board.js`

## Dateien

- `board.html` - HTML-Struktur und Styles
- `board.js` - Alle JavaScript-Funktionen
- `README.md` - Diese Dokumentation

## Installation

1. Alle Dateien in den selben Ordner kopieren
2. `board.html` im Browser öffnen
3. XML-Datei mit Lernkarten laden (Button "LADEN")

---
*Letztes Update: 2024 - Dynamische PDF-Skalierung & Layout-Modi*
