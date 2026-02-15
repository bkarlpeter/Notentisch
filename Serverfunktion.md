# Notentisch – Lokaler Server (Python HTTP Server)

Dieses Dokument beschreibt die vollständige, funktionierende Server‑Konfiguration
für das Projekt *Digitaler Notentisch*.  
Es dient als Referenz, falls der Server neu eingerichtet, repariert oder
auf einen anderen Rechner übertragen werden soll.

---

## 1. Ziel des Servers

Der lokale Python‑Server übernimmt:

- Ausliefern von `board.html` / `board_server.html`
- Bereitstellen der Kartenbilder aus `Cards_Export/`
- Bereitstellen der PDF‑Dateien über die Junction `Blätter/`
- Laden der JavaScript‑Dateien (`functions.js`, `filehandling.js`, `board.js`)
- Ermöglichen von Drag & Drop und PDF‑Anzeige über PDF.js

Ohne Server funktionieren:
- PDF‑Anzeige nicht  
- Kartenbilder nicht  
- Drag & Drop nicht  
- XML‑Laden nur teilweise  

---

## 2. Ordnerstruktur (muss exakt so sein):
Projekt notentisch/ │ 
├── board_server.html 
├── board.js 
├── functions.js 
├── filehandling.js 
├── start_server.ps1 
├── notentisch_start.vbs 
├── notenblaetter_cards.xml 
│ ├── Cards_Export/ ← PNG‑Kartenbilder 
│ ├── Beispiel1.png 
│ ├── Beispiel2.png 
│ └── ... │ 
├── Blätter/ ← JUNCTION! zeigt auf echten PDF‑Ordner 
│ ├── Auf der Zwieselalm.pdf 
│ ├── Alpenecho.pdf 
│ └── ... 
│ └── (weitere Dateien)


**Wichtig:**  
`Blätter/` ist kein echter Ordner, sondern eine *Junction*.

---

## 3. Junction „Blätter“ erstellen

PowerShell **als Administrator**:

```powershell
cd "C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch"

cmd /c mklink /J "Blätter" "C:\Users\User\OneDrive\myMusic\Noten\Blätter"
Erwartet Ausgabe:
Junction created for Blätter <<===>> C:\Users\User\OneDrive\myMusic\Noten\Blätter

TEST
dir Blätter
→ PDFs müssen sichtbar sein.

4. Server starten (Port 5500)
Der Port 8000 wird von Edge falsch gecached.
Port 5500 funktioniert zuverlässig.
cd "C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch"
python -m http.server 5500
Server läuft auf http://localhost:5500/

Start über vbs

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -ExecutionPolicy Bypass -File ""start_server.ps1""", 0, False
WScript.Sleep 2000
WshShell.Run "http://localhost:5500/board_server.html", 1, False

5. Browser öffnen
Edge:
http://localhost:5500/board_server.html
Falls Edge den Port ignoriert:
http://127.0.0.1:5500/board_server.html

6. Funktionstest
XML laden

Karte ins Center ziehen

PDF muss erscheinen

Kartenbilder müssen sichtbar sein

Keine 404‑Fehler im Serverfenster

7. Typische Fehler & Lösungen
404 bei PNG oder PDF
→ Server läuft im falschen Ordner
→ Junction fehlt
→ Cards_Export fehlt
→ Dateiname stimmt nicht (Groß/Klein)

Edge lädt falsche Datei
→ Port 8000 vermeiden
→ Port 5500 verwenden
→ Browser über start öffnen
→ Notfalls 127.0.0.1 statt localhost

PowerShell „hängt“
→ Normal, wenn Server läuft
→ Zweites PowerShell‑Fenster für Browserstart verwenden

8. Minimaler Startablauf (funktioniert immer)
PowerShell (windows+R, powershell) Fenster 1:
cd <Projektordner>
python -m http.server 5500

PowerShell Fenster 2:
start http://localhost:5500/board_server.html


---

# **Vorschläge für spätere Verbesserungen**

Hier sind die Erweiterungen, die dein System noch stabiler, schneller und wartungsärmer machen würden.

---

## **1. Startskript robuster machen**
- Serverstart prüfen  
- Warten, bis Port 5500 wirklich offen ist  
- Browser erst dann öffnen  
- Edge‑Cache für localhost automatisch umgehen  

Das macht den Start „idiotensicher“.

---

## **2. Projekt aus OneDrive herauslösen**
OneDrive ist praktisch, aber für lokale Server oft störend.

Ein stabiler Pfad wäre:

C:\Notentisch\


Vorteile:
- keine Synchronisationsverzögerungen  
- keine Blockaden  
- keine falschen Dateiversionen  
- keine Edge‑Sicherheitswarnungen  

---

## **3. Diagnose‑Overlay im Notentisch**
Ein kleines JS‑Modul könnte prüfen:

- Ist `/Blätter/` erreichbar?  
- Ist `/Cards_Export/` erreichbar?  
- Ist PDF.js geladen?  
- Ist die XML gültig?  

Bei Fehlern: klare Meldung statt „PDF nicht gefunden“.

---

## **4. Automatische Junction‑Reparatur**
Ein kleines PowerShell‑Skript könnte:

- prüfen, ob `Blätter/` existiert  
- prüfen, ob es eine Junction ist  
- prüfen, ob der Zielpfad existiert  
- bei Fehlern automatisch neu setzen  

---

## **5. Port‑Fallback**
Wenn 5500 belegt ist:

- automatisch 5501, 5502, 5503 testen  
- Browser mit dem funktionierenden Port öffnen  

---

Wenn du willst, kann ich dir eines dieser Features sofort bauen — oder alle zusammen in einem „Notentisch‑Starter 2.0“.

Sag einfach, worauf du Lust hast.