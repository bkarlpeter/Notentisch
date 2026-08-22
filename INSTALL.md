Natürlich, k.-p. — hier ist **der komplette Text als echte `.md`‑Datei**, sauber formatiert, ohne Zusatzkommentare, genau so wie du ihn in dein Repo legen kannst.

---

```markdown
# 📦 DIGITALER NOTENTISCH – INSTALLATION (vereinfacht)

## 🚀 Erststart aus dem ZIP‑Download

### 1. ZIP entpacken
Den kompletten Ordner **Notentisch/** irgendwo hin kopieren.

### 2. Erstinstallation automatisch (über `AutoInstaller.bat`)
Beim **ersten Start**:

1. `AutoInstaller.bat` doppelklicken  
2. Das Skript führt automatisch aus:
   - `setup_notentisch.ps1` (einmalig)
   - `extract_cards.ps1` (einmalig, falls `Cards_Export/` leer ist)
   - startet danach den lokalen Server (`Notentisch.exe`)
3. Der Browser öffnet `board.html`
4. Die App ist leer (noch kein XML)

Damit ist der komplette Erststart vollautomatisch.

---

## 🎼 Noten laden

### Variante A – XML vorhanden
**LADEN** klicken → XML auswählen → Board erscheint.

### Variante B – noch kein XML
**LADEN → Abbrechen → „XML automatisch erzeugen?“ → Ja**  
→ PDF‑Ordner wählen (z. B. `c:\meinverzeichnis\Blätter`)  
→ XML wird aus Dateinamen erzeugt.

---

## 📁 PDF‑Ordner (Blätter/) einrichten

Die App erwartet PDFs unter:

```
Blätter/
```

Falls der Ordner nicht funktioniert (z. B. alte Junction):

PowerShell als Administrator:

```powershell
cmd /c mklink /J "Blätter" "D:\Pfad\zu\deinen\PDFs"
```

---

## 🖥️ App starten

### Empfohlen:
```
AutoInstaller.bat
```

### Alternativ:
```
Notentisch.bat
```

### Manuell:
```powershell
py -3 local_server.py 8000
```

Browser:
```
http://localhost:8000/board.html
```

---

## 🗂️ XML manuell erzeugen (optional)

```powershell
.\create_xml_from_pdfs.ps1 -PdfDir "c:/meinverzeichnis/Blätter" -OutputXml "c:/meinverzeichnis/Blätter/Notentisch.xml"
```

---

## 🖼️ Kartenbilder erzeugen (optional, falls AutoInstaller.bat nicht genutzt wurde)

```powershell
.\extract_cards.ps1
```

→ nutzt `poppler-25.12.0\Library\bin\pdfimages.exe`  
→ erzeugt `Cards_Export/card_*.png`

---

## 📦 Komplett-Paket bauen (optional)

```powershell
.\build_complete_package.ps1 -Version "v2026.08.21" -OutputDir "dist/releases"
```

Das vollständige Paket erzeugt die distributable Standalone-Version mit EXE, Web-Assets und optionalen Beispiel-PDFs.

---

## 🛠️ Problemlösung (kurz)

- **Python fehlt** → installieren + „Add to PATH“  
- **Browser öffnet nicht** → `http://localhost:8000/board.html` manuell  
- **Keine Kartenbilder** → `extract_cards.ps1` ausführen  
- **PDFs fehlen** → Junction `Blätter/` prüfen  
- **Audio erkennt nichts** → Referenzaufnahme neu machen  

---

# 🎯 Fertig
Dies ist die vereinfachte, vollständige INSTALL.md inklusive `AutoInstaller.bat`.
```