# Changelog - Notentisch

## [v2.0] - Februar 2026

### Neu ✨
- **PowerShell-Server Support**: `notentisch_start.vbs` für automatisches PDF-Laden
- **Robuste Card-Vorschaubilder**: Automatische Kompensation von Access-Export Bugs
  - Broken UTF-8 Encoding (`München` → `MÃ¼nchen`)
  - Trailing Spaces (1-4 Leerzeichen am Ende)
  - Normalisierte Umlaute (`ae/oe/ue` Varianten)
- **Verzögertes Laden**: 50ms Abstand zwischen Card-Bildern (verhindert Server-Overload)
- **Timeout-Schutz**: 3 Sekunden Timeout bei ERR_EMPTY_RESPONSE
- **XML-Element-Support**: Funktioniert mit `<Notentisch>` und `<NotenTisch>` Elementen

### Verbessert 🔧
- **PDF-Pfad-Konvertierung**: Intelligente Erkennung von absoluten und relativen Pfaden
- **Access-Integration**: Dokumentierter Workflow Access → Export → Notentisch → Save
- **Starter-Dateien**: Klar dokumentiert (PowerShell vs. Python)
- **README**: Komplette Dokumentation des Workflows und der Dateistruktur

### Behoben 🐛
- **XML-Laden blockiert**: Syntaxfehler in `renderBoard()` behoben (fehlende `const`)
- **PDF-Laden fehlgeschlagen**: Pfad-Konvertierung für PowerShell-Server korrigiert
- **Card-Bilder fehlen**: Robuste Suche findet Dateien trotz Access-Export Bugs
- **Speichern fehlerhaft**: `saveXml()` findet jetzt beide XML-Element-Typen

### Technisch 🔨
- Pfad-Normalisierung für Windows-Pfade (`\` → `/`)
- URL-Encoding für Umlaute und Sonderzeichen
- Fallback-Mechanismus mit mehreren Dateinamen-Varianten
- `.gitignore` erweitert (tmpclaude-*, lokale Datendateien)

---

## [v1.5] - 2024

### Neu ✨
- **Dynamische PDF-Skalierung**: Bilder nutzen volle Höhe, automatische Breitenanpassung
- **Layout-Umschalter**: 2x2 ↔ 80/20 (Center vs. Sidebar-Modus)
- **Flexible Seiten-Ansicht**: 2 oder 3 PDF-Seiten nebeneinander
- **Adaptive Skalierung**: 3 Seiten automatisch kleiner, 2 Seiten größer
- **Sidebar mit Scrollbar**: Im 80/20 Layout für bessere Übersicht
- **JavaScript-Refactoring**: Code ausgelagert in separate `board.js`

### Verbessert 🔧
- Center-Hole bleibt immer sichtbar (keine Überschneidung mit Kommandozeile)
- Cards an äußeren Rändern (Q1/Q3 links, Q2/Q4 rechts)
- PDF-Seite-Navigation mit ◄ ► Buttons
- Effizientere Event-Listener-Verwaltung

### Behoben 🐛
- PDF-Bilder werden nicht mehr abgeschnitten
- Layout-Button wechselt korrekt zwischen Modi
- Quadranten-Titel korrekt positioniert (links/rechts)

### Technisch 🔨
- Saubere Trennung: HTML/CSS/JavaScript
- Automatische Berechnung: Container-Höhe und -Breite
- Aspect-Ratio Berechnung für PDF-Seiten
- Keine redundanten Funktionen mehr

---

## [v1.0] - Vorherig
- Basis-Funktionalität: 2x2 Grid Layout
- XML-Import/Export
- Drag & Drop zwischen Quadranten
- Stack-Effekt mit festen Werten
