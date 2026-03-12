let xmlData = null;
let xmlFileName = null;
let xmlFileHandle = null;
let xmlFolderHandle = null;
let lastCardIdFromCenter = null;
let activeCenterCardId = null;
let saveDateBlinkTimer = null;
let saveWarnBlinkTimer = null;
let hasUnsavedChanges = false;
let isPlayMode = true;
let saveCenterSettingsModeActive = false;

function persistSafetyBackup() {}

function clearSafetyBackup() {}

function setSaveWarningState(active, message) {
    const saveBtn = document.getElementById('modeToggleBtn');
    const hint = document.getElementById('saveDateHint');

    if (saveWarnBlinkTimer) {
        clearInterval(saveWarnBlinkTimer);
        saveWarnBlinkTimer = null;
    }

    if (!saveBtn) return;

    saveBtn.style.border = '';
    saveBtn.style.outline = '';
    saveBtn.style.outlineOffset = '';
    saveBtn.style.boxShadow = '';
    saveBtn.style.opacity = '1';

    if (active) {
        let on = false;
        let toggles = 0;
        const maxToggles = 6;
        saveWarnBlinkTimer = setInterval(() => {
            on = !on;
            toggles++;
            saveBtn.style.outline = on ? '3px solid #ffd54a' : '3px solid transparent';
            saveBtn.style.outlineOffset = '1px';
            saveBtn.style.boxShadow = on ? '0 0 0 2px rgba(255, 213, 74, 0.35)' : '';

            if (toggles >= maxToggles) {
                clearInterval(saveWarnBlinkTimer);
                saveWarnBlinkTimer = null;
                saveBtn.style.outline = '';
                saveBtn.style.outlineOffset = '';
                saveBtn.style.boxShadow = '';
            }
        }, 260);
        if (hint) hint.textContent = message || '';
    } else {
        if (hint && message) hint.textContent = message;
    }
}

function markUnsavedChange() {
    hasUnsavedChanges = true;
}

function getModeHintText() {
    return isPlayMode
        ? 'Modus: Spielen (Datum automatisch)'
        : 'Modus: Sichten (kein Datum)';
}

function applyModeButtonState() {
    const btn = document.getElementById('modeToggleBtn');
    if (!btn) return;

    btn.textContent = isPlayMode ? 'Spielen' : 'Sichten';
    btn.style.background = isPlayMode ? '#27ae60' : '#3498db';
    btn.style.color = '#fff';
    btn.style.fontWeight = 'bold';
    btn.style.border = 'none';

    const hint = document.getElementById('saveDateHint');
    if (hint) hint.textContent = getModeHintText();
}

function togglePlayMode() {
    isPlayMode = !isPlayMode;
    applyModeButtonState();
}

function restoreSafetyBackupIfAvailable() {
    return false;
}

function setSaveDateState(enabled, hintText) {
    const btn = document.getElementById('saveDateBtn');
    const hint = document.getElementById('saveDateHint');
    if (btn) {
        btn.disabled = !enabled;
        btn.style.backgroundColor = enabled ? '' : '#6a7480';
        btn.style.color = 'white';
        btn.style.fontWeight = enabled ? 'bold' : 'normal';
        btn.style.marginLeft = 'auto';
        btn.style.border = '1px solid #a3b1c2';
        btn.style.opacity = '1';
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
        xmlFolderHandle = handle;
        
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
        const handle = await idb.get('folderHandle');
        if (handle) {
            xmlFolderHandle = handle;
        }
        return handle;
    } catch (err) {
        console.error('Fehler beim Laden des Handles:', err);
        return null;
    }
}

async function saveXmlDirectFileHandle(handle) {
    if (!handle) return;
    try {
        const idb = await openIndexedDB();
        await idb.put('xmlFileHandle', handle);
        if (handle.name) {
            localStorage.setItem('xmlLastFileName', handle.name);
        }
    } catch (err) {
        console.warn('XML-Datei-Handle konnte nicht gespeichert werden:', err);
    }
}

async function loadXmlDirectFileHandle() {
    try {
        const idb = await openIndexedDB();
        const handle = await idb.get('xmlFileHandle');
        return handle || null;
    } catch (err) {
        console.warn('XML-Datei-Handle konnte nicht geladen werden:', err);
        return null;
    }
}

async function ensureXmlFileHandle() {
    const fileName = xmlFileName || 'Notentisch.xml';

    if (xmlFileHandle) {
        return xmlFileHandle;
    }

    let folderHandle = xmlFolderHandle;
    if (!folderHandle) {
        folderHandle = await loadFolderHandle();
    }

    if (folderHandle) {
        try {
            let permission = await folderHandle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                permission = await folderHandle.requestPermission({ mode: 'readwrite' });
            }

            if (permission === 'granted') {
                xmlFolderHandle = folderHandle;
                xmlFileHandle = await folderHandle.getFileHandle(fileName, { create: false });
                return xmlFileHandle;
            }
        } catch (err) {
            console.warn('Gespeicherter Ordner/Datei nicht nutzbar, frage neu ab:', err);
            xmlFileHandle = null;
        }
    }

    const pickedFolder = await window.showDirectoryPicker();
    await saveFolderHandle(pickedFolder);

    try {
        xmlFileHandle = await pickedFolder.getFileHandle(fileName, { create: false });
    } catch {
        xmlFileHandle = await pickedFolder.getFileHandle(fileName, { create: true });
    }

    return xmlFileHandle;
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

function applyLoadedXml(xmlText, fileName, directHandle) {
    const parser = new DOMParser();
    xmlData = parser.parseFromString(xmlText, 'text/xml');
    xmlFileName = fileName || 'Notentisch.xml';
    if (directHandle) {
        xmlFileHandle = directHandle;
    }
    resetQuadrantOffsets();
    renderBoard();
    hasUnsavedChanges = false;
    clearSafetyBackup();
    setSaveWarningState(false, getModeHintText());
    setSaveDateState(false, getModeHintText());
}

async function openAndLoadXmlHandle(handle) {
    const file = await handle.getFile();
    const xmlText = await file.text();
    applyLoadedXml(xmlText, file.name || handle.name, handle);
    await saveXmlDirectFileHandle(handle);
}

async function handleLoadButton() {
    if (window.showOpenFilePicker) {
        let storedHandle = null;

        try {
            storedHandle = await loadXmlDirectFileHandle();
            if (storedHandle) {
                const permission = await storedHandle.queryPermission({ mode: 'read' });
                if (permission === 'granted') {
                    await openAndLoadXmlHandle(storedHandle);
                    return;
                }

                if (permission === 'prompt') {
                    const requested = await storedHandle.requestPermission({ mode: 'read' });
                    if (requested === 'granted') {
                        await openAndLoadXmlHandle(storedHandle);
                        return;
                    }
                }
            }
        } catch (err) {
            console.warn('Gespeicherte XML-Datei nicht nutzbar, öffne Explorer:', err);
        }

        try {
            const [pickedHandle] = await window.showOpenFilePicker({
                multiple: false,
                types: [{
                    description: 'XML',
                    accept: {
                        'application/xml': ['.xml'],
                        'text/xml': ['.xml']
                    }
                }]
            });

            if (pickedHandle) {
                await openAndLoadXmlHandle(pickedHandle);
            }
            return;
        } catch (err) {
            if (err && err.name !== 'AbortError') {
                console.error('Fehler beim XML-Laden:', err);
            }
            return;
        }
    }

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.click();
}

async function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (event.target) event.target.value = '';
    xmlFileHandle = null;  // Reset bei neuer Datei
    const xmlText = await file.text();
    applyLoadedXml(xmlText, file.name, null);
}

const MAX_STACK_CARDS = 10;


function getCardNodes() {
    if (!xmlData) return [];
    return xmlData.querySelectorAll('NotenTisch, Notentisch');
}

function getCardNodeById(cardId) {
    if (!xmlData) return null;
    const index = parseInt(cardId, 10);
    if (!Number.isFinite(index)) return null;
    return getCardNodes()[index] || null;
}

function readCenterSettingsFromXml(cardId) {
    const cardNode = getCardNodeById(cardId);
    if (!cardNode) return null;

    const centerNode = cardNode.querySelector('CenterAnsicht');
    if (!centerNode) return null;

    const zoomText = centerNode.querySelector('Zoom')?.textContent || '';
    const alignText = centerNode.querySelector('Align')?.textContent || '';
    const focusText = centerNode.querySelector('ZoomFokus')?.textContent || '';
    const posRelXText = centerNode.querySelector('PosRelX')?.textContent || '';
    const posRelYText = centerNode.querySelector('PosRelY')?.textContent || '';
    const zoom = Number(zoomText);
    const posRelX = Number(posRelXText);
    const posRelY = Number(posRelYText);

    return {
        zoom: Number.isFinite(zoom) ? zoom : null,
        align: alignText || null,
        zoomFocus: focusText || null,
        posRelX: Number.isFinite(posRelX) ? Math.max(0, Math.min(1, posRelX)) : null,
        posRelY: Number.isFinite(posRelY) ? Math.max(0, Math.min(1, posRelY)) : null
    };
}

function applyCenterSettingsFromXml(cardId) {
    const settingsFromXml = readCenterSettingsFromXml(cardId);
    if (!settingsFromXml) return;
    if (typeof applyCenterViewSettings === 'function') {
        applyCenterViewSettings(settingsFromXml, { rerender: false });
    }
}

function writeCenterSettingsToCardNode(cardId) {
    if (!xmlData) return false;
    if (typeof getCurrentCenterViewSettings !== 'function') return false;

    const cardNode = getCardNodeById(cardId);
    if (!cardNode) return false;

    const currentView = getCurrentCenterViewSettings();

    let centerNode = cardNode.querySelector('CenterAnsicht');
    if (!centerNode) {
        centerNode = xmlData.createElement('CenterAnsicht');
        cardNode.appendChild(centerNode);
    }

    function upsertCenterChild(tagName, value) {
        let child = centerNode.querySelector(tagName);
        if (!child) {
            child = xmlData.createElement(tagName);
            centerNode.appendChild(child);
        }
        child.textContent = String(value ?? '');
    }

    function upsertCardChild(tagName, value) {
        let child = cardNode.querySelector(tagName);
        if (!child) {
            child = xmlData.createElement(tagName);
            cardNode.appendChild(child);
        }
        child.textContent = String(value ?? '');
    }

    upsertCenterChild('Zoom', Number(currentView.zoom || 1).toFixed(3));
    upsertCenterChild('Align', currentView.align || 'left');
    upsertCenterChild('ZoomFokus', currentView.zoomFocus || 'left-top');
    upsertCenterChild('PosRelX', Number(currentView.posRelX ?? 0).toFixed(4));
    upsertCenterChild('PosRelY', Number(currentView.posRelY ?? 0).toFixed(4));

    upsertCardChild('CenterAnsichtChanged', '1');
    markUnsavedChange();
    return true;
}

function updateSaveCenterSettingsButtonState() {
    const btn = document.getElementById('saveCenterSettingsBtn');
    if (!btn) return;

    btn.style.background = saveCenterSettingsModeActive ? getToggleStepColor(1) : '';
    btn.style.color = '#fff';
}

function toggleSaveCenterSettingsMode() {
    saveCenterSettingsModeActive = !saveCenterSettingsModeActive;
    updateSaveCenterSettingsButtonState();
    setStatusText(saveCenterSettingsModeActive
        ? 'Save Zoom aktiv: automatische Übernahme/Speicherung.'
        : 'Save Zoom aus: keine automatische Übernahme/Speicherung.');
}

function setStatusText(text) {
    const hint = document.getElementById('saveDateHint');
    if (!hint) return;
    hint.textContent = text;
    setTimeout(() => {
        if (hint.textContent === text) {
            hint.textContent = getModeHintText();
        }
    }, 2200);
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

function getPdfPathCandidates(pdfPath, titel = '') {
    const rawPath = String(pdfPath || '');
    const hashParts = rawPath.split('#').map(p => p.trim()).filter(Boolean);
    const pdfParts = hashParts.filter(p => p.toLowerCase().includes('.pdf'));

    const titleBase = String(titel || '').trim();
    const titleVariants = titleBase
        ? [
            titleBase,
            titleBase.replace(/\s+$/, ''),
            titleBase.replace(/\s+/g, ' ').trim(),
            titleBase.replace(/[\\/:*?"<>|]/g, '').trim()
        ]
        : [];

    titleVariants.forEach(v => {
        if (!v) return;
        const withPdf = v.toLowerCase().endsWith('.pdf') ? v : v + '.pdf';
        pdfParts.push(withPdf);
    });

    let actualPath = rawPath;
    if (pdfParts.length) {
        const relativeCandidate = pdfParts.find(p => !/^[a-zA-Z]:[\\/]/.test(p));
        actualPath = relativeCandidate || pdfParts[0];
    }

    const normalize = (input) => {
        if (!input) return '';
        if (typeof normalizePdfServerPathV2 === 'function') return normalizePdfServerPathV2(input);
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
            'Blätter/' + name,
            'Noten/Blätter/' + name,
            'Noten/' + name
        ])
    ].filter(Boolean);
}

const pdfPathAttemptCache = new Map();

function loadCardImageFromPdf(imgElement, pdfPath, titel = '') {
    if (!pdfPath || typeof pdfjsLib === 'undefined') {
        if (typeof pdfjsLib === 'undefined') {
            imgElement.style.backgroundColor = '#aaa';
            return;
        }
    }

    const paths = getPdfPathCandidates(pdfPath, titel);
    let pathIndex = 0;

    function encodePath(pathValue) {
        if (!pathValue) return '';
        const safeDecode = (segment) => {
            try {
                return decodeURIComponent(segment);
            } catch {
                return segment;
            }
        };

        return String(pathValue)
            .split('/')
            .filter(part => part !== '')
            .map(part => encodeURIComponent(safeDecode(part)))
            .join('/');
    }

    function tryNextPdf() {
        if (pathIndex >= paths.length) {
            imgElement.style.backgroundColor = '#aaa';
            return;
        }

        const serverPath = encodePath(paths[pathIndex]);

        if (pdfPathAttemptCache.get(serverPath) === false) {
            pathIndex++;
            tryNextPdf();
            return;
        }

        pdfjsLib.getDocument(serverPath).promise
            .then(pdf => pdf.getPage(1))
            .then(page => {
                pdfPathAttemptCache.set(serverPath, true);
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
                pdfPathAttemptCache.set(serverPath, false);
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
            loadCardImageFromPdf(imgElement, pdfPath, titel);
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

function getUserConfigForDropBehavior() {
    if (typeof loadUserConfig === 'function') {
        return loadUserConfig();
    }
    return {
        useZoomSettingsOnDrop: true,
        dropGlowDurationMs: 1400
    };
}

function placeCardAtTopOfQuadrant(targetQuadrant, card) {
    if (!targetQuadrant || !card) return;
    const firstCard = targetQuadrant.querySelector('.card-container');
    if (firstCard) {
        targetQuadrant.insertBefore(card, firstCard);
        return;
    }
    const controls = targetQuadrant.querySelector('.quadrant-stack-controls');
    if (controls) {
        targetQuadrant.insertBefore(card, controls);
        return;
    }
    targetQuadrant.appendChild(card);
}

function applyDropGlow(cardElement, durationMs) {
    if (!cardElement) return;
    const duration = Math.max(0, Math.floor(Number(durationMs) || 0));
    if (duration <= 0) return;

    cardElement.classList.remove('drop-glow');
    void cardElement.offsetWidth;
    cardElement.classList.add('drop-glow');

    setTimeout(() => {
        cardElement.classList.remove('drop-glow');
    }, duration);
}

function clearCenterAfterCardExit() {
    if (typeof currentPdfDoc !== 'undefined') currentPdfDoc = null;
    if (typeof currentPdfPath !== 'undefined') currentPdfPath = '';
    if (typeof totalPages !== 'undefined') totalPages = 0;
    if (typeof currentPageOffset !== 'undefined') currentPageOffset = 0;
    const centerContainer = document.getElementById('center-content');
    if (centerContainer) {
        centerContainer.innerHTML = '';
    }
    if (typeof updatePageInfo === 'function') {
        updatePageInfo([]);
    }
    if (typeof updateScrollButtons === 'function') {
        updateScrollButtons();
    }
    updateSaveCenterSettingsButtonState();
}

function captureCenterVisualSnapshot() {
    const centerContainer = document.getElementById('center-content');
    const pageInfo = document.getElementById('pageInfo');
    if (!centerContainer) return null;

    const canvases = Array.from(centerContainer.querySelectorAll('#center-pages-host canvas'));
    if (!canvases.length) return null;

    const pages = canvases.map((canvas) => ({
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.style.width || '',
        height: canvas.style.height || ''
    }));

    return {
        pages,
        pageInfoText: pageInfo ? pageInfo.textContent : '',
        scrollLeft: centerContainer.scrollLeft || 0,
        scrollTop: centerContainer.scrollTop || 0
    };
}

function restoreCenterVisualSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.pages) || !snapshot.pages.length) return false;
    const centerContainer = document.getElementById('center-content');
    if (!centerContainer) return false;

    const host = document.createElement('div');
    host.id = 'center-pages-host';
    host.style.display = 'flex';
    host.style.alignItems = 'flex-start';

    snapshot.pages.forEach((page) => {
        if (!page || !page.dataUrl) return;
        const img = document.createElement('img');
        img.src = page.dataUrl;
        img.style.width = page.width || 'auto';
        img.style.height = page.height || 'auto';
        img.style.border = '1px solid #555';
        img.style.borderRadius = '4px';
        img.style.margin = '2px';
        host.appendChild(img);
    });

    centerContainer.innerHTML = '';
    centerContainer.appendChild(host);

    if (Number.isFinite(Number(snapshot.scrollLeft))) {
        centerContainer.scrollLeft = Number(snapshot.scrollLeft);
    }
    if (Number.isFinite(Number(snapshot.scrollTop))) {
        centerContainer.scrollTop = Number(snapshot.scrollTop);
    }

    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo && typeof snapshot.pageInfoText === 'string') {
        pageInfo.textContent = snapshot.pageInfoText;
    }

    if (typeof updateScrollButtons === 'function') {
        setTimeout(() => updateScrollButtons(), 30);
    }

    return true;
}

function getBoardSnapshotForConfig() {
    if (!xmlData) return null;

    let xmlText = '';
    try {
        xmlText = new XMLSerializer().serializeToString(xmlData);
    } catch {
        return null;
    }

    return {
        xmlText,
        xmlFileName: xmlFileName || null,
        quadrantOffsets: { ...quadrantOffsets },
        quadrantMarkup: {
            Q1: document.getElementById('Q1') ? document.getElementById('Q1').innerHTML : '',
            Q2: document.getElementById('Q2') ? document.getElementById('Q2').innerHTML : '',
            Q3: document.getElementById('Q3') ? document.getElementById('Q3').innerHTML : '',
            Q4: document.getElementById('Q4') ? document.getElementById('Q4').innerHTML : ''
        },
        centerVisual: captureCenterVisualSnapshot(),
        stackCount: getStackCount(),
        lastCardIdFromCenter,
        activeCenterCardId
    };
}

function restoreBoardSnapshotFromConfig(snapshot) {
    if (!snapshot || !snapshot.xmlText) return false;

    try {
        const parsedXml = new DOMParser().parseFromString(snapshot.xmlText, 'text/xml');
        xmlData = parsedXml;
        if (snapshot.xmlFileName) {
            xmlFileName = snapshot.xmlFileName;
        }
    } catch {
        return false;
    }

    if (snapshot.quadrantOffsets && typeof snapshot.quadrantOffsets === 'object') {
        quadrantOffsets = {
            Q1: Number.isFinite(Number(snapshot.quadrantOffsets.Q1)) ? Number(snapshot.quadrantOffsets.Q1) : 0,
            Q2: Number.isFinite(Number(snapshot.quadrantOffsets.Q2)) ? Number(snapshot.quadrantOffsets.Q2) : 0,
            Q3: Number.isFinite(Number(snapshot.quadrantOffsets.Q3)) ? Number(snapshot.quadrantOffsets.Q3) : 0,
            Q4: Number.isFinite(Number(snapshot.quadrantOffsets.Q4)) ? Number(snapshot.quadrantOffsets.Q4) : 0
        };
    }

    const stackInput = document.getElementById('stackCount');
    if (stackInput && Number.isFinite(Number(snapshot.stackCount))) {
        stackInput.value = String(Math.max(1, Math.min(MAX_STACK_CARDS, Number(snapshot.stackCount))));
    }

    lastCardIdFromCenter = snapshot.lastCardIdFromCenter ?? null;
    activeCenterCardId = snapshot.activeCenterCardId ?? null;

    const hasQuadrantMarkup = !!(snapshot.quadrantMarkup && typeof snapshot.quadrantMarkup === 'object');
    if (hasQuadrantMarkup) {
        ['Q1', 'Q2', 'Q3', 'Q4'].forEach((id) => {
            const target = document.getElementById(id);
            if (!target) return;
            target.innerHTML = String(snapshot.quadrantMarkup[id] || '');
            const cards = target.querySelectorAll('.card-container');
            cards.forEach((card) => {
                card.addEventListener('dragstart', drag);
                card.addEventListener('dblclick', moveCardToQ2);
            });
        });
        setupDropListeners();
        updateStackLayout();
    } else {
        renderBoard();
        updateStackLayout();
    }

    if (activeCenterCardId !== null && activeCenterCardId !== undefined) {
        const centerCard = document.querySelector('.card-container[data-cardid="' + activeCenterCardId + '"]');
        if (centerCard) {
            centerCard.classList.add('in-center');
        }
    }

    const centerVisualRestored = restoreCenterVisualSnapshot(snapshot.centerVisual);

    return {
        restored: true,
        centerVisualRestored
    };
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
            const userConfig = getUserConfigForDropBehavior();
            card.classList.add('in-center');
            lastCardIdFromCenter = card.dataset.cardid;  // Merke für saveDate
            activeCenterCardId = card.dataset.cardid;
            if (saveCenterSettingsModeActive) {
                applyCenterSettingsFromXml(card.dataset.cardid);
            }
            showPdfPages(card.dataset.pdf);
            // Reset Button wenn neue Karte ins CENTER kommt
            setSaveDateState(false, getModeHintText());
            console.log('Moved to center, lastCardIdFromCenter = ' + lastCardIdFromCenter);
        }
    } else if (isQuadrant) {
        const userConfig = getUserConfigForDropBehavior();
        const cameFromCenter = card.classList.contains('in-center');
        if (cameFromCenter && saveCenterSettingsModeActive) {
            writeCenterSettingsToCardNode(card.dataset.cardid);
        }
        placeCardAtTopOfQuadrant(event.currentTarget, card);
        card.classList.remove('in-center');
        applyDropGlow(card, userConfig.dropGlowDurationMs);
        lastCardIdFromCenter = card.dataset.cardid;  // Merke für saveDate auch nach ablegen
        if (cameFromCenter) {
            activeCenterCardId = null;
            clearCenterAfterCardExit();
        }
        saveDateToXml(card.dataset.cardid, targetId);
        if (isPlayMode) {
            savePlayedDateToXml(card.dataset.cardid);
        }
        saveXml(true);
        console.log('Moved to quadrant: ' + targetId + ', lastCardIdFromCenter = ' + lastCardIdFromCenter);
        updateStackLayout();
    }
}

function resetSaveDateButtonStyle() {
    const btn = document.getElementById('saveDateBtn');
    if (!btn) return;
    btn.style.backgroundColor = btn.disabled ? '#555' : '';
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
async function saveXml(silent = true) {
    if (!xmlData) return;
    
    const saveBtn = document.getElementById('modeToggleBtn');
    const originalText = saveBtn ? saveBtn.textContent : '';
    
    try {
        // Feedback: Speichert...
        if (!silent && saveBtn) {
            saveBtn.textContent = ' SPEICHERT...';
            saveBtn.style.background = '#f39c12';
            saveBtn.disabled = true;
        }
        
        // Wiederverwendung des gespeicherten Ordners; neue Abfrage nur bei fehlender XML/Berechtigung
        await ensureXmlFileHandle();
        
        // Direkt in die Datei schreiben (überschreibt)
        const writable = await xmlFileHandle.createWritable();
        await writable.write(new XMLSerializer().serializeToString(xmlData));
        await writable.close();
        console.log('XML gespeichert: ' + xmlFileName);
        hasUnsavedChanges = false;
        clearSafetyBackup();
        setSaveWarningState(false, getModeHintText());
        
        if (!silent && saveBtn) {
            saveBtn.textContent = ' GESPEICHERT';
            saveBtn.style.background = '#27ae60';
            setTimeout(() => {
                saveBtn.textContent = originalText;
                applyModeButtonState();
                saveBtn.disabled = false;
            }, 2000);
        }
    } catch (err) {
        // User hat abgebrochen oder API nicht unterstützt
        if (err.name !== 'AbortError') {
            console.error('Fehler beim Speichern:', err);
            // Feedback: Fehler
            if (!silent && saveBtn) {
                saveBtn.textContent = ' FEHLER';
                saveBtn.style.background = '#e74c3c';
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    applyModeButtonState();
                    saveBtn.disabled = false;
                }, 2000);
            }
        } else {
            // User hat abgebrochen
            if (!silent && saveBtn) {
                saveBtn.textContent = originalText;
                applyModeButtonState();
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
                xmlFolderHandle = savedHandle;
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
    let card = null;
    if (activeCenterCardId !== null && activeCenterCardId !== undefined) {
        card = document.querySelector('.card-container[data-cardid="' + activeCenterCardId + '"]');
    }
    if (!card) {
        card = document.querySelector('.card-container.in-center');
    }
    if (!card && lastCardIdFromCenter !== null && lastCardIdFromCenter !== undefined) {
        card = document.querySelector('.card-container[data-cardid="' + lastCardIdFromCenter + '"]');
    }
    const targetQuadrant = document.getElementById(quadrantId);
    if (card && targetQuadrant) {
        const userConfig = getUserConfigForDropBehavior();
        if (saveCenterSettingsModeActive && card.classList.contains('in-center')) {
            writeCenterSettingsToCardNode(card.dataset.cardid);
        }
        placeCardAtTopOfQuadrant(targetQuadrant, card);
        card.classList.remove('in-center');
        applyDropGlow(card, userConfig.dropGlowDurationMs);
        activeCenterCardId = null;
        clearCenterAfterCardExit();
        lastCardIdFromCenter = card.dataset.cardid;
        saveDateToXml(card.dataset.cardid, quadrantId);
        if (isPlayMode) {
            savePlayedDateToXml(card.dataset.cardid);
        }
        saveXml(true);

        updateStackLayout();
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

function shouldSkipAutoLoadSavedFolder() {
    try {
        if (sessionStorage.getItem('notentischSkipAutoLoadSavedFolder') === '1') {
            sessionStorage.removeItem('notentischSkipAutoLoadSavedFolder');
            return true;
        }
        return !!sessionStorage.getItem('notentischBoardSessionState');
    } catch {
        return false;
    }
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
        if (!shouldSkipAutoLoadSavedFolder()) {
            loadSavedFolder();
        }
        applyModeButtonState();
        restoreSafetyBackupIfAvailable();
        updateSaveCenterSettingsButtonState();
        window.addEventListener('resize', handleViewportResize);
    });
} else {
    setupDropListeners();
    initializeStackControls();
    updateStackLayout();
    if (!shouldSkipAutoLoadSavedFolder()) {
        loadSavedFolder();
    }
    applyModeButtonState();
    restoreSafetyBackupIfAvailable();
    updateSaveCenterSettingsButtonState();
    window.addEventListener('resize', handleViewportResize);
}

















