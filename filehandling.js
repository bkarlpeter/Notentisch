let xmlData = null;
let xmlFileName = null;
let xmlFileHandle = null;
let lastCardIdFromCenter = null;
let saveDateBlinkTimer = null;
let hasUnsavedChanges = false;

const SAFETY_XML_KEY = 'notentisch_safety_xml_v1';
const SAFETY_META_KEY = 'notentisch_safety_meta_v1';

function persistSafetyBackup() {
    if (!xmlData) return;
    try {
        const xmlString = new XMLSerializer().serializeToString(xmlData);
        const meta = {
            fileName: xmlFileName || 'Notentisch.xml',
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(SAFETY_XML_KEY, xmlString);
        localStorage.setItem(SAFETY_META_KEY, JSON.stringify(meta));
    } catch (err) {
        console.error('Safety-Backup konnte nicht gespeichert werden:', err);
    }
}

function clearSafetyBackup() {
    localStorage.removeItem(SAFETY_XML_KEY);
    localStorage.removeItem(SAFETY_META_KEY);
}

function markUnsavedChange() {
    hasUnsavedChanges = true;
    persistSafetyBackup();
}

function restoreSafetyBackupIfAvailable() {
    if (xmlData) return false;
    const xmlString = localStorage.getItem(SAFETY_XML_KEY);
    if (!xmlString) return false;

    let meta = null;
    try {
        meta = JSON.parse(localStorage.getItem(SAFETY_META_KEY) || 'null');
    } catch {
        meta = null;
    }

    const whenText = meta && meta.updatedAt ? new Date(meta.updatedAt).toLocaleString() : 'unbekannt';
    const fileText = meta && meta.fileName ? meta.fileName : 'Notentisch.xml';
    const shouldRestore = confirm('Ungespeicherte Sicherung gefunden (' + fileText + ', ' + whenText + '). Wiederherstellen?');
    if (!shouldRestore) {
        return false;
    }

    try {
        const parser = new DOMParser();
        xmlData = parser.parseFromString(xmlString, 'text/xml');
        xmlFileName = fileText;
        resetQuadrantOffsets();
        renderBoard();
        hasUnsavedChanges = true;
        setSaveDateState(false, 'Sicherungsstand geladen – bitte SPEICHERN');
        return true;
    } catch (err) {
        console.error('Fehler beim Wiederherstellen der Sicherung:', err);
        return false;
    }
}

function setSaveDateState(enabled, hintText) {
    const btn = document.getElementById('saveDateBtn');
    const hint = document.getElementById('saveDateHint');
    if (btn) {
        btn.disabled = !enabled;
        btn.style.backgroundColor = enabled ? '#3498db' : '#555';
        btn.style.color = 'white';
        btn.style.fontWeight = enabled ? 'bold' : 'normal';
        btn.style.marginLeft = 'auto';
    }
    if (hint) {
        hint.textContent = hintText || '';
    }
}
// Speichere Ordner-Handle in localStorage für Persistenz
/*
TODO: Später auf NotID statt Titel refenzieren für eindeutige Kartenidentifizierung
- Derzeit: Karten werden über Index und Titel identifiziert 
- NotID ist eindeutig, Titel kann mehrfach vorkommen
- Funktionen betroffen: renderBoard(), savePlayedDateToXml(), saveDateToXml()
- Vorteil: Robustere Refenzierung auch wenn Titel sich ändert
*/
async function saveFolderHandle(handle) {
    try {
        // Prüfe Berechtigung
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            const newPermission = await handle.requestPermission({ mode: 'readwrite' });
            if (newPermission !== 'granted') {
                console.log('Berechtigung für Ordner verweigert');
                return false;
            }
        }
        // Speichere Handle in IndexedDB
        const idb = await openIndexedDB();
        idb.put('folderHandle', handle);
        
        // Speichere Ordner-Name in localStorage (sichtbar in Dev Tools)
        localStorage.setItem('folderName', handle.name || 'Unbekannter Ordner');
        localStorage.setItem('folderSelected', new Date().toLocaleString());
        
        console.log('Ordner-Handle gespeichert: ' + handle.name);
        return true;
    } catch (err) {
        console.error('Fehler beim Speichern des Handles:', err);
        return false;
    }
}

// Lade Ordner-Handle aus localStorage
async function loadFolderHandle() {
    try {
        const idb = await openIndexedDB();
        return idb.get('folderHandle');
    } catch (err) {
        console.error('Fehler beim Laden des Handles:', err);
        return null;
    }
}

// IndexedDB Helper
function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('NotentischDB', 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('config')) {
                db.createObjectStore('config');
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            const store = db.transaction('config', 'readwrite').objectStore('config');
            resolve({
                put: (key, value) => new Promise((res, rej) => {
                    const req = store.put(value, key);
                    req.onerror = () => rej(req.error);
                    req.onsuccess = () => res();
                }),
                get: (key) => new Promise((res, rej) => {
                    const req = store.get(key);
                    req.onerror = () => rej(req.error);
                    req.onsuccess = () => res(req.result);
                })
            });
        };
    });
}

function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    xmlFileName = file.name;
    xmlFileHandle = null;  // Reset bei neuer Datei
    const reader = new FileReader();
    reader.onload = (e) => {
        const parser = new DOMParser();
        xmlData = parser.parseFromString(e.target.result, 'text/xml');
        resetQuadrantOffsets();
        renderBoard();
        hasUnsavedChanges = false;
        clearSafetyBackup();
        setSaveDateState(false, 'Q3: Datum automatisch');
    };
    reader.readAsText(file);
}

const MAX_STACK_CARDS = 10;


function getCardNodes() {
    if (!xmlData) return [];
    return xmlData.querySelectorAll('NotenTisch, Notentisch');
}

let quadrantOffsets = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

function resetQuadrantOffsets() {
    quadrantOffsets = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
}

function createCardElement(cardInfo) {
    const div = document.createElement('div');
    div.className = 'card-container visible';
    div.id = 'card-' + cardInfo.idx;
    div.dataset.cardid = cardInfo.idx;
    div.dataset.pdf = cardInfo.speicherort;
    div.draggable = true;

    const img = document.createElement('div');
    img.className = 'card';
    img.style.backgroundSize = 'cover';
    img.style.backgroundPosition = 'top';
    img.style.backgroundColor = '#ccc';

    loadCardImage(img, cardInfo.titel, cardInfo.speicherort);

    const titleDiv = document.createElement('div');
    titleDiv.className = 'card-title';
    titleDiv.textContent = cardInfo.titel;

    div.appendChild(img);
    div.appendChild(titleDiv);

    div.addEventListener('dragstart', drag);
    div.addEventListener('dblclick', moveCardToQ2);

    return div;
}

function createQuadrantStackControls(quadrantId, limit, totalCount) {
    const quadrant = document.getElementById(quadrantId);
    if (!quadrant) return;

    const maxOffset = Math.max(0, totalCount - limit);
    const currentOffset = Math.max(0, Math.min(quadrantOffsets[quadrantId] || 0, maxOffset));
    const offsetStep = Math.max(1, Math.round(limit / 2));
    quadrantOffsets[quadrantId] = currentOffset;

    if (totalCount <= limit) return;

    const controls = document.createElement('div');
    const isLeft = quadrantId === 'Q1' || quadrantId === 'Q4';
    controls.className = 'quadrant-stack-controls ' + (isLeft ? 'left' : 'right');
    controls.style.display = 'flex';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'quadrant-stack-btn';
    upBtn.textContent = '\u25B2';
    upBtn.disabled = currentOffset <= 0;
    upBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (quadrantOffsets[quadrantId] > 0) {
            quadrantOffsets[quadrantId] = Math.max(0, quadrantOffsets[quadrantId] - offsetStep);
            renderBoard();
        }
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'quadrant-stack-btn';
    downBtn.textContent = '\u25BC';
    downBtn.disabled = currentOffset >= maxOffset;
    downBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (quadrantOffsets[quadrantId] < maxOffset) {
            quadrantOffsets[quadrantId] = Math.min(maxOffset, quadrantOffsets[quadrantId] + offsetStep);
            renderBoard();
        }
    });

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);
    quadrant.appendChild(controls);
}


function getStackCount() {
    const input = document.getElementById('stackCount');
    const raw = parseInt(input?.value || '8', 10);
    const safe = Number.isFinite(raw) ? Math.max(1, Math.min(MAX_STACK_CARDS, raw)) : 8;
    if (input) input.value = String(safe);
    return safe;
}

function updateStackLayout() {
    const root = document.documentElement;
    const quadrants = ['Q1', 'Q2', 'Q3', 'Q4']
        .map(id => document.getElementById(id))
        .filter(Boolean);

    if (!quadrants.length) return;

    const stackCount = getStackCount();
    const cardHeight = parseFloat(getComputedStyle(root).getPropertyValue('--card-height')) || 250;

    const quadrantHeight = Math.min(...quadrants.map(q => q.clientHeight));
    let visibleZone = cardHeight;

    if (stackCount > 1) {
        visibleZone = (quadrantHeight - cardHeight) / (stackCount - 1);
    }

    visibleZone = Math.max(1, Math.min(cardHeight, Math.floor(visibleZone)));
    root.style.setProperty('--visible-zone', visibleZone + 'px');
}

function initializeStackControls() {
    const input = document.getElementById('stackCount');
    if (!input || input.dataset.bound === 'true') return;

    const onChange = () => {
        getStackCount();
        updateStackLayout();
        if (xmlData) renderBoard();
    };

    input.addEventListener('input', onChange);
    input.addEventListener('change', onChange);
    input.dataset.bound = 'true';
}
function renderBoard() {
    if (!xmlData) return;

    const quadrants = ['Q1', 'Q2', 'Q3', 'Q4'];
    const grouped = { Q1: [], Q2: [], Q3: [], Q4: [] };

    quadrants.forEach(q => {
        const el = document.getElementById(q);
        if (el) el.innerHTML = '';
    });

    const cards = getCardNodes();
    const limit = getStackCount();

    cards.forEach((cardEl, idx) => {
        const titel = cardEl.querySelector('Titel')?.textContent || 'Unbekannt';
        const speicherort = cardEl.querySelector('Speicherort')?.textContent || '';
        const status = cardEl.querySelector('Arbeitsstatus')?.textContent || 'zurueckgestellt';

        let quad = 'Q1';
        if (status.includes('wiederholen')) quad = 'Q2';
        if (status.includes('geübt')) quad = 'Q3';
        if (status.includes('gelernt')) quad = 'Q4';

        grouped[quad].push({ idx, titel, speicherort });
    });

    quadrants.forEach((quad) => {
        const target = document.getElementById(quad);
        if (!target) return;

        const total = grouped[quad].length;
        const maxOffset = Math.max(0, total - limit);
        const safeOffset = Math.max(0, Math.min(quadrantOffsets[quad] || 0, maxOffset));
        quadrantOffsets[quad] = safeOffset;

        const visibleCards = grouped[quad].slice(safeOffset, safeOffset + limit);
        visibleCards.forEach((cardInfo) => {
            target.appendChild(createCardElement(cardInfo));
        });

        createQuadrantStackControls(quad, limit, total);
    });

    setupDropListeners();
    updateStackLayout();
}

function setupDropListeners() {
    const dropTargets = ['Q1', 'Q2', 'Q3', 'Q4', 'CENTER'];
    dropTargets.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.dropBound) {
            el.addEventListener('dragover', (e) => e.preventDefault());
            el.addEventListener('drop', drop);
            el.dataset.dropBound = 'true';
        }
    });
}

function sanitizeTitle(titel) {
    let cleaned = titel.trim()
        .replace(/\.+$/, '')
        .replace(/,+$/, '')
        .replace(/\s+$/, '');
    
    return 'card_' + 
        cleaned
            .replace(/ö/g, 'oe')
            .replace(/ä/g, 'ae')
            .replace(/ü/g, 'ue')
            .replace(/Ö/g, 'OE')
            .replace(/Ä/g, 'AE')
            .replace(/Ü/g, 'UE')
            .replace(/[,\.]/g, '')
            .replace(/ /g, '_')
            .replace(/_+$/, '')
            + '.png';
}

function getPdfPathCandidates(pdfPath) {
    const rawPath = String(pdfPath || '');
    const hashParts = rawPath.split('#').map(p => p.trim()).filter(Boolean);
    const pdfParts = hashParts.filter(p => p.toLowerCase().includes('.pdf'));

    let actualPath = rawPath;
    if (pdfParts.length) {
        const relativeCandidate = pdfParts.find(p => !/^[a-zA-Z]:[\\/]/.test(p));
        actualPath = relativeCandidate || pdfParts[0];
    }

    const normalize = (input) => {
        if (!input) return '';
        if (typeof normalizePdfServerPath === 'function') return normalizePdfServerPath(input);
        return input.replace(/\\/g, '/').replace(/^\.\.\//g, '');
    };

    const normalizedActual = normalize(actualPath);
    const baseCandidates = [normalizedActual, ...pdfParts.map(normalize)]
        .filter(Boolean)
        .map(p => p.split('/').pop())
        .filter(Boolean);

    const uniqueFileNames = [...new Set(baseCandidates)];

    return [
        normalizedActual,
        ...uniqueFileNames.flatMap(name => [
            'myMusic/Noten/Blätter/' + name,
            'myMusic/Noten/' + name,
            '../myMusic/Noten/Blätter/' + name,
            '../myMusic/Noten/' + name
        ])
    ].filter(Boolean);
}

function loadCardImageFromPdf(imgElement, pdfPath) {
    if (!pdfPath || typeof pdfjsLib === 'undefined') {
        imgElement.style.backgroundColor = '#aaa';
        return;
    }

    const paths = getPdfPathCandidates(pdfPath);
    let pathIndex = 0;

    function tryNextPdf() {
        if (pathIndex >= paths.length) {
            imgElement.style.backgroundColor = '#aaa';
            return;
        }

        const serverPath = paths[pathIndex];

        pdfjsLib.getDocument(serverPath).promise
            .then(pdf => pdf.getPage(1))
            .then(page => {
                const viewport = page.getViewport({ scale: 0.35 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                return page.render({ canvasContext: context, viewport }).promise.then(() => {
                    imgElement.style.backgroundImage = 'url("' + canvas.toDataURL('image/png') + '")';
                    imgElement.style.backgroundColor = '#fff';
                });
            })
            .catch(() => {
                pathIndex++;
                tryNextPdf();
            });
    }

    tryNextPdf();
}

function loadCardImage(imgElement, titel, pdfPath) {
    const variations = [
        sanitizeTitle(titel),
        'card_' + titel.trim().replace(/[,\.]$/g, '').replace(/ /g, '_') + '.png',
        'card_' + titel.toLowerCase().trim().replace(/[,\.]/g, '').replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ /g, '_').replace(/_+$/, '') + '.png',
    ];

    const uniqueVariations = [...new Set(variations.filter(Boolean))];
    let currentIdx = 0;

    function tryNextImage() {
        if (currentIdx >= uniqueVariations.length) {
            loadCardImageFromPdf(imgElement, pdfPath);
            return;
        }

        const filename = uniqueVariations[currentIdx];
        const img = new Image();

        img.onload = () => {
            imgElement.style.backgroundImage = 'url("./Cards_Export/' + filename + '")';
        };

        img.onerror = () => {
            currentIdx++;
            tryNextImage();
        };

        img.src = './Cards_Export/' + filename;
    }

    tryNextImage();
}

function drag(event) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text', event.currentTarget.id);
    console.log('Drag started: ' + event.currentTarget.id);
}

function drop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('Drop on: ' + event.currentTarget.id);
    
    const cardId = event.dataTransfer.getData('text');
    const card = document.getElementById(cardId);
    if (!card) {
        console.log('Card nicht gefunden: ' + cardId);
        return;
    }
    
    const targetId = event.currentTarget.id;
    const isCenter = targetId === 'CENTER';
    const isQuadrant = ['Q1', 'Q2', 'Q3', 'Q4'].includes(targetId);
    
    console.log('Target: ' + targetId + ', isCenter: ' + isCenter + ', isQuadrant: ' + isQuadrant);
    
    if (isCenter) {
        // Prüfe, ob Center voll ist (PDF bereits geladen)
        if (currentPdfDoc) {
            alert('Tisch leeren!');
            return;
        }
        if (card.dataset.pdf) {
            card.classList.add('in-center');
            showPdfPages(card.dataset.pdf);
            lastCardIdFromCenter = card.dataset.cardid;  // Merke für saveDate
            // Reset Button wenn neue Karte ins CENTER kommt
            setSaveDateState(false, 'Karte ablegen: Q3 auto, sonst saveDate');
            console.log('Moved to center, lastCardIdFromCenter = ' + lastCardIdFromCenter);
        }
    } else if (isQuadrant) {
        event.currentTarget.appendChild(card);
        card.classList.remove('in-center');
        lastCardIdFromCenter = card.dataset.cardid;  // Merke für saveDate auch nach ablegen
        saveDateToXml(card.dataset.cardid, targetId);
        // Aktualisiere zuletztgespielt nur wenn zu Q3 (geübt) verschoben
        if (targetId === 'Q3') {
            savePlayedDateToXml(card.dataset.cardid);
            console.log('Updated played date when moving to Q3');
            resetSaveDateButtonStyle();
            setSaveDateState(false, 'Q3: Datum automatisch gesetzt');
        } else {
            setSaveDateState(true, 'Datum für letzte Karte offen');
            blinkSaveDateButton();
        }
        console.log('Moved to quadrant: ' + targetId + ', lastCardIdFromCenter = ' + lastCardIdFromCenter);
        renderBoard();
    }
}

function resetSaveDateButtonStyle() {
    const btn = document.getElementById('saveDateBtn');
    if (!btn) return;
    btn.style.backgroundColor = btn.disabled ? '#555' : '#3498db';
    btn.style.color = 'white';
    btn.style.fontWeight = btn.disabled ? 'normal' : 'bold';
    btn.style.outline = '';
    btn.style.outlineOffset = '';
    btn.style.marginLeft = 'auto';
}

function blinkSaveDateButton() {
    const btn = document.getElementById('saveDateBtn');
    if (!btn) return;

    if (saveDateBlinkTimer) {
        clearInterval(saveDateBlinkTimer);
        saveDateBlinkTimer = null;
    }

    resetSaveDateButtonStyle();

    let tick = 0;
    const maxTicks = 6; // 3x an/aus
    saveDateBlinkTimer = setInterval(() => {
        tick++;
        if (tick % 2 === 1) {
            btn.style.outline = '2px solid #f1c40f';
            btn.style.outlineOffset = '2px';
        } else {
            btn.style.outline = '';
            btn.style.outlineOffset = '';
        }

        if (tick >= maxTicks) {
            clearInterval(saveDateBlinkTimer);
            saveDateBlinkTimer = null;
            btn.style.outline = '';
            btn.style.outlineOffset = '';
        }
    }, 180);
}

function savePlayedDateToXml(cardId) {
    if (!xmlData) return;
    const card = getCardNodes()[parseInt(cardId)];
    if (!card) return;
    
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + 
                    String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                    String(now.getDate()).padStart(2, '0');
    
    let el = card.querySelector('zuletztgespielt');
    if (!el) {
        el = xmlData.createElement('zuletztgespielt');
        card.appendChild(el);
    }
    el.textContent = dateStr;
    markUnsavedChange();
    console.log('Saved played date: ' + dateStr + ' for card ' + cardId);
}

function saveDateToXml(cardId, quadrant) {
    if (!xmlData) return;
    const card = getCardNodes()[parseInt(cardId)];
    if (!card) return;
    
    const map = { 'Q1': 'zurückgestellt', 'Q2': 'wiederholen', 'Q3': 'geübt', 'Q4': 'gelernt' };
    let el = card.querySelector('Arbeitsstatus');
    if (!el) {
        el = xmlData.createElement('Arbeitsstatus');
        card.appendChild(el);
    }
    el.textContent = map[quadrant] || 'spielen';
    markUnsavedChange();
}


// Ordner zurücksetzen und neu auswählen
async function resetFolder() {
    try {
        const idb = await openIndexedDB();
        idb.put('folderHandle', null);
        localStorage.removeItem('folderName');
        localStorage.removeItem('folderSelected');
        xmlFileHandle = null;
        console.log('Ordner zurückgesetzt. Beim nächsten Speichern neu auswählen.');
        alert('Ordner zurückgesetzt. Beim nächsten Speichern neue Auswahl.');
    } catch (err) {
        console.error('Fehler beim Zurücksetzen:', err);
    }
}
async function saveXml() {
    if (!xmlData) return;
    
    const saveBtn = document.querySelector('button[onclick="saveXml()"]');
    const originalText = saveBtn ? saveBtn.textContent : '';
    
    try {
        // Feedback: Speichert...
        if (saveBtn) {
            saveBtn.textContent = ' SPEICHERT...';
            saveBtn.style.background = '#f39c12';
            saveBtn.disabled = true;
        }
        
        // Beim ersten Mal: Ordner auswählen und speichern
        if (!xmlFileHandle) {
            const folderHandle = await window.showDirectoryPicker();
            const fileName = xmlFileName || 'Notentisch.xml';
            
            // Speichere Ordner für nächsten Start
            await saveFolderHandle(folderHandle);
            
            // Datei im ausgewählten Ordner erstellen/überschreiben
            xmlFileHandle = await folderHandle.getFileHandle(fileName, { create: true });
        }
        
        // Direkt in die Datei schreiben (überschreibt)
        const writable = await xmlFileHandle.createWritable();
        await writable.write(new XMLSerializer().serializeToString(xmlData));
        await writable.close();
        console.log('XML gespeichert: ' + xmlFileName);
        hasUnsavedChanges = false;
        clearSafetyBackup();
        
        // Feedback: Erfolgreich
        if (saveBtn) {
            saveBtn.textContent = ' GESPEICHERT';
            saveBtn.style.background = '#27ae60';
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.style.background = '#3498db';
                saveBtn.disabled = false;
            }, 2000);
        }
    } catch (err) {
        // User hat abgebrochen oder API nicht unterstützt
        if (err.name !== 'AbortError') {
            console.error('Fehler beim Speichern:', err);
            // Feedback: Fehler
            if (saveBtn) {
                saveBtn.textContent = ' FEHLER';
                saveBtn.style.background = '#e74c3c';
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.style.background = '#3498db';
                    saveBtn.disabled = false;
                }, 2000);
            }
        } else {
            // User hat abgebrochen
            if (saveBtn) {
                saveBtn.textContent = originalText;
                saveBtn.style.background = '#3498db';
                saveBtn.disabled = false;
            }
        }
    }
}

// Lade gespeicherten Ordner beim Start
async function loadSavedFolder() {
    try {
        const savedHandle = await loadFolderHandle();
        if (savedHandle) {
            // Prüfe ob Berechtigung noch gültig ist
            const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                const fileName = xmlFileName || 'Notentisch.xml';
                xmlFileHandle = await savedHandle.getFileHandle(fileName, { create: true });
                console.log('Gespeicherter Ordner geladen');
                return true;
            }
        }
    } catch (err) {
        console.error('Fehler beim Laden des gespeicherten Ordners:', err);
    }
    return false;
}

function moveCardFromCenterTo(quadrantId) {
    const card = document.querySelector('.card-container.in-center');
    if (card && document.getElementById(quadrantId)) {
        document.getElementById(quadrantId).appendChild(card);
        card.classList.remove('in-center');
        lastCardIdFromCenter = card.dataset.cardid;
        saveDateToXml(card.dataset.cardid, quadrantId);
        if (quadrantId === 'Q3') {
            savePlayedDateToXml(card.dataset.cardid);
            resetSaveDateButtonStyle();
            setSaveDateState(false, 'Q3: Datum automatisch gesetzt');
        } else {
            setSaveDateState(true, 'Datum für letzte Karte offen');
            blinkSaveDateButton();
        }
        
        // PDF-Dokument komplett bereinigen
        currentPdfDoc = null;
        currentPdfPath = "";
        currentZoom = settings.defaultZoom;
        
        // CENTER leeren und PDF weg
        const centerContent = document.getElementById('center-content');
        if (centerContent) {
            centerContent.innerHTML = '<div style="text-align:center; color:#9aa; font-size:12px;">PDF im Center anzeigen</div>';
        }
        
        // Scroll-Buttons verstecken
        const scrollButtons = document.getElementById('scroll-buttons');
        if (scrollButtons) {
            scrollButtons.style.display = 'none';
        }

        renderBoard();
    }
}

function moveCardToQ2(event) {
    if (!event) return;
    const card = event.target.closest('.card-container');
    if (card) moveCardFromCenterTo('Q2');
}

function scrollQuadrant(id, direction) {
    const q = document.getElementById(id);
    if (q) q.scrollTop += (direction === 'down' ? 180 : -180);
}

function handleViewportResize() {
    updateStackLayout();
}


function saveDateNow() {
    // Verwende die cardId die beim Verschieben aus CENTER gespeichert wurde
    if (!lastCardIdFromCenter) {
        alert('Zuerst eine Karte ins CENTER ziehen und dann auf einen Quadranten ablegen');
        return;
    }
    
    const cardId = lastCardIdFromCenter;
    console.log('Saving date for card: ' + cardId);
    
    // Speichere das Datum
    savePlayedDateToXml(cardId);
    
    // Button wird grün und bleibt so
    const btn = document.getElementById('saveDateBtn');
    if (btn) {
        btn.style.backgroundColor = '#2d7c3a';
        btn.style.color = 'white';
        btn.style.fontWeight = 'bold';
        btn.style.marginLeft = 'auto';
        btn.style.outline = '';
        btn.style.outlineOffset = '';
        console.log('Button turned green');
    }
    setSaveDateState(false, 'Datum gespeichert');
    
    console.log('Played date saved for card ' + cardId);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupDropListeners();
        initializeStackControls();
        updateStackLayout();
        loadSavedFolder();
        setSaveDateState(false, 'Q3: Datum automatisch');
        restoreSafetyBackupIfAvailable();
        window.addEventListener('resize', handleViewportResize);
        window.addEventListener('beforeunload', (event) => {
            if (!hasUnsavedChanges) return;
            persistSafetyBackup();
            event.preventDefault();
            event.returnValue = '';
        });
    });
} else {
    setupDropListeners();
    initializeStackControls();
    updateStackLayout();
    loadSavedFolder();
    setSaveDateState(false, 'Q3: Datum automatisch');
    restoreSafetyBackupIfAvailable();
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('beforeunload', (event) => {
        if (!hasUnsavedChanges) return;
        persistSafetyBackup();
        event.preventDefault();
        event.returnValue = '';
    });
}

















