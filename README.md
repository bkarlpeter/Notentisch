
## Installation & Schnellstart

👉 Lies die ausführliche Installationsanleitung in [INSTALL.md](INSTALL.md) (inkl. Problemlösung und Setup-Hinweisen).

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
- `ZOOM - / ZOOM +`: PDF im CENTER zoomen (stufenweise)
- `Breite`: skaliert so, dass alle sichtbaren Seiten in die aktuelle CENTER-Breite passen
- `Höhe`: setzt die Seitenhoehe passend zur CENTER-Hoehe
- `WIDE / NORMAL`: vergroessert CENTER nach links; rechter Rand bleibt fix
- `Blaetter`: sichtbare Karten pro Quadrant einstellen (max. 10)
- `Ende`: beendet den lokalen Server und schliesst die Ansicht
- Quadranten-`/`: im jeweiligen Stapel blaettern
- Karte ins CENTER ziehen: PDF anzeigen
- Karte aus CENTER in Quadrant verschieben (Drop oder Klick auf Q1-Q4): `Arbeitsstatus` aktualisieren
- Modus `Spielen`: beim Ablegen wird `zuletztgespielt` gesetzt
- Modus `Sichten`: beim Ablegen wird kein `zuletztgespielt` gesetzt
- Beim Ablegen auf `Q1` bis `Q4` wird die XML automatisch gespeichert

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

Status-Mapping der Quadranten:
die blötter werden auf vier Felder rund um das Center verteilt ("Quadranten") enstpr. Status:
- `zurueckgestellt` -> Q1
- `wiederholen` -> Q2
- `geuebt` -> Q3
- `gelernt` -> Q4

## Projektdateien

- `board.html` - UI, Layout, Styles
- `functions.js` - PDF-Anzeige, Zoom, Seiten-/Scroll-Navigation, Pfadaufloesung
- `filehandling.js` - XML I/O, Karten-Rendering, Drag & Drop, Statusspeicherung
- `extract_cards.ps1` - Card-Bilder aus PDFs generieren (Poppler)
- `Notentisch.bat` - Batch-Launcher fuer Windows (startet `local_server.py` + Browser)
- `notentisch.vbs` - VB-Wrapper fuer unsichtbaren Start
- `local_server.py` - lokaler HTTP-Server mit Shutdown-Endpoint (`/__shutdown__`)
- `Cards_Export/` - Ordner fuer statische Card-Bilder (`card_*.png`)

## Test-Ordner

- `test/` enthält automatisierte Tests für das Projekt (z.B. mit Mocha/Node.js).
- Beispiel: `hello.test.js` prüft einfache Funktionen mit `assert`.
- Zum Ausführen der Tests im Projektordner:

```powershell
cd test
node hello.test.js
```

Du kannst eigene Tests ergänzen, um Funktionen und Module automatisch zu überprüfen. Für größere Test-Suiten empfiehlt sich ein Framework wie Mocha oder Jest.