let currentXmlDoc = null;
let currentXmlFileName = 'NotenTisch.xml';
// NEU: Offset pro Quadrant speichern
let currentOffsets = { 
    'neueIdee': 0,
    'wiederholen': 0,
    'geuebt': 0,
    'gelernt': 0
};
let currentPageOffset = 0;
let totalPages = 0;
let currentPdfDoc = null;
let currentNotId = null;
let currentQuadrant = 'neueIdee'; // Aktueller Quadrant
let pagesPerView = 2;
let imageFormat = 'center'; // IMMER 'center'
let autoScale = true;
let currentLayout = '2x2';
let currentFileHandle = null;

// Wird beim Laden der XML dynamisch befüllt
let statusMapping = { 
    "neueIdee": "zurueckgestellt", 
    "wiederholen": "wiederholen", 
    "geuebt": "geuebt", 
    "gelernt": "gelernt" 
};

const statusMappingDefaults = { 
    "neueIdee": "neueIdee", 
    "wiederholen": "wiederholen", 
    "geuebt": "geuebt", 
    "gelernt": "gelernt" 
};

const statusMappingNames = ['neueIdee', 'wiederholen', 'geuebt', 'gelernt'];

// Status-Normalisierung
function normalizeStatus(value) {
    const raw = (value || '').toLowerCase().trim();
    if (raw === 'neueidee') return 'neueIdee';
    if (raw === 'wiederholen' || raw === 'wiedervorlegen') return 'wiederholen';
    if (raw === 'geuebt' || raw === 'zurück' || raw === 'zurueck') return 'geuebt';
    if (raw === 'gelernt') return 'gelernt';
    return 'neueIdee';
}

// Helper-Funktionen
function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|#]/g, '').replace(/[\u0000-\u001F]/g, '').trim();
}

function normalizeUmlauts(value) {
    return value.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
                .replace(/ß/g, 'ss').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue');
}

function brokenUtf8Encoding(value) {
    // Access-Export erstellt manchmal falsche UTF-8 Dateinamen
    // ü → Ã¼, ö → Ã¶, ä → Ã¤
    return value.replace(/ü/g, 'Ã¼').replace(/ö/g, 'Ã¶').replace(/ä/g, 'Ã¤')
                .replace(/Ü/g, 'Ãœ').replace(/Ö/g, 'ÃÖ').replace(/Ä/g, 'Ã„')
                .replace(/ß/g, 'ÃŸ');
}

function decodeMaybe(value) {
    try { return decodeURIComponent(value); } catch { return value; }
}

function parseSpeicherort(rawValue) {
    if (!rawValue) return { title: 'Unbekannt', pdfPath: '' };
    const decoded = decodeMaybe(rawValue);
    const parts = decoded.split('#').map(p => p.trim()).filter(Boolean);
    const title = (parts[0] || 'Unbekannt').replace(/\.pdf$/i, '').trim();
    const pdfPath = parts[1] || '';
    return { title, pdfPath };
}

function findCardImage(displayName, pdfPath) {
    let cleanName = (displayName || '').replace(/\.(pdf|PDF|jpg|jpeg|png)$/i, '');
    if (cleanName.includes('\\')) cleanName = cleanName.split('\\').pop();
    if (cleanName.includes('/')) cleanName = cleanName.split('/').pop();
    
    let pdfName = '';
    if (pdfPath) {
        const pdfFile = pdfPath.split(/[/\\]/).pop() || '';
        pdfName = pdfFile.replace(/\.pdf$/i, '');
    }

    const candidates = [];
    [cleanName, pdfName].forEach(source => {
        const base = (source || '').trim();
        if (!base) return;
        const noExt = base.replace(/\.(pdf|PDF|jpg|jpeg|png)$/i, '').trim();
        const compact = noExt.replace(/\s+/g, ' ');
        const underscored = compact.replace(/\s/g, '_');
        const noSpaces = compact.replace(/\s/g, '');
        const firstWord = compact.split(/[\s\-]/)[0];

        [noExt, compact, underscored, noSpaces, firstWord].forEach(name => {
            const safe = sanitizeFilename(name);
            // Original-Name
            candidates.push(safe);
            // Mit ae/oe/ue
            candidates.push(normalizeUmlauts(safe));
            // Mit broken UTF-8 (Access-Export)
            candidates.push(brokenUtf8Encoding(safe));

            // Zusätzlich: Mit trailing spaces (häufiger Access-Export Bug - 1 bis 4 spaces)
            for (let i = 1; i <= 4; i++) {
                candidates.push(safe + ' '.repeat(i));
                candidates.push(brokenUtf8Encoding(safe) + ' '.repeat(i));
            }
        });
    });

    return Array.from(new Set(candidates)).filter(Boolean).map(name => `Cards_Export/${name}.png`);
}

function loadImageWithFallback(cardDiv, paths) {
    if (!paths || paths.length === 0) {
        cardDiv.style.background = '#666';
        cardDiv.innerHTML = '<small style="color:#ccc;">Kein Bild</small>';
        return;
    }

    const tryPath = (index) => {
        if (index >= paths.length) {
            cardDiv.style.background = '#666';
            cardDiv.innerHTML = '<small style="color:#ccc;">Kein Bild</small>';
            return;
        }
        const img = new Image();

        // Timeout falls Server nicht antwortet (ERR_EMPTY_RESPONSE)
        const timeoutId = setTimeout(() => {
            img.src = ''; // Abbruch
            tryPath(index + 1); // Nächster Versuch
        }, 3000); // 3 Sekunden Timeout

        img.onload = () => {
            clearTimeout(timeoutId);
            cardDiv.style.backgroundImage = `url('${paths[index]}')`;
            cardDiv.style.backgroundSize = 'cover';
            cardDiv.style.backgroundPosition = 'top';
        };
        img.onerror = () => {
            clearTimeout(timeoutId);
            tryPath(index + 1);
        };
        img.src = paths[index];
    };
    tryPath(0);
}

// Datei-Handling
function allow(e) { e.preventDefault(); }

function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    currentXmlFileName = file.name;
   // NEU: Speichere File Handle wenn möglich
    if (event.target.files[0].handle) {
        currentFileHandle = event.target.files[0].handle;
    }
    console.log('Lade Datei:', file.name);
    
    const reader = new FileReader();
    
    reader.onerror = (error) => {
        console.error('Fehler beim Laden der Datei:', error);
        alert(`Fehler beim Laden der Datei: ${error?.message || 'Unbekannter Fehler'}`);
    };
    
    reader.onload = e => {
        try {
            console.log('Datei geladen, parse XML...');
            currentXmlDoc = new DOMParser().parseFromString(e.target.result, "text/xml");
            
            // Prüfe auf XML-Parsing-Fehler
            const parseError = currentXmlDoc.querySelector('parsererror');
            if (parseError) {
                console.error('XML-Parsing-Fehler:', parseError.textContent);
                alert('Fehler beim Parsen der XML-Datei. Bitte prüfen Sie das Format.');
                return;
            }
            
            const savedLimit = currentXmlDoc.querySelector('StaffelLimit')?.textContent;
            if (savedLimit) document.getElementById('stackLimit').value = savedLimit;
            
            console.log('Rendere Board...');
            renderBoard();
            console.log('Board erfolgreich geladen!');
        } catch (error) {
            console.error('Fehler beim Verarbeiten:', error);
            alert(`Fehler beim Verarbeiten der Datei: ${error?.message || 'Unbekannter Fehler'}`);
        }
    };
    
    reader.readAsText(file);
}

// Board rendern
function renderBoard() {
    if (!currentXmlDoc) return;
    const limit = parseInt(document.getElementById('stackLimit').value) || 8;
    const stackOffset = parseInt(document.getElementById('stackOffset').value) || 30;
    
    document.querySelectorAll('.quadrant').forEach(q => q.innerHTML = '');
    document.querySelectorAll('.center-hole .card-container').forEach(c => c.remove());

    const items = Array.from(currentXmlDoc.querySelectorAll('Notentisch, NotenTisch'));

    let imageLoadDelay = 0;
    const quadrantMap = { 1: 'neueIdee', 2: 'wiederholen', 3: 'geuebt', 4: 'gelernt' };

    items.forEach((item, index) => {
        const id = item.querySelector('NotID')?.textContent;
        const rawName = item.querySelector('Speicherort')?.textContent;
        const parsed = parseSpeicherort(rawName);
        const displayName = parsed.title;
        
        let qId = 'neueIdee';
        let quadrant = item.querySelector('Quadrant')?.textContent;
        if (quadrant) {
            let quadrantNum = parseInt(quadrant);
            if (!isNaN(quadrantNum) && quadrantNum >= 1 && quadrantNum <= 4) {
                qId = quadrantMap[quadrantNum];
            }
        } else {
            qId = normalizeStatus(item.querySelector('ArbeitsStatus')?.textContent);
        }

        const xmlImg = item.querySelector('img')?.textContent || '';
        const imagePaths = xmlImg ? [xmlImg] : findCardImage(displayName, parsed.pdfPath);

        const container = document.createElement('div');
        container.className = 'card-container';
        
        const quadrantItems = items.filter(i => {
            let q = 'neueIdee';
            let qs = i.querySelector('Quadrant')?.textContent;
            if (qs) {
                let qNum = parseInt(qs);
                if (!isNaN(qNum) && qNum >= 1 && qNum <= 4) q = quadrantMap[qNum];
            } else {
                q = normalizeStatus(i.querySelector('ArbeitsStatus')?.textContent);
            }
            return q === qId;
        });
        const indexInQuadrant = quadrantItems.indexOf(item);
        const offset = currentOffsets[qId] || 0;
        
        if (indexInQuadrant >= offset && indexInQuadrant < offset + limit) {
            container.classList.add('visible');
        }

        container.id = 'cont-' + id;
        container.dataset.notid = id;
        container.dataset.pdfPath = parsed.pdfPath || '';
        container.dataset.title = displayName;
        container.draggable = true;
        container.onclick = function() { 
            if(this.parentElement.id !== 'CENTER') {
                currentQuadrant = this.parentElement.id;
                this.parentElement.appendChild(this);
            }
        };
        container.ondragstart = e => e.dataTransfer.setData('text', e.target.id);

        let cardHtml = imagePaths && imagePaths.length
            ? `<div class="card" data-img="1"></div>`
            : `<div class="card" style="background: #666; display: flex; align-items: center; justify-content: center; color: #ccc;"><small>Kein Bild</small></div>`;
        cardHtml += `<div class="card-title">${displayName}</div>`;
        container.innerHTML = cardHtml;

        const cardDiv = container.querySelector('.card[data-img]');
        if (cardDiv) {
            const delay = imageLoadDelay;
            setTimeout(() => loadImageWithFallback(cardDiv, imagePaths), delay);
            imageLoadDelay += 50;
        }

        document.getElementById(qId).appendChild(container);
    });

    const style = document.getElementById('stack-offset-style') || document.createElement('style');
    style.id = 'stack-offset-style';
    style.innerHTML = `
        #neueIdee .card-container.visible:nth-child(2), #geuebt .card-container.visible:nth-child(2) { top: ${50 + stackOffset}px; }
        #neueIdee .card-container.visible:nth-child(3), #geuebt .card-container.visible:nth-child(3) { top: ${50 + stackOffset * 2}px; }
        #neueIdee .card-container.visible:nth-child(4), #geuebt .card-container.visible:nth-child(4) { top: ${50 + stackOffset * 3}px; }
        #neueIdee .card-container.visible:nth-child(5), #geuebt .card-container.visible:nth-child(5) { top: ${50 + stackOffset * 4}px; }
        #neueIdee .card-container.visible:nth-child(n+6), #geuebt .card-container.visible:nth-child(n+6) { top: ${50 + stackOffset * 5}px; }
        
        #wiederholen .card-container.visible:nth-child(2), #gelernt .card-container.visible:nth-child(2) { top: ${50 + stackOffset}px; }
        #wiederholen .card-container.visible:nth-child(3), #gelernt .card-container.visible:nth-child(3) { top: ${50 + stackOffset * 2}px; }
        #wiederholen .card-container.visible:nth-child(4), #gelernt .card-container.visible:nth-child(4) { top: ${50 + stackOffset * 3}px; }
        #wiederholen .card-container.visible:nth-child(5), #gelernt .card-container.visible:nth-child(5) { top: ${50 + stackOffset * 4}px; }
        #wiederholen .card-container.visible:nth-child(n+6), #gelernt .card-container.visible:nth-child(n+6) { top: ${50 + stackOffset * 5}px; }
    `;
    if (!document.getElementById('stack-offset-style')) document.head.appendChild(style);
    
    const offset = currentOffsets[currentQuadrant] || 0;
    document.getElementById('pageInfo').textContent = `(Ab ${offset + 1})`;
}

// PDF-Funktionen
async function showPdfPages(pdfPath, notId) {
    const center = document.getElementById('center-content');
    currentPageOffset = 0;
    currentNotId = notId;
    center.innerHTML = '<div style="color:#ccc;">Lade PDF...</div>';

    try {
        let serverPath = pdfPath.trim();

        // Konvertiere Windows-Pfade zu Unix-Pfaden
        serverPath = serverPath.replace(/\\/g, '/');

        // Für PowerShell-Server: Konvertiere zu Blätter/xyz.pdf Format
        // Der PowerShell-Server erwartet: Blätter/xyz.pdf und fügt automatisch myMusic/Noten/ hinzu

        if (serverPath.match(/^[A-Za-z]:/)) {
            // Absoluter Pfad: C:/Users/User/OneDrive/myMusic/Noten/Blätter/xyz.pdf
            // Extrahiere nur: Blätter/xyz.pdf
            const match = serverPath.match(/(?:myMusic\/Noten\/|Noten\/)?(.+)$/);
            if (match) {
                serverPath = match[1];
            }
        } else if (serverPath.startsWith('../')) {
            // Relativer Pfad: ../../myMusic/Noten/Blätter/xyz.pdf
            // Extrahiere nur: Blätter/xyz.pdf
            const match = serverPath.match(/(?:myMusic\/Noten\/|Noten\/)?(.+)$/);
            if (match) {
                serverPath = match[1];
            }
        }

        // Entferne führende Slashes
        serverPath = serverPath.replace(/^[\/]+/, '');

        // URL-encode den Pfad (wichtig für Umlaute und Leerzeichen)
        serverPath = serverPath.split('/').map(part => encodeURIComponent(part)).join('/');

        const loadingTask = pdfjsLib.getDocument(serverPath);
        currentPdfDoc = await loadingTask.promise;
        totalPages = currentPdfDoc.numPages;
        await renderPdfPages();
    } catch (err) {
        console.error('PDF-Ladefehler:', err);
        center.innerHTML = `<div style="color:#ccc; text-align:center; padding:20px;">
            <p>PDF nicht gefunden</p>
            <small style="color:#999; font-size:10px;">Pfad: ${pdfPath}</small><br><br>
            <button class="btn" onclick="selectPdfManually('${notId}')" style="width:auto;">PDF öffnen</button>
        </div>`;
    }
}

async function renderPdfPages() {
    const center = document.getElementById('center-content');
    const pageNums = [];
    for (let i = 0; i < pagesPerView; i++) {
        const pageNum = currentPageOffset + i + 1;
        if (pageNum <= totalPages) pageNums.push(pageNum);
    }
    
    let html = '<div style="display:flex; flex-direction:row; gap:5px; width:100%; height:100%; align-items:center; justify-content:center;">';
    
    if (currentPageOffset > 0) {
        html += '<button style="position:absolute; left:10px; z-index:10; width:40px; height:40px; background:#3498db; border:none; color:white; font-size:18px; cursor:pointer; border-radius:5px;" onclick="prevPdfPages()">◄</button>';
    }
    
    html += '<div style="display:flex; gap:5px; max-height:100%; max-width:100%; align-items:center; justify-content:center;">';
    pageNums.forEach((pageNum, idx) => {
        html += `<canvas id="pdf-canvas-${idx + 1}"></canvas>`;
    });
    html += '</div>';
    
    if (currentPageOffset + pagesPerView < totalPages) {
        html += '<button style="position:absolute; right:10px; z-index:10; width:40px; height:40px; background:#3498db; border:none; color:white; font-size:18px; cursor:pointer; border-radius:5px;" onclick="nextPdfPages()">►</button>';
    }
    
    html += '</div>';
    center.innerHTML = html;
    
    // Automatisch berechnen: volle Höhe nutzen, Breite optimal verteilen
    const containerHeight = center.offsetHeight - 20; // -20px Sicherheit
    const containerWidth = center.offsetWidth - 100; // -100px für Pfeile
    
    for (let i = 0; i < pageNums.length; i++) {
        await renderOnePage(pageNums[i], `pdf-canvas-${i + 1}`, containerHeight, containerWidth, pageNums.length);
    }
}

async function renderOnePage(pageNum, canvasId, containerHeight, containerWidth, totalPages) {
    try {
        const page = await currentPdfDoc.getPage(pageNum);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        // Berechne optimale Skalierung für diese Seite
        const viewport = page.getViewport({ scale: 1.0 });
        const pageAspectRatio = viewport.width / viewport.height;
        
        // Verfügbare Breite pro Seite
        const availableWidth = containerWidth / totalPages;
        
        // Höhe limitiert? Dann scale nach Höhe
        let scale = containerHeight / viewport.height;
        
        // Aber nicht zu breit werden
        const maxWidthForHeight = containerHeight * pageAspectRatio;
        if (maxWidthForHeight > availableWidth) {
            scale = availableWidth / viewport.width;
        }
        
        const scaledViewport = page.getViewport({ scale });
        const context = canvas.getContext('2d');
        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;
        canvas.style.border = '1px solid #555';
        canvas.style.maxHeight = '100%';
        canvas.style.maxWidth = '100%';
        
        await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
    } catch (err) {
        console.error(`Fehler Seite ${pageNum}:`, err);
    }
}

function togglePagesPerView() {
    pagesPerView = pagesPerView === 2 ? 3 : 2;
    const btn = document.getElementById('pagesBtn');
    if (btn) btn.textContent = pagesPerView + ' Seiten';
    if (currentPdfDoc) renderPdfPages();
}

function switchLayout() {
    if (currentLayout === '2x2') {
        document.body.style.gridTemplateColumns = '4fr 1fr';
        document.body.style.gridTemplateRows = '1fr auto';
        
        const rightSidebar = document.createElement('div');
        rightSidebar.id = 'right-sidebar';
        rightSidebar.style.cssText = 'grid-column: 2; grid-row: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 10px; background: #1a1a1a; border-left: 1px solid #333;';

        ['neueIdee', 'wiederholen', 'geuebt', 'gelernt'].forEach(qId => {
            const quad = document.getElementById(qId);
            quad.style.display = 'flex';
            quad.style.minHeight = '300px';
            quad.style.borderRadius = '8px';
            quad.style.padding = '60px 10px 10px';
            rightSidebar.appendChild(quad);
        });
        
        document.body.appendChild(rightSidebar);
        
        const center = document.getElementById('CENTER');
        center.style.position = 'relative';
        center.style.top = '0';
        center.style.left = '0';
        center.style.transform = 'none';
        center.style.width = '100%';
        center.style.height = '100%';
        center.style.gridColumn = '1';
        center.style.gridRow = '1';
        center.style.borderRadius = '0';
        
        currentLayout = '80-20';
        document.getElementById('layoutBtn').textContent = 'Layout: 80/20';
    } else {
        document.body.style.gridTemplateColumns = '1fr 1fr';
        document.body.style.gridTemplateRows = '1fr 1fr auto';
        
        const rightSidebar = document.getElementById('right-sidebar');
        if (rightSidebar) {
            const controlBar = document.querySelector('.control-bar');
            ['neueIdee', 'wiederholen', 'geuebt', 'gelernt'].forEach(qId => {
                const quad = document.getElementById(qId);
                quad.removeAttribute('style');
                document.body.insertBefore(quad, controlBar);
            });
            rightSidebar.remove();
        }
        
        const center = document.getElementById('CENTER');
        center.style.position = 'absolute';
        center.style.top = '50%';
        center.style.left = '50%';
        center.style.transform = 'translate(-50%, -50%)';
        center.style.width = '900px';
        center.style.height = '600px';
        center.style.gridColumn = '';
        center.style.gridRow = '';
        center.style.borderRadius = '20px';
        
        currentLayout = '2x2';
        document.getElementById('layoutBtn').textContent = 'Layout: 2x2';
    }
    
    if (currentPdfDoc) renderPdfPages();
}

function nextPdfPages() {
    if (currentPageOffset + pagesPerView < totalPages) {
        currentPageOffset += 1;
        renderPdfPages();
    }
}

function prevPdfPages() {
    if (currentPageOffset > 0) {
        currentPageOffset -= 1;
        renderPdfPages();
    }
}

function selectPdfManually(notId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const center = document.getElementById('center-content');
        center.innerHTML = '<div style="color:#ccc;">Lade PDF...</div>';
        try {
            const arrayBuffer = await file.arrayBuffer();
            currentPdfDoc = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
            totalPages = currentPdfDoc.numPages;
            currentPageOffset = 0;
            await renderPdfPages();
        } catch (err) {
            center.innerHTML = '<div style="color:#ccc;">Fehler</div>';
        }
    };
    input.click();
}

// Drag & Drop
function drop(e) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text');
    const card = document.getElementById(cardId);
    const target = e.target.closest('.quadrant') || e.target.closest('.center-hole');
    
    if (!target || !card) return;
    
    if (target.id === 'CENTER') {
        const pdfPath = card.dataset.pdfPath;
        const notId = card.dataset.notid;
        if (pdfPath && notId) {
            document.querySelectorAll('.card-container.in-center').forEach(c => c.classList.remove('in-center'));
            card.classList.add('in-center');
            currentNotId = notId;
            
            // NEUER CODE: Speichere Timestamp wenn ins Center gezogen
            const now = new Date();
            const timestamp = now.toISOString().slice(0, 19).replace('T', ' '); // Format: 2024-01-15 14:32:45
            card.dataset.lastViewed = timestamp;
            
            showPdfPages(pdfPath, notId);
        } else {
            document.getElementById('center-content').innerHTML = `<div style="text-align:center; color:#ccc; font-size:12px;">Kein PDF-Pfad</div>`;
        }
    } else {
        if (!currentPdfDoc) target.appendChild(card);
    }
}

function moveCardToQuadrant(quadrantId) {
    if (!currentNotId) return;
    const card = document.querySelector(`.card-container.in-center[data-notid="${currentNotId}"]`);
    if (card) {
        card.classList.remove('in-center');
        document.getElementById(quadrantId).appendChild(card);
        document.getElementById('center-content').innerHTML = '<div style="text-align:center; color:#9aa; font-size:12px;">PDF im Center anzeigen</div>';
        currentPdfDoc = null;
        currentNotId = null;
        totalPages = 0;
    }
}

// Navigation
function nextPage() {
    const limit = parseInt(document.getElementById('stackLimit').value) || 8;
    const quadrantMap = { 1: 'neueIdee', 2: 'wiederholen', 3: 'geuebt', 4: 'gelernt' };
    const items = Array.from(currentXmlDoc.querySelectorAll('Notentisch, NotenTisch'));
    
    // Zähle Items im aktuellen Quadrant
    const quadrantItems = items.filter(i => {
        let q = 'neueIdee';
        let qs = i.querySelector('Quadrant')?.textContent;
        if (qs) {
            let qNum = parseInt(qs);
            if (!isNaN(qNum) && qNum >= 1 && qNum <= 4) q = quadrantMap[qNum];
        } else {
            q = normalizeStatus(i.querySelector('ArbeitsStatus')?.textContent);
        }
        return q === currentQuadrant;
    });
    
    if (currentOffsets[currentQuadrant] + limit < quadrantItems.length) {
        currentOffsets[currentQuadrant] += limit;
        renderBoard();
    }
}

function previousPage() {
    const limit = parseInt(document.getElementById('stackLimit').value) || 8;
    currentOffsets[currentQuadrant] = Math.max(0, currentOffsets[currentQuadrant] - limit);
    renderBoard();
}

// Speichern
async function saveXml() {
    if (!currentXmlDoc) return;
    
    // StaffelLimit aktualisieren
    let limitNode = currentXmlDoc.querySelector('StaffelLimit');
    if (!limitNode) {
        limitNode = currentXmlDoc.createElement('StaffelLimit');
        currentXmlDoc.documentElement.appendChild(limitNode);
    }
    limitNode.textContent = document.getElementById('stackLimit').value;

    const statusCount = { neueIdee: 0, wiederholen: 0, geuebt: 0, gelernt: 0 };

    ['neueIdee', 'wiederholen', 'geuebt', 'gelernt'].forEach(qId => {
        document.getElementById(qId).querySelectorAll('.card-container').forEach(card => {
            const notId = card.dataset.notid;
            const node = Array.from(currentXmlDoc.querySelectorAll('Notentisch, NotenTisch'))
                .find(n => n.querySelector('NotID').textContent === notId);
            if (node) {
                // ArbeitsStatus aktualisieren
                node.querySelector('ArbeitsStatus').textContent = qId;
                statusCount[qId]++;

                // ZuletztGespielt aktualisieren
                const lastViewed = card.dataset.lastViewed;
                let zuletztGespieltNode = node.querySelector('ZuletztGespielt');
                if (!zuletztGespieltNode && lastViewed) {
                    zuletztGespieltNode = currentXmlDoc.createElement('ZuletztGespielt');
                    node.appendChild(zuletztGespieltNode);
                }
                if (zuletztGespieltNode && lastViewed) {
                    zuletztGespieltNode.textContent = lastViewed;
                }
            }
        });
    });

    const xmlStr = new XMLSerializer().serializeToString(currentXmlDoc);

    // Immer: Download der aktualisierten XML
    const blob = new Blob([xmlStr], { type: "text/xml" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = currentXmlFileName || 'NotenTisch.xml';
    a.click();

    alert(`Gespeichert (Download)!\nQ1: ${statusCount.neueIdee} | Q2: ${statusCount.wiederholen} | Q3: ${statusCount.geuebt} | Q4: ${statusCount.gelernt}`);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.quadrant').forEach(quadrant => {
        quadrant.addEventListener('click', (e) => {
            if (!e.target.closest('.card-container') && currentNotId) {
                quadrant.classList.add('active');
                setTimeout(() => quadrant.classList.remove('active'), 200);
                moveCardToQuadrant(quadrant.id);
            }
        });
    });

    document.addEventListener('keydown', e => {
        const limit = parseInt(document.getElementById('stackLimit').value) || 8;
        if (e.code === "Space" || e.key === "Escape") {
            document.getElementById('viewer-overlay').style.display = 'none';
            if (currentNotId && e.key === "Escape") moveCardToQuadrant('neueIdee');
        }
        if (e.key === "ArrowRight") { currentOffset += limit; renderBoard(); }
        if (e.key === "ArrowLeft") { currentOffset = Math.max(0, currentOffset - limit); renderBoard(); }
        if (e.key === "Delete" && currentNotId) moveCardToQuadrant('neueIdee');
    });
});