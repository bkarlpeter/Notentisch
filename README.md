# Digital Notentisch

Ein interaktives Kanban-ähnliches System zur Verwaltung von Musiknoten mit Drag-&-Drop-Funktionalität, PDF-Viewer und XML-basierter Datenverwaltung.

## Features

### Kernfunktionalität
- **4-Quadranten System** (Q1-Q4): Organisiere Noten nach Lernstatus
  - Q1: Zurückgestellt (neu)
  - Q2: Wiederholen (auffrischen)
  - Q3: Geübt (trainieren)
  - Q4: Gelernt (beherrscht)

### Visuelle Gestaltung
- **Gestaffelte Kartendarstellung**: Karten sind übereinander angeordnet mit progressivem Offset
- **Hover-Effekte**: 1,25x Vergrößerung, 50px Aufwärtsbewegung, blaues Glühen
- **Responsive Layout**: Karten und Scrollbars auf den Außenseiten sichtbar

### Zwei Layouts
**Layout 2x2 (Standard)**
- 2x2 Grid mit 4 Quadranten
- CENTER-Bereich in der Mitte für PDF-Anzeige (2 Seiten nebeneinander)
- optimiert für große Displays

**Layout 80/20 (Alternative)**
- Linke Seite (80%): PDF-Viewer mit 3 Seiten nebeneinander
- Rechte Seite (20%): 2 stapelbare Quadrant-Paare mit Scroll
- optimiert zur Anzeige mehrerer PDF-Seiten

### Drag & Drop
- **Noten ziehen** in CENTER → PDF öffnet sich automatisch
- **Noten ziehen** in Q-Fensten → Doppelklick speichert Daten
- **Doppelklick** auf Card im CENTER → automatisch zu Q2 verschieben

### Datenmanagement
- **XML Import**: Noten-Daten aus XML-Datei laden
- **PDF-Integration**: Automatische Pfad-Erkennung (Format: `Titel#C:\path\file.pdf`)
- **Datum-Tracking**: "LastViewed" Datum wird automatisch beim Verschieben gespeichert
- **XML Export**: Aktuelle Daten als XML herunterladen

### Navigation
- **↑/↓ Buttons**: PDF-Seiten blättern
- **Layout-Toggle**: Zwischen 2x2 und 80/20 Layout wechseln
- **Stack Limit**: Maximale sichtbare Karten pro Quadrant einstellen

## Installation

1. **Projektstruktur einrichten:**
projekt-notentisch/
├── board_server.html
├── functions.js
├── filehandling.js
├── Blätter/ (PDF-Dateien)
├── Cards_Export/ (Kartenbilder .png)
└── data.xml (Noten-Daten)


2. **Server starten (PowerShell):**
```powershell
python -m http.server 8080
# oder
npx http-server -p 8080

3. im browser öffnen
http://localhost:8080/board_server.html

Bedienung
Noten laden: "LADEN" Button → XML-Datei auswählen
Noten verschieben:
Ziehen in CENTER → PDF öffnet sich
Ziehen in Q-Fenster → Doppelklick speichert
PDF wechsel: ↑/↓ Buttons zum Blättern
Layout wechsel: Button oben rechts (2x2 ⟷ 80/20)
Cart-Limit: "Stack Limit" Feld anpassen
Daten speichern: "SPEICHERN" Button → XML herunterladen

Dateiformat
XML-Struktur
<?xml version="1.0" encoding="UTF-8"?>
<noten>
  <card id="1">
    <titel>Notentitel</titel>
    <speicherort>Notentitel#C:\path\to\file.pdf</speicherort>
    <arbeitsstatus>zurückgestellt</arbeitsstatus>
    <lastplayed>2026-02-14</lastplayed>
  </card>
</noten>

ArbeitsStatus-Werte
    zurückgestellt → Q1
    wiederholen → Q2
    geübt → Q3
    gelernt → Q4
Technologie
    HTML5/CSS3: Responsive Grid & Flexbox Layout
    Vanilla JavaScript: Keine externen Abhängigkeiten für Logik
    PDF.js v3.11.174: PDF-Rendering
    DOM Parser: Native XML-Verarbeitung
Dateiübersicht

Datei	Funktion
board_server.html	UI-Struktur & Styling
functions.js	PDF-Navigation, Layout-Toggle, Card-Interaktion
filehandling.js	XML I/O, Board-Rendering, Datenmanagement