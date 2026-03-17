
## Installation & Schnellstart

👉 Lies die ausführliche Installationsanleitung in [INSTALL.md](INSTALL.md) (inkl. Problemlösung und Setup-Hinweisen).

👉 Für den Access/XML-Austausch siehe [Zusammenarbeit Access-HTML.md](Zusammenarbeit%20Access-HTML.md) (aktueller Stand in der Datei).

## Inhaltsverzeichnis

- [Projekt-Funktions-Check (Test der Umgebung)](#projekt-funktions-check-test-der-umgebung)
- [Digitaler Notentisch](#digitaler-notentisch)
- [Aktuelle stabile Version](#aktuelle-stabile-version)
- [Sicherheitscheck (Stand: 16.03.2026)](#sicherheitscheck-stand-16032026)
- [Funktionen](#funktionen)
- [Start auf einem anderen Windows-System](#start-auf-einem-anderen-windows-system)
- [XML aus PDF-Verzeichnis erstellen oder ergänzen](#xml-aus-pdf-verzeichnis-erstellen-oder-ergänzen)
- [Card-Bilder generieren](#card-bilder-generieren)
- [Bedienung](#bedienung)
- [Audio Auto (Mikrofon)](#audio-auto-mikrofon)
- [Audio Auto Troubleshooting](#audio-auto-troubleshooting)
- [Center-/Zoom-Parameter (Basis fuer weitere Aenderungen)](#center-zoom-parameter-basis-fuer-weitere-aenderungen)
- [CenterAnsicht je Blatt (XML)](#centeransicht-je-blatt-xml)
- [Speichern](#speichern)
- [Verzeichnisse (Ton/XML)](#verzeichnisse-tonxml)
- [Use Cases](#use-cases)
- [Dateiformat (XML)](#dateiformat-xml)
- [Projektdateien](#projektdateien)
- [Test-Ordner](#test-ordner)

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

## Sicherheitscheck (Stand: 16.03.2026)

Diese Zusammenfassung dokumentiert den durchgefuehrten Sicherheitscheck inkl. technischer Ablauftests, Ergebnisse und bereits umgesetzter Gegenmassnahmen.

### Gepruefte Risiken

- Fehlfunktion/Verfuegbarkeit: Unbeabsichtigtes Stoppen des lokalen Servers ueber den Shutdown-Endpoint.
- Systemeingriffe: Setup mit Adminrechten, Ausfuehrungspolicy und automatischem Installer-Download.
- Integritaet von Setup-Downloads: Risiko durch manipulierten oder falsch signierten Installer.

### Ablauftests

- Shutdown-Test ohne Token: `POST /__shutdown__` ohne Auth-Header muss blockiert werden.
- Shutdown-Test mit gueltigem Session-Token: `POST /__shutdown__` mit Header `X-Notentisch-Token` muss funktionieren.
- Syntax-/Laufzeitcheck nach Anpassungen fuer `local_server.py` sowie der neuen Setup-Sicherheitslogik.

### Testergebnisse

- Ohne Token wird der Shutdown korrekt mit HTTP `403` abgelehnt.
- Mit gueltigem Token wird der Shutdown korrekt mit HTTP `200` akzeptiert.
- Der lokale Server bleibt auf `127.0.0.1` gebunden (kein externer Netz-Zugriff auf den Endpoint).

### Umgesetzte Sicherheitsmassnahmen

- **Token-gesicherter Shutdown-Flow**:
  - Neuer Session-Endpoint `/__session__` liefert ein pro Serverstart neu erzeugtes Token.
  - `/__shutdown__` akzeptiert nur noch `POST` mit `X-Notentisch-Token` und Body `shutdown`.
  - `GET /__shutdown__` ist deaktiviert (`405 Method Not Allowed`).
- **Timing-sicherer Tokenvergleich** auf Serverseite, um triviale Vergleichsangriffe zu reduzieren.
- **Setup-Haertung fuer Python-Download**:
  - Signaturpruefung (Authenticode) vor Ausfuehrung des Installers.
  - Erwarteter Signierer: *Python Software Foundation*.
  - Optional vorbereiteter SHA256-Vergleich (bei fest hinterlegtem Hash).
- **Reduzierter Policy-Eingriff im Setup**:
  - Entfernt: zusaetzliches `Set-ExecutionPolicy` im Skriptlauf.
  - Begruendung: Das Setup wird bereits explizit mit `-ExecutionPolicy Bypass` gestartet.

### Restrisiken / Hinweise

- CDN-Einbindung von PDF.js bleibt ein Supply-Chain-Risiko (bei kompromittiertem externen CDN).
- Admin-Setup bleibt ein bewusstes Betriebsmodell; daher Setup-Skripte nur aus vertrauenswuerdiger Quelle ausfuehren.
- Energieprofil-Aenderungen durch `Notentisch.bat` koennen bei hartem Abbruch temporär bestehen bleiben, bis erneut sauber beendet oder manuell zurueckgesetzt wird.

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
- **Blatt suchen** (`Suchen`-Button): Suchoverlay mit Texteingabe, zeigt Treffer mit Stapelzuordnung; Bestätigung per `Fertig` lädt das Blatt direkt in den CENTER

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

## XML aus PDF-Verzeichnis erstellen oder ergänzen

Neue PDFs können automatisch als Einträge in die XML übernommen werden – entweder direkt im Browser beim Laden oder offline per PowerShell-Skript.

### Variante 1 – Direkt im Browser (beim Laden ohne XML)

Wenn beim Klick auf `LADEN` kein XML ausgewählt wird (Abbruch im Dateipicker), erscheint ein Dialog:

> *„Kein XML gewählt. Soll eine neue XML aus einem PDF-Ordner erstellt werden?"*

- **Ja** → Ordner-Picker öffnet sich → alle PDFs im Ordner werden als neue Einträge angelegt (Arbeitsstatus `zurückgestellt`, kein Datum) → Board wird angezeigt → XML als ungespeichert markiert (normaler Speichern-Flow)
- **Nein** → nichts passiert

Wenn ein XML geladen wird, erscheint der Dialog **nicht**.

### Variante 2 – PowerShell-Skript `create_xml_from_pdfs.ps1`

Für neue Installationen ohne bestehende XML oder für Batch-Nutzung:

```powershell
# Frische XML aus Ordner erstellen:
.\create_xml_from_pdfs.ps1 -PdfDir "C:\...\Noten\Blätter" -OutputXml "Notentisch-Neu.xml"

# Bestehende XML um fehlende PDFs ergänzen (Merge):
.\create_xml_from_pdfs.ps1 -PdfDir "C:\...\Noten\Blätter" -OutputXml "Notentisch.xml" -Merge

# Abweichender Standard-Status (Default: "zurückgestellt"):
.\create_xml_from_pdfs.ps1 -PdfDir "C:\...\Noten\Blätter" -OutputXml "Notentisch.xml" -Merge -Arbeitsstatus "wiederholen"
```

Parameter:

| Parameter | Pflicht | Beschreibung |
|---|---|---|
| `-PdfDir` | ja | Verzeichnis mit den PDF-Dateien |
| `-OutputXml` | ja | Pfad der zu erzeugenden bzw. zu ergänzenden XML |
| `-Merge` | nein | Bestehende XML ergänzen statt neu erstellen |
| `-Arbeitsstatus` | nein | Startstatus neuer Einträge (Default: `zurückgestellt`) |

---

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
- `Auto Zoom`: Toggle fuer blattbezogene Center-Werte (blau = aus, gruen = aktiv); **Zustand wird persistent gespeichert** und beim nächsten Start wiederhergestellt
  - aktiv: Beim Drop ins CENTER werden gespeicherte `CenterAnsicht`-Werte angewendet
  - aktiv: Beim Verlassen des CENTER (Drop/Klick nach Q1-Q4) werden aktuelle Center-Werte automatisch in XML gespeichert
  - aus: Keine automatische Anwendung und keine automatische Speicherung von `CenterAnsicht`
- `Textsuche`: öffnet ein Suchoverlay zur Volltextsuche über alle Blatttitel
  - Treffer zeigen Titel und Stapelzuordnung
  - Treffer anklicken → Bestätigungsmeldung erscheint
  - `Fertig` → Blatt wird in den CENTER geladen (wie Drag & Drop)
  - `Abbrechen` / Escape → Overlay schließt sich ohne Aktion
- `Tonsuche`: Mikrofon-gestützte Automatik für Suche und Aufnahme
  - Klick 1: `Ton An` → nur hören/suchen; Button ist grün
  - Klick 2: `Ton Rec` → Aufnahme-Modus; Button ist orange
  - Klick 3 (aus `Ton Rec`): zurück zu `Ton An` (Tonhören, nicht aus!)
  - Klick 4 (aus `Ton An`): aus
  - weißer Rahmen am Tonsuche-Button: während `Ton Rec` wird gerade musikalisches Signal aufgenommen
  - im Aufnahme-Modus mit Blatt im CENTER: kurze Referenzaufnahme wird automatisch beendet, sobald genug Material für `AudioReferenz` gesammelt wurde
  - optional in `Advanced`: alte Sequenz pro Titel löschen (`Löschen`) oder Historie behalten (`Beibehalten`)
  - `Loeschen` löscht/verwirft eine laufende Aufnahme; nach automatischem Stopp wird derselbe Button zu `Nochmal` für sofortige Neuaufnahme derselben Center-Karte
  - ohne Blatt im CENTER: Live-Matching gegen gespeicherte Audio-Fingerprints; bei stabilem Treffer wird das Blatt automatisch ins CENTER geladen
- Karten mit vorhandener Audio-Referenz zeigen optional einen gelben Marker oben rechts (Config: `Spielton-Marker`)
- Config-Vorschau: nutzt zuerst lokalen PNG-Cache, dann XML/PDF-Fund (Ausschnitt) und sonst Bild-Fallback
- `Blaetter`: sichtbare Karten pro Quadrant einstellen (max. 10)
- `Stapel-Überlappung je Batch` (Advanced): bestimmt die Überlappung beim Blaettern im Quadrantenstapel
- Quadranten-`/`: Schrittweite = `Stapelgröße - Stapel-Überlappung` (mindestens `1`)
- `Ende`: beendet den lokalen Server und schliesst die Ansicht
- Karte ins CENTER ziehen: PDF anzeigen
- Karte aus CENTER in Quadrant verschieben (Drop oder Klick auf Q1-Q4): `Arbeitsstatus` aktualisieren
- Beim Ablegen in einen Quadranten landet das Blatt immer oben im Stapel (Top-Insert) und der Kartenrahmen glüht kurz nach
- Rücksprung von Config ins Board: Stapel + Center werden aus Session-Snapshot direkt wiederhergestellt
- Modus `Spielen`: beim Ablegen wird `zuletztgespielt` gesetzt
- Modus `Sichten`: beim Ablegen wird kein `zuletztgespielt` gesetzt
- Beim Ablegen auf `Q1` bis `Q4` wird die XML automatisch gespeichert

## Audio Auto (Mikrofon)

Die Funktion ist für lokales Arbeiten gedacht: Audio wird nur über den lokalen Server (`127.0.0.1`) in den Projektordner `mysounds/` geschrieben.

### Voraussetzungen

- Browser mit `MediaRecorder` + Mikrofonfreigabe (Edge/Chrome/Firefox aktuell)
- laufender lokaler Server (`local_server.py`)
- geladene XML

### Manueller Kurztest (ca. 2 Minuten)

1. `board.html` öffnen und XML laden.
2. Einen Titel in den CENTER ziehen.
3. `Tonsuche` auf `Ton Rec` schalten und Mikrofon erlauben.
4. 3-5 Sekunden das Referenzmotiv spielen/summen, bis die Aufnahme automatisch stoppt.
5. `Tonsuche` auf `Ton An` schalten und in ruhiger Umgebung erneut das Motiv spielen/summen.
6. Erwartung: Nach kurzer stabiler Erkennung wird das passende Blatt automatisch in den CENTER gezogen.

### Ablauf Tonsequenz (Ton Rec)

1. Karte in den CENTER ziehen.
2. `Tonsuche` auf `Ton Rec` schalten:
  - Button wird orange.
  - Zusatzbutton `Loeschen` erscheint.
3. Sequenz spielen:
  - während verwertbares Musiksignal erkannt wird, zeigt `Ton Rec` einen weißen Rahmen.
  - sobald genug Material gesammelt wurde, stoppt die Aufnahme automatisch und der weiße Rahmen verschwindet.
4. Danach gibt es vier typische Wege:
  - a) User spielt weiter: es wird nicht weiter aufgenommen, bis bewusst neu gestartet wird.
  - b) User stoppt/spielt nicht weiter und drückt `Nochmal`: sofortige Neuaufnahme derselben CENTER-Karte, Ablauf startet wieder bei Schritt 3.
  - c) User drückt den orangefarbenen `Ton Rec`-Button erneut: wechselt zu `Ton An` (Tonhören-Modus, grün). Ein weiterer Druck schaltet die Audio-Automatik vollständig aus.
  - d) User entfernt das Blatt aus dem CENTER: Aufnahme wird finalisiert, App wartet auf die nächste Karte (kein Suchbetrieb). Sobald eine neue Karte in den CENTER gezogen wird, startet die Aufnahme sofort → Ablauf ab Schritt 3.

### Was gespeichert wird (XML)

Im jeweiligen `<NotenTisch>`-Eintrag wird ein optionaler Block ergänzt:

```xml
<AudioReferenz>
  <Datei>mysounds/sound_....webm</Datei>
  <MimeType>audio/webm;codecs=opus</MimeType>
  <Fingerprint>0.12,0.34,...</Fingerprint>
  <ErfasstAm>2026-03-17T12:00:00.000Z</ErfasstAm>
</AudioReferenz>
```

### Technische Grenzen / Hinweise

- Fingerprint ist ein einfacher Frequenzband-Vergleich, kein robustes Audio-ML-Modell.
- Ähnliche Motive, starkes Rauschen oder andere Lautstärke können Fehl- oder Nichttreffer verursachen.
- Nur Modus `Ton Rec` überschreibt bzw. erzeugt Referenzaufnahmen; `Ton An` sucht nur.
- Im Modus `Ton Rec` stoppt die Aufnahme automatisch nach genug erkanntem Musiksignal; die Dauer ist in `Advanced` einstellbar.
- `Advanced > Alte Sequenz bei Neuaufnahme`: `Löschen` hält pro Titel nur eine aktuelle Sequenz (alte Datei + alte XML-Referenzen werden entfernt), `Beibehalten` speichert zusätzliche Sequenzen.
- Das Matching startet nur, wenn kein PDF im CENTER offen ist.
- Upload-Härtung im Server: nur Audio-Endungen (`.webm`, `.ogg`, `.wav`, `.m4a`, `.mp3`), Dateigröße max. 25 MB.

## Audio Auto Troubleshooting

- Problem: Mikrofon wird nicht abgefragt.
  - Lösung: Browser-Berechtigung für Mikrofon prüfen (Website-Einstellungen), Seite neu laden, `Tonsuche` erneut aktivieren.
- Problem: Keine Erkennung in `Ton An`.
  - Lösung: Zuerst mit `Ton Rec` eine Referenz im CENTER aufnehmen (3-5 Sekunden), dann außerhalb des CENTER in `Ton An` testen.
- Problem: Falsches Blatt wird erkannt.
  - Lösung: Referenz in ruhiger Umgebung neu aufnehmen, näher am Mikrofon spielen/summen, ähnliche Titel separat neu referenzieren.
- Problem: Audio kann nicht gespeichert werden.
  - Lösung: Prüfen, ob `local_server.py` läuft und der Ordner `mysounds/` beschreibbar ist.

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
- `stackBatchOverlapCount` (integer): Überlappung zwischen zwei Stapel-Batches in den Quadranten (`0..9`, Default `2`).
- `audioReferenceTargetMs` (integer): Ziel-Dauer der Audio-Referenzaufnahme in Millisekunden (`1500..12000`, Default `5000`).
- `replaceAudioByTitle` (bool): Verhalten bei Neuaufnahme pro Titel (`true` = alte Sequenz löschen, `false` = alte Sequenz beibehalten).
- `showAudioBadge` (bool): Zeigt/versteckt den gelben Spielton-Marker auf Karten mit Audio-Referenz.

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

### Verzeichnisse (Ton/XML)

- Tonaufnahmen: werden lokal im Projektordner unter `mysounds/` gespeichert.
- XML-Datei: wird beim Laden zuerst per Dateiauswahl (`LADEN`) abgefragt.
- XML-Speicherziel: wird beim ersten Schreibzugriff zuvor abgefragt; danach wird der Datei-/Ordner-Handle wiederverwendet.
- PDF-Import ohne XML: der PDF-Quellordner wird zuvor per Ordnerauswahl abgefragt.

## Use Cases

### Usecase 1: User will Noten auf den Tisch legen

1. Start: User laedt die XML mit Noten-Metadaten (`LADEN`). Dabei wird der Speicherort der Exportdatei gefragt, die zuvor mit MS Access erstellt wurde.
2. User schaut sich Blaetter an, indem Karten ins CENTER gezogen werden.
3. Karte wird aus dem CENTER auf einen Quadranten abgelegt.
4. Dabei wird:
  - der neue **Arbeitsstatus** im XML aktualisiert
  - im Modus **Spielen** automatisch `zuletztgespielt` gesetzt
  - im Modus **Sichten** kein `zuletztgespielt` gesetzt
  - die XML-Datei automatisch gespeichert
5. Abschluss: Weitere Karten koennen direkt weiter einsortiert werden; jede Ablage auf `Q1` bis `Q4` wird sofort gespeichert.

Hinweis zu 2: Beim Ansehen weiterer Blaetter wird das aktuelle Blatt dorthin zurueckgeschoben, wo es herkam.

### Usecase 2: User will Noten mit Spielton suchen

1. User schaltet `Tonsuche` auf `Ton Rec` und legt das Zielblatt in den CENTER.
2. User spielt das Motiv 3-6 Sekunden ein; die Referenzaufnahme stoppt automatisch nach genug erkanntem Musiksignal.
3. Optional kann der User mit `Nochmal` sofort eine neue Referenz für dieselbe Center-Karte einspielen.
4. Danach schaltet der User auf `Ton An` und spielt das Motiv erneut.
5. Die App vergleicht den Live-Ton mit gespeicherten Fingerprints und zieht bei stabilem Treffer das passende Blatt automatisch in den CENTER.

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
- `render.js` - Karten-Rendering, Stack-/Offset-Logik, Vorschau-Bildaufbau, Render-API (`window.NotentischRender`)
- `filehandling.js` - XML I/O, Drag & Drop, Suche, Statusspeicherung, Board-/Center-Workflow
- `audio-assist.js` - Audio Auto (Mikrofonaufnahme, Fingerprint-Bildung, Matching, XML-Felder `AudioReferenz`)
- `extract_cards.ps1` - Card-Bilder aus PDFs generieren (Poppler)
- `Notentisch.bat` - Batch-Launcher fuer Windows (startet `local_server.py` + Browser; setzt waehrend der Session Energiespar-Timeouts auf `Nie` und restauriert danach)
- `notentisch.vbs` - VB-Wrapper fuer unsichtbaren Start
- `local_server.py` - lokaler HTTP-Server mit Shutdown-Endpoint (`/__shutdown__`) sowie Audio-Upload/-Delete (`/__audio_upload__`, `/__audio_delete__`)
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