# Changelog - Notentisch

## [v2026.03.08.2] - 08. März 2026

### Neu
- **CenterAnsicht in XML erweitert**: `Zoom`, `Align`, `ZoomFokus`, `PosRelX`, `PosRelY` werden pro Blatt gespeichert.
- **Access-Import-Flag**: `CenterAnsichtChanged=1` wird bei `Save Zoom` gesetzt.

### Verbessert
- **Config-Roundtrip**: Board-Stacks und Center-Ansicht werden beim Wechsel in die Config als Snapshot gesichert und beim Zurückkehren sofort wiederhergestellt.
- **Standard-Config-Vorschau**: Schnellere Reihenfolge über PNG-Cache → XML/PDF-Ausschnitt → Bild-Fallback.
- **Drop-Verhalten**: Ablage in Quadranten immer als Top-Insert mit konfigurierbarem Glow (`dropGlowDurationMs`).
- **Drop ins Center**: Option `useZoomSettingsOnDrop` steuert die Anwendung blattbezogener Zoomwerte.

### Technisch
- `functions.js`: Session-Restore für Config↔Board um Board- und Center-Snapshot erweitert.
- `filehandling.js`: XML-Lesen/Schreiben für Center-Profil + Changed-Flag ergänzt.
- `config.html`: Vorschaupfad und Caching für schnelleren Wiederaufruf überarbeitet.

## [v2026.03.08] - 08. März 2026

### Neu
- **Center-Ausrichtung umschaltbar**: Button `Links/Rechts` im Board (`alignBtn`) mit persistenter Speicherung.
- **Kontinuierlicher Zoom**: Gedrückt halten auf `ZOOM - / ZOOM +` startet wiederholtes Zoomen.
- **Konfigurierbare Zoom-/Scroll-Schritte**: `zoomStep` und `scrollStep` über Konfiguration und LocalStorage.

### Verbessert
- **Zoom-Verhalten**: Kleinere, feinere Zoomstufen und stabilere Zoom-Grenzen.
- **Zoom-Anker**: Zoom bleibt visuell um den aktuellen Viewport-Mittelpunkt stabil.
- **Kartenrückgabe aus Center**: Beim Zurücklegen nur Layout-Update statt vollständigem Stack-Rebuild.
- **PDF-Pfad-Fallbacks**: Robustere Kandidatenbildung, Encoding und Caching bei Pfadversuchen.
- **Config-Navigation im gleichen Tab**: Rückweg ohne unnötigen neuen Browser-Tab.
- **Config → Board Rückkehr dokumentiert**: README enthält jetzt ein klares Prozedere mit automatischem Smoke-Check und manuellem 4-Schritte-Test.

### Behoben
- **Center wird geleert beim Zurücklegen**: Rückgabe einer Karte aus dem Center leert die Ansicht nicht mehr erzwungen.
- **Leere Card-Vorschauen**: Verbesserte Fallback-Pfadauflösung für PDF-basierte Thumbnails.

### Technisch
- `board.html`: IDs für Zoom-Buttons ergänzt, Script-Versionen angehoben.
- `functions.js`: Config-Defaults erweitert (`centerAlign`, `zoomStep`, `scrollStep`), Continuous-Zoom-Binding ergänzt.
- `filehandling.js`: Rückgabe-Logik aus Center auf Top-Insert + `updateStackLayout()` umgestellt.
- `local_server.py`: No-Cache-Header ergänzt, um veraltete Browser-Caches zu vermeiden.
- `test/e2e_config_return_check.ps1`: Neuer E2E-Smoketest für Config↔Board-Rückkehr.

## [v2.1] - Februar 2026

### Neu 
- **Dynamische Blätter-Steuerung**: Sichtbare Karten pro Quadrant konfigurierbar (`1` bis `10`)
- **Quadranten-Navigation**: `/`-Buttons erscheinen nur bei Karten-Overflow
- **Center-Navigation vereinheitlicht**: `/`-Buttons im selben Look & Feel wie in Quadranten
- **Card-Thumbnail-Fallback**: Wenn `Cards_Export/card_*.png` fehlt, wird Vorschau aus PDF-Seite 1 gerendert

### Verbessert 
- **Stack-Schrittweite**: Blättern in Quadranten nutzt jetzt halbe Stapelgröße (gerundet)
- **PDF-Pfadauflösung**: Robuste Erkennung für gemischte Pfadangaben (`#`-Pattern, Windows/relativ)
- **XML-Kompatibilität**: Karten werden aus `<NotenTisch>` und `<Notentisch>` gelesen
- **README aktualisiert**: Doku auf aktuellen Stand der Bedienung und Dateirollen gebracht

### Behoben 
- **Fehlende Karten**: Tag-Mismatch im XML führte nicht mehr zu ausgelassenen Einträgen
- **PDF erreichbar, aber Card blind**: Fallback-Rendering aus PDF löst fehlende Exportbilder
- **Verschwindende Buttonzeile**: Layout-/Strukturprobleme in `board.html` bereinigt

### Technisch 
- `board.html` aufgeräumt (Inline-Styles in Klassen, `viewport`-Meta ergänzt)
- Control-Bar robuster gemacht (`z-index`, `overflow-x`, `min-height`)
- Nicht benötigte Fullscreen-Button-Logik wieder entfernt (F11-only)

---

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
