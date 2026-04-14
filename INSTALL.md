# DIGITALER NOTENTISCH - INSTALLATION

## Schnellstart
1. Projektordner auf neuen Windows-Rechner kopieren
2. Doppelklick auf `Notentisch.bat`
3. Browser öffnet: [http://localhost:8000/board.html](http://localhost:8000/board.html)

---

## Schritt-für-Schritt-Installation

### 1. Voraussetzungen
- Windows 10/11
- Python 3 installiert (bei Installation: "Add Python to PATH" aktivieren)

### 2. Projekt kopieren
Kompletten Ordner "Notentisch" kopieren. Wichtig sind u.a.:
- board.html
- functions.js
- render.js
- filehandling.js
- audio_core.js
- audio_data.js
- audio_runtime.js
- local_server.py
- Notentisch.bat
- extract_cards.ps1
- create_xml_from_pdfs.ps1
- Cards_Export/
- Blätter/

### 3. PDF-Ordner prüfen
Die App erwartet PDFs unter `Blätter/`.

Falls "Blätter" auf dem Zielrechner nicht funktioniert (z.B. alte Junction):
1. PowerShell als Administrator öffnen
2. In den Projektordner wechseln
3. Junction neu setzen:
   ```
   cmd /c mklink /J "Blätter" "D:\Pfad\zu\deinen\PDFs"
   ```

### 4. App starten
**Variante A (empfohlen):**
- Doppelklick auf `Notentisch.bat`

**Variante B (manuell):**
- PowerShell im Projektordner öffnen
- `py -3 local_server.py 8000`
- Browser: [http://localhost:8000/board.html](http://localhost:8000/board.html)

### 5. XML laden
1. In der App auf "LADEN" klicken
2. XML-Datei auswählen → Karten erscheinen in den Quadranten

**Noch keine XML vorhanden?** Beim Abbrechen des Datei-Dialogs erscheint ein Angebot, eine neue XML direkt aus einem PDF-Ordner zu erstellen. Alternativ:
```powershell
.\create_xml_from_pdfs.ps1 -PdfDir "C:\Pfad\zu\PDFs" -OutputXml "Notentisch.xml"
```

---

## Optional: Kartenbilder erzeugen
Im Projektordner:
```powershell
.\extract_cards.ps1
```
Das Skript nutzt bevorzugt:
- `.\poppler-25.12.0\Library\bin\pdfimages.exe`

Wenn dieser Pfad nicht existiert, wird pdfimages.exe aus PATH verwendet.

---

## Start auf einem anderen Windows-System

So geht's:
```powershell
.\setup_notentisch.ps1
```
Das Skript erledigt für dich:
- Prüfung auf Python 3 und Poppler (pdfimages.exe)
- Anlage des „Blätter“-Ordners bzw. Erstellen einer Junction zu deinen PDFs
- Anlage des „Cards_Export“-Ordners
- Prüfung, ob der Standard-Port 8000 frei ist (ggf. Alternativport)
- Start des lokalen Servers und Öffnen der App im Browser (optional)

Du kannst das Skript jederzeit erneut ausführen, falls du die Ordnerstruktur oder Verknüpfungen anpassen möchtest.

---

## Problemlösung

**Problem:** "Python wurde nicht gefunden"
- Python 3 installieren
- "Add Python to PATH" aktivieren
- Neues Terminal öffnen

**Problem:** Browser öffnet nicht
- URL manuell öffnen: [http://localhost:8000/board.html](http://localhost:8000/board.html)

**Problem:** PDF wird nicht geladen
- Prüfen, ob Server läuft
- Prüfen, ob PDFs unter `Blätter/` erreichbar sind
- Falls nötig, Junction neu erstellen (siehe Schritt 3)

**Problem:** Keine Kartenbilder
- `.\extract_cards.ps1` ausführen
- Poppler-Pfad prüfen (siehe Optional)

**Problem:** Mikrofon wird nicht abgefragt (Audio Auto)
- Browser-Berechtigung für Mikrofon prüfen
- Seite neu laden und Audio Auto erneut aktivieren

**Problem:** Audio Auto erkennt nichts
- Zuerst Referenzaufnahme mit Blatt im Center machen (ca. 3-5 Sekunden)
- Danach außerhalb vom Center erneut testen

**Problem:** Falsches Blatt wird erkannt
- Referenz in ruhiger Umgebung neu aufnehmen
- Näher am Mikrofon spielen/summen

**Problem:** Audio konnte nicht gespeichert werden
- Prüfen, ob der lokale Server über local_server.py läuft
- Prüfen, ob der Ordner mysounds beschreibbar ist

**Problem:** Nach Update verhält sich Audio/Rendering noch wie vorher
- Lokalen Server neu starten
- Browserseite einmal hart neu laden, damit `render.js`, `filehandling.js`, `audio_core.js`, `audio_data.js` und `audio_runtime.js` frisch geladen werden

---

## Weitere Hilfe
Siehe [README.md](README.md) für:
- Bedienung
- XML-Format
- Projektdateien
