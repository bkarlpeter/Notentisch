# PDF-Anzeige Implementierung - Notentisch

## Übersicht
Dokumentation aller Features und Lösungen, die implementiert wurden, um PDFs im Notentisch-System anzuzeigen.

---

## 1. PDF-Zugriff: Junction-Lösung

### Problem
- PDFs liegen in: `C:\Users\User\OneDrive\myMusic\Noten\Blätter\`
- Python HTTP-Server läuft in: `C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch\`
- Server kann nur Dateien innerhalb seines Root-Verzeichnisses ausliefern
- **Ergebnis**: 404-Fehler bei allen PDF-Anfragen

### Lösung: Junction Link
```batch
mklink /J "C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch\myMusic" "C:\Users\User\OneDrive\myMusic"
```

**Vorteile:**
- Keine Admin-Rechte erforderlich (im Gegensatz zu Symlinks)
- PDFs bleiben an ursprünglichem Ort
- Server kann über relativen Pfad `myMusic/Noten/Blätter/` zugreifen
- Funktoniert transparent mit HTTP-Server

**Setup-Skript:** `CreateMyMusicLink.bat`
```batch
@echo off
set "PROJECT=C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch"
set "TARGET=C:\Users\User\OneDrive\myMusic"

mklink /J "%PROJECT%\myMusic" "%TARGET%"
```

---

## 2. PDF-Pfad-Extraktion aus XML

### XML-Format
```xml
<NotenTisch>
  <Titel>Song Name</Titel>
  <Speicherort>Song Name#..\..\myMusic\Noten\Blätter\Song Name.pdf#</Speicherort>
  <Arbeitsstatus>wiederholen</Arbeitsstatus>
</NotenTisch>
```

### Implementierung in `functions.js`
```javascript
function showPdfPages(pdfPath) {
    let actualPath = pdfPath;
    
    // Extrahiere Pfad aus "Titel#Pfad#" Format
    if (pdfPath.includes('#')) {
        const parts = pdfPath.split('#');
        actualPath = parts[1] || pdfPath;
    }
    
    currentPdfPath = actualPath;
    currentPageOffset = 0;
    
    // Normalisiere und versuche zu laden
    const paths = [
        normalizePdfServerPath(actualPath),
        '../myMusic/Noten/' + actualPath.split('/').pop(),
        'myMusic/Noten/Blätter/' + actualPath.split('/').pop()
    ];
    
    // Fallback-System: Probiere alle Pfadvarianten
    tryLoadPdf();
}
```

### Pfad-Normalisierung
```javascript
function normalizePdfServerPath(pdfPath) {
    if (!pdfPath) return '';
    let path = pdfPath.trim();
    
    // Windows-Backslashes  Forward-Slashes
    while (path.includes('\\')) path = path.replace('\\', '/');
    
    // Relative Pfade auflösen (../../ entfernen)
    while (path.startsWith('../')) path = path.substring(3);
    
    return path;
}
```

**3-Stufen-Fallback:**
1. Vollständig normalisierter Pfad aus XML
2. Relativer Pfad: `../myMusic/Noten/filename.pdf`
3. Absoluter Pfad über Junction: `myMusic/Noten/Blätter/filename.pdf`  **funktioniert**

---

## 3. PDF-Rendering mit PDF.js

### Library Integration
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
  pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
</script>
```

### Zwei-Seiten-Ansicht
```javascript
function renderPdfPages() {
    let centerContainer = isLayout1() ? 
        document.getElementById('center-content') : 
        document.getElementById('center-content2');
    
    if (!centerContainer || !currentPdfDoc) return;
    
    centerContainer.innerHTML = '';
    
    const page1 = currentPageOffset + 1;
    const page2 = currentPageOffset + 2;
    
    // Zeige Seite 1 und 2 nebeneinander
    if (page1 <= totalPages) renderOnePage(page1, centerContainer);
    if (page2 <= totalPages) renderOnePage(page2, centerContainer);
    
    updatePageInfo();
}
```

### Einzelseiten-Rendering
```javascript
function renderOnePage(pageNum, container) {
    currentPdfDoc.getPage(pageNum).then(page => {
        const scale = 1.0 * currentZoom;
        const viewport = page.getViewport({ scale: scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.border = '1px solid #555';
        canvas.style.borderRadius = '4px';
        canvas.style.margin = '2px';
        
        page.render({ 
            canvasContext: context, 
            viewport: viewport 
        }).promise.then(() => {
            container.appendChild(canvas);
        });
    });
}
```

---

## 4. Zoom-Funktionalität

### Zoom-Stufen
- **100%** - Volle Größe
- **90%** - Leicht verkleinert  
- **80%** - Standard (vor Optimierung)
- **60%** - Optimiert für 2-Seiten-Ansicht  **Default**

### Implementierung
```javascript
function setZoom(zoomLevel) {
    currentZoom = zoomLevel;
    
    // Button-Styling aktualisieren
    document.getElementById('zoom-100').style.background = 
        zoomLevel === 1.0 ? '#3498db' : '#555';
    document.getElementById('zoom-90').style.background = 
        zoomLevel === 0.9 ? '#3498db' : '#555';
    document.getElementById('zoom-80').style.background = 
        zoomLevel === 0.8 ? '#3498db' : '#555';
    document.getElementById('zoom-60').style.background = 
        zoomLevel === 0.6 ? '#3498db' : '#555';
    
    // PDF neu rendern mit neuem Zoom
    if (currentPdfDoc) renderPdfPages();
}
```

### Default-Setting
```javascript
const settings = {
    defaultZoom: 0.6,  // 60% für optimale 2-Seiten-Darstellung
    scrollStep: 180,
    pageLabelPrefix: 'Blatt'
};
```

---

## 5. PDF-Layout: Linksbündig

### Problem
PDFs wurden zentriert dargestellt  Nutzer sah Mitte des PDFs, nicht den Anfang.

### CSS-Fix
```css
#center-content {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;  /*  VON center GEÄNDERT */
    overflow: hidden;
    position: relative;
}
```

**Effekt:** PDFs beginnen jetzt links im Viewer, wie beim Lesen gewohnt.

---

## 6. Drag-and-Drop Trigger

### Card  CENTER = PDF laden
```javascript
function drop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const cardId = event.dataTransfer.getData('text');
    const card = document.getElementById(cardId);
    if (!card) return;
    
    const targetId = event.currentTarget.id;
    const isCenter = targetId === 'CENTER' || targetId === 'CENTER2';
    
    if (isCenter) {
        if (card.dataset.pdf) {
            card.classList.add('in-center');
            showPdfPages(card.dataset.pdf);  //  PDF laden!
        }
    } else if (isQuadrant) {
        event.currentTarget.appendChild(card);
        card.classList.remove('in-center');
        saveDateToXml(card.dataset.cardid, targetId);
    }
}
```

### Drop-Zones registrieren
```javascript
function setupDropListeners() {
    const dropTargets = ['Q1', 'Q2', 'Q3', 'Q4', 'Q1b', 'Q2b', 'Q3b', 'Q4b', 
                         'CENTER', 'CENTER2'];
    dropTargets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('dragover', (e) => e.preventDefault());
            el.addEventListener('drop', drop);
        }
    });
}
```

---

## 7. Seiten-Navigation

### Vor/Zurück Buttons
```javascript
function previousPage() {
    if (currentPageOffset > 0) {
        currentPageOffset -= 2;  // Immer 2 Seiten zurück
        renderPdfPages();
    }
}

function nextPage() {
    if (currentPageOffset + 2 < totalPages) {
        currentPageOffset += 2;  // Immer 2 Seiten vor
        renderPdfPages();
    }
}
```

### Seiten-Anzeige
```javascript
function updatePageInfo() {
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
        pageInfo.textContent = currentPdfDoc ? 
            (currentPageOffset + 1) + ' - ' + 
            Math.min(currentPageOffset + 2, totalPages) + 
            ' / ' + totalPages :
            '- / -';
    }
}
```

**UI:** `< 1 - 2 / 24 >`

---

## 8. Fehlerbehandlung & Fallbacks

### 3-Stufen-Fallback-System
```javascript
let pathIndex = 0;

function tryLoadPdf() {
    if (pathIndex >= paths.length) {
        // Alle Versuche fehlgeschlagen
        const centerContainer = isLayout1() ? 
            document.getElementById('center-content') : 
            document.getElementById('center-content2');
        
        centerContainer.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <p>PDF nicht erreichbar</p>
                <p style="font-size:10px; color:#999;">Pfad: ${actualPath}</p>
                <button onclick="selectPdfManually()">PDF öffnen</button>
            </div>`;
        return;
    }
    
    const serverPath = paths[pathIndex];
    
    pdfjsLib.getDocument(serverPath).promise.then(pdf => {
        currentPdfDoc = pdf;
        totalPages = pdf.numPages;
        renderPdfPages();
    }).catch(err => {
        pathIndex++;
        tryLoadPdf();  // Nächsten Pfad versuchen
    });
}
```

### Manueller Fallback
```javascript
function selectPdfManually() {
    const pfad = 'C:\\Users\\User\\OneDrive\\myMusic\\Noten\\Blätter\\';
    alert('Navigiere zu:\n' + pfad);
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const arrayBuffer = await file.arrayBuffer();
        currentPdfDoc = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        totalPages = currentPdfDoc.numPages;
        currentPageOffset = 0;
        renderPdfPages();
    };
    input.click();
}
```

---

## 9. Layout-Unterstützung

### Zwei Layout-Modi

**Layout 1 (Config 1):** 2x2 Quadranten-Grid
```

   Q1       Q2    
      
    CENTER       
      
   Q4       Q3    

```

**Layout 2 (Config 2):** 80/20 Split (geplant)
```

                  Q2
     CENTER2      
   (vergrößert)   Q3
                    

Q1/Q4 als Scrollbar links
```

### Layout-Toggle
```javascript
function toggleLayout() {
    const layout1 = document.getElementById('layout-2x2');
    const layout2 = document.getElementById('layout-80-20');
    
    layout1.classList.toggle('hidden');
    layout2.classList.toggle('hidden');
    
    // PDF neu rendern für neues Layout
    if (currentPdfDoc) renderPdfPages();
}
```

### Layout-Detection
```javascript
function isLayout1() {
    const layout2x2 = document.getElementById('layout-2x2');
    return !layout2x2.classList.contains('hidden');
}
```

---

## 10. Control Bar Integration

### HTML-Controls
```html
<div class="control-bar">
    <button class="btn" onclick="setZoom(1.0)" id="zoom-100">100%</button>
    <button class="btn" onclick="setZoom(0.9)" id="zoom-90">90%</button>
    <button class="btn" onclick="setZoom(0.8)" id="zoom-80">80%</button>
    <button class="btn" onclick="setZoom(0.6)" id="zoom-60" 
            style="background: #3498db;">60%</button>
    
    <span>|</span>
    
    <button class="btn toggle" onclick="toggleLayout()">Layout</button>
    
    <span>|</span>
    
    <button class="btn" onclick="previousPage()">&lt;</button>
    <span id="pageInfo">- / -</span>
    <button class="btn" onclick="nextPage()">&gt;</button>
</div>
```

---

## 11. Performance & Caching

### State Management
```javascript
let currentPdfDoc = null;      // PDF.js Dokument-Objekt
let currentPdfPath = "";       // Aktueller Dateipfad
let currentPageOffset = 0;     // Erste sichtbare Seite
let totalPages = 0;            // Gesamtanzahl Seiten
let currentZoom = 0.6;         // Aktuelle Zoom-Stufe
```

### Canvas-Wiederverwendung
- Jede Seite wird auf eigenem Canvas gerendert
- Bei Zoom/Navigation: Alte Canvas verwerfen, neu rendern
- PDF.js Worker läuft im Hintergrund (bessere Performance)

---

## 12. Zusammenfassung

### Gelöste Probleme
1.  **PDF-Zugriff** außerhalb Server-Root via Junction
2.  **Pfad-Extraktion** aus komplexem XML-Format
3.  **Windows  Unix** Pfad-Konvertierung
4.  **3-Stufen-Fallback** für robustes Laden
5.  **2-Seiten-Ansicht** mit Navigation
6.  **Zoom-Funktionalität** (60%, 80%, 90%, 100%)
7.  **Linksbündige Ausrichtung** für bessere UX
8.  **Drag & Drop** Integration
9.  **Layout-Unterstützung** (2 Modi)
10.  **Fehlerbehandlung** mit manuellem Fallback

### Technologie-Stack
- **PDF.js 3.11.174** - PDF-Rendering
- **Canvas API** - Seiten-Darstellung
- **HTML5 Drag & Drop API** - Interaktion
- **Windows Junction** - Dateisystem-Link
- **Python http.server** - Lokaler Webserver
- **Vanilla JavaScript** - Keine Frameworks

### Dateien
- `functions.js` - PDF-Logik (196 Zeilen)
- `filehandling.js` - XML & Cards (223 Zeilen)
- `board.html` - UI & Styling (353 Zeilen)
- `CreateMyMusicLink.bat` - Junction Setup (33 Zeilen)

---

**Status:**  Vollständig funktionsfähig
**Datum:** 16. Februar 2026
