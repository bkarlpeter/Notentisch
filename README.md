# Digitaler Notentisch

Interaktive Notenverwaltung mit 4 Quadranten, Drag & Drop, PDF-Viewer und XML-Import/Export.

## Funktionen

- 4 Quadranten nach Arbeitsstatus:
  - Q1: zurückgestellt
  - Q2: wiederholen
  - Q3: geübt
  - Q4: gelernt
- Kartenstapel pro Quadrant mit einstellbarer Blattzahl (`1` bis `10`)
- Quadranten-`/` zum Blättern, wenn mehr Karten vorhanden sind als sichtbar
- CENTER-Bereich zeigt PDF (2 Seiten), inkl. `/`-Scroll und Zoom
- Drag & Drop zwischen Quadranten und CENTER
- Doppelklick im CENTER verschiebt die aktive Karte nach Q2
- XML laden/speichern im Browser
- PDF-Pfad-Fallbacks für gemischte Pfadangaben (inkl. Windows-Pfade mit `#`-Trenner)
- Kartenbild-Fallback: wenn kein `Cards_Export/card_*.png` existiert, wird ein Thumbnail aus Seite 1 der PDF erzeugt

## Start

1. Im Projektordner starten:
   - `python -m http.server 8000`
   - oder doppelklick auf `Notentisch.bat`
2. Im Browser öffnen:
   - `http://localhost:8000/board.html`

## Card-Bilder generieren

Mit `extract_cards.ps1` können Card-Vorschaubilder aus PDFs automatisch erzeugt werden:

```powershell
.\extract_cards.ps1
```

Das Skript:
- Extrahiert die **1. Seite** jedes PDFs mit Poppler (`pdfimages`)
- Speichert PNG-Bilder in `Cards_Export/`
- Benennt die Bilder automatisch nach den PDF-Titeln (Umlaute, Leerzeichen werden normalisiert)
- Überspringt bereits existierende Bilder

**Voraussetzung**: Poppler muss installiert sein.

## Bedienung

- `LADEN`: XML auswählen
- `SPEICHERN`: XML zurückschreiben
- `ZOOM - / ZOOM +`: PDF im CENTER zoomen
- `WIDE / NORMAL`: CENTER-Breite umschalten
- `Blätter`: sichtbare Karten pro Quadrant einstellen (max. 10)
- Quadranten-`/`: im jeweiligen Stapel blättern
- Karte in CENTER ziehen: PDF öffnen + `zuletztgespielt` aktualisieren
- Karte aus CENTER in Quadrant verschieben: `Arbeitsstatus` aktualisieren

## Dateiformat (XML)

Erwartete Haupteinträge:

- `<NotenTisch>` (unterstützt zusätzlich `<Notentisch>`)
- Unterfelder je Eintrag:
  - `<Titel>`
  - `<Speicherort>`
  - `<Arbeitsstatus>`

Status-Mapping:

- `zurückgestellt`  Q1
- `wiederholen`  Q2
- `geübt`  Q3
- `gelernt`  Q4

## Projektdateien

- `board.html`  UI, Layout, Styles
- `functions.js`  PDF-Anzeige, Zoom, Seiten-/Scroll-Navigation, Pfadauflösung
- `filehandling.js`  XML I/O, Karten-Rendering, Drag & Drop, Statusspeicherung
- `extract_cards.ps1`  Card-Bilder aus PDFs generieren (Poppler)
- `Notentisch.bat`  Batch-Launcher für Windows (Server + Browser)
- `notentisch.vbs`  VB-Wrapper für unsichtbaren Start
- `Cards_Export/`  Ordner für statische Card-Bilder (`card_*.png`)
