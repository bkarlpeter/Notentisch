
## Installation & Schnellstart

👉 Lies die ausführliche Installationsanleitung in [INSTALL.md](INSTALL.md) (inkl. Problemlösung und Setup-Hinweisen).

👉 Für den Access/XML-Austausch siehe [Zusammenarbeit Access-HTML.md](Zusammenarbeit%20Access-HTML.md) (aktueller Stand in der Datei).

---

## Projekt-Funktions-Check (Test der Umgebung)

Um zu prüfen, ob das Projekt in deiner aktuellen Umgebung korrekt funktioniert, kannst du wie folgt vorgehen:

1. Stelle sicher, dass Python 3 installiert ist und der Befehl `python` verfügbar ist.
2. Starte im Projektordner einen lokalen Server:

  ```powershell
  python -m http.server 8000
  ```

3. Öffne im Browser die Seite:

  [http://localhost:8000/board.html](http://localhost:8000/board.html)

4. Überprüfe, ob die Anwendung lädt und die Grundfunktionen (Karten anzeigen, PDF-Ansicht, Drag & Drop) funktionieren.

5. Optional: Führe die Tests im `test/`-Ordner aus, um einzelne Funktionen automatisch zu prüfen:

  ```powershell
  cd test
  node hello.test.js
  ```

Wenn alle Schritte erfolgreich sind, ist das Projekt in deiner Umgebung funktionsfähig. Bei Problemen siehe Abschnitt "PROBLEMLOESUNG" in INSTALL.txt oder im README.
# Digitaler Notentisch

Interaktive Notenverwaltung mit 4 Quadranten, Drag & Drop, PDF-Viewer und XML-Import/Export.

## Aktuelle stabile Version

- **Release-Tag:** `v2026.03.08`
- **Datum:** 08.03.2026
- **Branch:** `main`

Highlights dieser stabilen Version:
- Umschaltbare Center-Ausrichtung (`Links/Mitte/Rechts`) mit persistenter Speicherung
- Feinere Zoomschritte + kontinuierlicher Zoom bei langem Tastendruck
- Zoom-Fokus ist fest auf `links-oben` gesetzt (kein Fokus-Umschalter mehr)
- `Auto Zoom` als Toggle (auto anwenden beim Drop ins Center + auto speichern beim Verlassen)
- 3-stufige Helligkeit fuer die Seitenanzeige (`dunkel|normal|hell`) in Advanced
- `Auto-Fullscreen beim Start` als schaltbare Advanced-Option
- Kein erzwungener Stack-Neuaufbau beim Zurücklegen aus dem Center
- Robustere PDF-Pfad-Fallbacks für Card-Vorschau und Center-Anzeige
- No-Cache-Header im lokalen Server gegen veraltete Browser-Stände

Details siehe [CHANGELOG.md](CHANGELOG.md).

## Funktionen

- 4 Quadranten nach Arbeitsstatus:
  - Q1: zurueckgestellt
  - Q2: wiederholen
  - Q3: geuebt
  - Q4: gelernt
- Kartenstapel pro Quadrant mit einstellbarer Blattzahl (`1` bis `10`)
- Quadranten-`/` zum Blaettern, wenn mehr Karten vorhanden sind als sichtbar
- CENTER-Bereich zeigt PDF (2 Seiten), inkl. `/`-Scroll und Zoom
- Drag & Drop zwischen Quadranten und CENTER
- Doppelklick im CENTER verschiebt die aktive Karte nach Q3 (weitere siehe use case)
- XML laden/speichern im Browser
- PDF-Pfad-Fallbacks fuer gemischte Pfadangaben (inkl. Windows-Pfade mit `#`-Trenner)
- Kartenbild-Fallback: wenn kein `Cards_Export/card_*.png` existiert, wird ein Thumbnail aus Seite 1 der PDF erzeugt

## Start auf einem anderen Windows-System
 so gehts: .\setup_notentisch.ps1

  Das Skript erledigt für dich:

  Prüfung auf Python 3 und Poppler (pdfimages.exe)
  Anlage des „Blätter“-Ordners bzw. Erstellen einer Junction zu deinen PDFs
  Anlage des „Cards_Export“-Ordners
  Prüfung, ob der Standard-Port 8000 frei ist (ggf. Alternativport)
  Start des lokalen Servers und Öffnen der App im Browser (optional)
  Du kannst das Skript jederzeit erneut ausführen, falls du die Ordnerstruktur oder Verknüpfungen anpassen möchtest.
  
### Voraussetzungen

- Windows 10/11
- Python 3 (mit aktivierter Option **"Add Python to PATH"**)
- Browser: Edge, Chrome oder Firefox

### 1) Projekt kopieren

Ganzes Repository auf den Zielrechner kopieren (inkl. `Cards_Export/`, `Blaetter/`, `Noten/`, `myMusic/`, `poppler-25.12.0/` falls vorhanden).

### 2) `Blaetter`-Ordner pruefen

Die App sucht PDFs bevorzugt unter `Blaetter/`.

- Wenn `Blaetter/` bereits ein echter Ordner mit PDFs ist: nichts tun.
- Wenn `Blaetter/` eine Junction/Symlink war und auf dem neuen Rechner leer/ungueltig ist:

```powershell
cmd /c mklink /J "Blätter" "D:\Pfad\zu\deinen\PDFs"
```

### 3) App starten

- Doppelklick auf `Notentisch.bat`
- Hinweis: `Notentisch.bat` setzt fuer die laufende Session Bildschirm-Timeout und Standby auf `Nie` (AC/DC) und stellt die vorherigen Werte beim Server-Ende automatisch wieder her.
- oder im Projektordner:

```powershell
python -m http.server 8000
```

Browser-URL:

- `http://localhost:8000/board.html`

## Card-Bilder generieren

Mit `extract_cards.ps1` koennen Card-Vorschaubilder aus PDFs erzeugt werden:

```powershell
.\extract_cards.ps1
```

Das Skript nutzt automatisch:

1. die lokale Poppler-Version in `poppler-25.12.0/Library/bin/pdfimages.exe` (falls vorhanden),
2. sonst `pdfimages.exe` aus dem `PATH`.

## Bedienung

- `LADEN`: XML auswaehlen
- `SPEICHERN`: XML-Datei im gewaehlten Zielordner speichern (Datei wird ueberschrieben)
- `ZOOM - / ZOOM +`: PDF im CENTER zoomen in konfigurierbaren Schritten (`zoomStep`)
- `ZOOM - / ZOOM +` gedrueckt halten: kontinuierlicher Zoom (steuerbar ueber `centerZoomHoldEnabled`, `centerZoomHoldDelayMs`, `centerZoomHoldIntervalMs`)
- Zoom-Grenzen: werden ueber `centerMinZoom` und `centerMaxZoom` begrenzt
- Zoom-Render-Verzoegerung: ueber `centerZoomDebounceMs`
- `Breite`: skaliert so, dass sichtbare Seiten in die aktuelle CENTER-Breite passen (inkl. `centerCanvasExtraWidth`, `centerFitMonitorPages`)
- `Höhe`: setzt den Zoom auf den konfigurierten Startwert (`centerDefaultZoom`)
- `WIDE / NORMAL`: vergroessert CENTER nach links; rechter Rand bleibt fix
- CENTER-Ausrichtung: `Links/Mitte/Rechts` per Button, persistent ueber `centerAlign`
- CENTER-Scroll: Schrittweite ueber `scrollStep`, Scroll-Verhalten ueber `centerSmoothScroll`
- `Auto Zoom`: Toggle fuer blattbezogene Center-Werte (blau = aus, gruen = aktiv)
  - aktiv: Beim Drop ins CENTER werden gespeicherte `CenterAnsicht`-Werte angewendet
  - aktiv: Beim Verlassen des CENTER (Drop/Klick nach Q1-Q4) werden aktuelle Center-Werte automatisch in XML gespeichert
  - aus: Keine automatische Anwendung und keine automatische Speicherung von `CenterAnsicht`
- Config-Vorschau: nutzt zuerst lokalen PNG-Cache, dann XML/PDF-Fund (Ausschnitt) und sonst Bild-Fallback
- `Blaetter`: sichtbare Karten pro Quadrant einstellen (max. 10)
- `Ende`: beendet den lokalen Server und schliesst die Ansicht
- Quadranten-`/`: im jeweiligen Stapel blaettern
- Karte ins CENTER ziehen: PDF anzeigen
- Karte aus CENTER in Quadrant verschieben (Drop oder Klick auf Q1-Q4): `Arbeitsstatus` aktualisieren
- Beim Ablegen in einen Quadranten landet das Blatt immer oben im Stapel (Top-Insert) und der Kartenrahmen glüht kurz nach
- Rücksprung von Config ins Board: Stapel + Center werden aus Session-Snapshot direkt wiederhergestellt
- Modus `Spielen`: beim Ablegen wird `zuletztgespielt` gesetzt
- Modus `Sichten`: beim Ablegen wird kein `zuletztgespielt` gesetzt
- Beim Ablegen auf `Q1` bis `Q4` wird die XML automatisch gespeichert

### Center-/Zoom-Parameter (Basis fuer weitere Aenderungen)

- Die zentralen Defaults und Grenzen liegen in `center-config.js`.
- Persistiert wird in `localStorage` unter `notentischUserConfig`.
- Bearbeitung erfolgt in `config.html` (inkl. Advanced-Felder fuer Center/Zoom).
- Laufzeitnutzung erfolgt in `center-view.js` und `functions.js`.
- `useZoomSettingsOnDrop` (bool): XML-`CenterAnsicht` beim Drop ins CENTER anwenden (`true`/`false`, Default `true`).
- `dropGlowDurationMs` (integer): Dauer des Nachglüh-Rahmens nach Ablage in Quadrant (Millisekunden, Default `1400`).
- `pageInfoTone` (`dunkel|normal|hell`): Helligkeitsstufe fuer die Seitenanzeige in der Leiste (Advanced).
- `autoFullscreenOnStart` (bool): Fordert beim Start automatisch Vollbild an (Advanced, Default `true`).
- `centerZoomFocus`: ist systemseitig fest auf `left-top` normalisiert (kein Umschalter in Advanced).

### CenterAnsicht je Blatt (XML)

- `Auto Zoom` (wenn aktiv) schreibt pro Blatt in `<CenterAnsicht>` beim Verlassen des CENTER:
  - `<Zoom>` (decimal)
  - `<Align>` (`left|middle|right`)
  - `<ZoomFokus>` (`left-top`, fest)
  - `<PosRelX>` (decimal 0..1)
  - `<PosRelY>` (decimal 0..1)
- Zusätzlich wird `<CenterAnsichtChanged>1</CenterAnsichtChanged>` gesetzt für Access-Übernahmefilter.

### Speichern

- Aenderungen an `Arbeitsstatus` und (im Modus `Spielen`) `zuletztgespielt` werden beim Ablegen einer Karte auf `Q1` bis `Q4` automatisch in die XML-Datei geschrieben.
- Beim ersten Schreibzugriff waehlt der User die XML-Datei; danach wird der gespeicherte Datei-Handle wiederverwendet.

## Use Case

1. Start: User laedt die XML mit Noten-Metadaten (`LADEN`). Dabei wird der Speicherort der Exportdatei gefragt, die zuvor mit MS access erstelt wurde.
2. User schaut sich Blaetter an, indem Karten ins CENTER gezogen werden
3. Karte wird aus dem CENTER auf einen Quadranten abgelegt
4. Dabei wird:
  - der neue **Arbeitsstatus** im XML aktualisiert
  - im Modus **Spielen** automatisch `zuletztgespielt` gesetzt
  - im Modus **Sichten** kein `zuletztgespielt` gesetzt
  - die XML-Datei automatisch gespeichert
5. Abschluss: Weitere Karten koennen direkt weiter einsortiert werden; jede Ablage auf `Q1` bis `Q4` wird sofort gespeichert

zu 2: beim Ansehen weiterer Blätter wird das aktuelle dorthin zurückgeschoben wo es her kam

## Dateiformat (XML)
Eine XML Datei muss vorliegen, die z.B mit Access exportiert wurde und einen Satz an Notenblättern enthält.

Erwartete Haupteintraege:
- `<NotenTisch>` (unterstuetzt zusaetzlich `<Notentisch>`)
- Unterfelder je Eintrag:
  - `<Titel>`
  - `<Speicherort>`
  - `<Arbeitsstatus>`
  - `<zuletztgespielt>` (optional, wird bei Bedarf erstellt)
  - `<CenterAnsicht>` (optional mit `<Zoom>`, `<Align>`, `<ZoomFokus=left-top>`, `<PosRelX>`, `<PosRelY>`)
  - `<CenterAnsichtChanged>` (optional, `1` = geänderte Center-Werte für Access-Übernahme)

Status-Mapping der Quadranten:
die Blätter werden auf vier Felder rund um das Center verteilt ("Quadranten") enstpr. Status:
- `zurueckgestellt` -> Q1
- `wiederholen` -> Q2
- `geuebt` -> Q3
- `gelernt` -> Q4

## Projektdateien

- `board.html` - UI, Layout, Styles
- `functions.js` - PDF-Anzeige, Zoom, Seiten-/Scroll-Navigation, Pfadaufloesung
- `filehandling.js` - XML I/O, Karten-Rendering, Drag & Drop, Statusspeicherung
- `extract_cards.ps1` - Card-Bilder aus PDFs generieren (Poppler)
- `Notentisch.bat` - Batch-Launcher fuer Windows (startet `local_server.py` + Browser; setzt waehrend der Session Energiespar-Timeouts auf `Nie` und restauriert danach)
- `notentisch.vbs` - VB-Wrapper fuer unsichtbaren Start
- `local_server.py` - lokaler HTTP-Server mit Shutdown-Endpoint (`/__shutdown__`)
- `Cards_Export/` - Ordner fuer statische Card-Bilder (`card_*.png`)

## Test-Ordner

- `test/` enthält automatisierte Tests für das Projekt (z.B. mit Mocha/Node.js).
- Beispiel: `hello.test.js` prüft einfache Funktionen mit `assert`.
- E2E-Smoketest für Config/Board-Rückkehr: `e2e_config_return_check.ps1`
- Zum Ausführen der Tests im Projektordner:

```powershell
cd test
node hello.test.js
```

### Config ↔ Board Rückkehr testen

Automatischer Smoke-Check:

```powershell
./test/e2e_config_return_check.ps1
```

Der Check prüft:
- Erreichbarkeit von `board.html`, `config.html`, `advanced_config.html` (HTTP 200)
- Vorhandene Restore-Hooks in `functions.js` und `center-view.js`
- Vorhandene Navigationselemente in `config.html`

Manueller Kurztest (4 Schritte):
1. `board.html` öffnen und ein Blatt ins CENTER ziehen.
2. Zoom/Ausrichtung ändern (z.B. Mitte + Zoom +).
3. Config über `C` öffnen, dann `Zurück zum Board`.
4. Prüfen: gleiches Blatt, gleicher Zoom, gleiche Ausrichtung, gleicher CENTER-Modus.

Du kannst eigene Tests ergänzen, um Funktionen und Module automatisch zu überprüfen. Für größere Test-Suiten empfiehlt sich ein Framework wie Mocha oder Jest.