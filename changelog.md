# Changelog - Notentisch

## [Aktuell] - 2024

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
