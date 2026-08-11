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
let overviewModeActive = false;
let overviewCenterRuntimeState = null;
const OVERVIEW_MODE_STATE_KEY = 'notentischOverviewModeState';

function getRenderApi() {
    return window.NotentischRender || null;
}

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

function getQuadrantIdFromStatus(statusText) {
    const status = String(statusText || '').toLowerCase();
    if (status.includes('wiederholen')) return 'Q2';
    if (status.includes('geübt') || status.includes('geubt')) return 'Q3';
    if (status.includes('gelernt')) return 'Q4';
    return 'Q1';
}

function getQuadrantIdForCardId(cardId) {
    const cardNode = getRenderApi()?.getCardNodeById?.(cardId) || null;
    if (!cardNode) return 'Q1';
    return getQuadrantIdFromStatus(cardNode.querySelector('Arbeitsstatus')?.textContent || '');
}


function persistOverviewModeState() {
    try {
        localStorage.setItem(OVERVIEW_MODE_STATE_KEY, overviewModeActive ? '1' : '0');
    } catch (e) {}
}

function applyOverviewModeState() {
    const body = document.body;
    if (!body) return;

    body.classList.toggle('overview-mode', overviewModeActive);

    const btn = document.getElementById('overviewBtn');
    if (btn) {
        btn.textContent = 'Übersicht';
        btn.style.background = overviewModeActive ? '#27ae60' : '#3498db';
        btn.style.color = '#fff';
        btn.style.fontWeight = 'bold';
        btn.style.border = 'none';
    }

    const centerModeControls = ['wideBtn', 'alignBtn', 'saveCenterSettingsBtn'];
    centerModeControls.forEach((id) => {
        const control = document.getElementById(id);
        if (control) {
            control.disabled = overviewModeActive;
            control.style.opacity = overviewModeActive ? '0.55' : '1';
        }
    });
}

function restoreOverviewModeState() {
    try {
        const stored = localStorage.getItem(OVERVIEW_MODE_STATE_KEY);
        overviewModeActive = (stored === '1');
    } catch (e) {
        overviewModeActive = false;
    }
    applyOverviewModeState();
}

function moveCenterCardBackToStatusStack() {
    let card = null;
    if (activeCenterCardId !== null && activeCenterCardId !== undefined) {
        card = document.querySelector('.card-container[data-cardid="' + activeCenterCardId + '"]');
    }
    if (!card) {
        card = document.querySelector('.card-container.in-center[data-cardid]');
    }
    if (!card) return;

    const cardId = String(card.dataset.cardid || '').trim();
    if (!cardId) return;

    const targetQuadrantId = getQuadrantIdForCardId(cardId);
    const movedCard = moveCardToQuadrant(cardId, targetQuadrantId);
    if (!movedCard) return;

    movedCard.classList.remove('in-center');
    activeCenterCardId = null;
    lastCardIdFromCenter = cardId;
    clearCenterAfterCardExit();
}

function toggleOverviewMode() {
    const wasOverviewMode = overviewModeActive;
    const enteringOverview = !overviewModeActive;
    const selectedCenterCardId = wasOverviewMode
        ? (
            (activeCenterCardId !== null && activeCenterCardId !== undefined && String(activeCenterCardId).trim())
            || (document.querySelector('.card-container.in-center[data-cardid]')?.dataset?.cardid || '').trim()
        )
        : '';

    if (enteringOverview) {
        try {
            overviewCenterRuntimeState = (typeof getCurrentCenterRuntimeState === 'function')
                ? getCurrentCenterRuntimeState()
                : null;
        } catch (e) {
            overviewCenterRuntimeState = null;
        }
    }

    overviewModeActive = !overviewModeActive;
    persistOverviewModeState();
    applyOverviewModeState();

    const renderApi = getRenderApi();
    renderApi?.resetQuadrantOffsets?.();
    renderApi?.renderBoard?.();

    // Beim Beenden der Übersicht die aktive Center-Karte explizit wiederherstellen.
    if (wasOverviewMode && selectedCenterCardId) {
        showCardInCenterById(selectedCenterCardId);

        // Falls dieselbe Karte bereits vor der Übersicht im Center war,
        // stelle die vorherige Position/Vergrößerung exakt wieder her.
        try {
            const savedState = overviewCenterRuntimeState;
            if (
                savedState &&
                String(savedState?.pdfPath || '').trim() &&
                String(selectedCenterCardId).trim() === String(lastCardIdFromCenter || '').trim() &&
                typeof restoreCenterRuntimeState === 'function'
            ) {
                restoreCenterRuntimeState(savedState, { preserveConfiguredFocus: true });
            }
        } catch (e) {
            // Fallback bleibt die normale Center-Öffnung mit gespeicherten XML-Werten.
        }
    }

    if (wasOverviewMode) {
        overviewCenterRuntimeState = null;
    }

    renderApi?.updateStackLayout?.();

    if (overviewModeActive) {
        ['Q1', 'Q2', 'Q3', 'Q4'].forEach((quadrantId) => {
            const quadrant = document.getElementById(quadrantId);
            if (!quadrant) return;
            quadrant.scrollTop = 0;
        });
    }
}

function showCardInCenterById(cardId) {
    const cardIdStr = String(cardId || '').trim();
    if (!cardIdStr) return;

    let cardEl = document.querySelector('.card-container[data-cardid="' + cardIdStr + '"]');
    if (!cardEl) {
        cardEl = getRenderApi()?.ensureCardElementById?.(cardIdStr) || null;
    }
    if (!cardEl) return;

    if (!cardEl.dataset.pdf) {
        setStatusText('Für dieses Blatt ist keine PDF hinterlegt.');
        return;
    }

    const userConfig = getUserConfigForDropBehavior();
    const shouldApplyStoredCenterView = !!(saveCenterSettingsModeActive || userConfig.useZoomSettingsOnDrop);

    if (typeof discardCenterPendingScrollState === 'function') {
        discardCenterPendingScrollState();
    }

    document.querySelectorAll('.card-container.in-center').forEach((el) => el.classList.remove('in-center'));
    cardEl.classList.add('in-center');
    lastCardIdFromCenter = cardIdStr;
    activeCenterCardId = cardIdStr;

    if (shouldApplyStoredCenterView) {
        applyCenterSettingsFromXml(cardIdStr);
    }

    if (typeof showPdfPages === 'function') {
        showPdfPages(cardEl.dataset.pdf);
    }

    setSaveDateState(false, getModeHintText());
    getRenderApi()?.updateStackLayout?.();
}

function handleCardDoubleClick(event) {
    const cardEl = event?.currentTarget || null;
    const cardId = cardEl?.dataset?.cardid;
    if (!cardId) {
        moveCardToQ2(event);
        return;
    }

    if (!overviewModeActive) {
        moveCardToQ2(event);
        return;
    }

    // In der Übersicht den Modus NICHT automatisch verlassen.
    // Karte geht trotzdem ins Center und kann später per Klick auf einen Stapel
    // wieder zurückgelegt werden (moveCardFromCenterTo via Quadrant-Click).
    showCardInCenterById(cardId);
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

async function ensureXmlFileHandle(options = {}) {
    const allowPicker = options.allowPicker !== false;
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

    if (!allowPicker) {
        return null;
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
    getRenderApi()?.resetCardRenderCache();
    xmlFileName = fileName || 'Notentisch.xml';
    if (directHandle) {
        xmlFileHandle = directHandle;
    }
    getRenderApi()?.resetQuadrantOffsets();
    getRenderApi()?.renderBoard();
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

// ---------------------------------------------------------------------------
// Verzeichnis-Management: User kann Blätter, Cards_Export, Werkstatt picken
// ---------------------------------------------------------------------------
let blaetterDirHandle = null;
let cardsExportDirHandle = null;
let werkstattDirHandle = null;

async function pickBlaetterDir() {
    if (!window.showDirectoryPicker) {
        alert('Dein Browser unterstützt Directory Picker nicht.');
        return;
    }
    try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        blaetterDirHandle = handle;
        updateDirDisplay();
    } catch (err) {
        if (err && err.name !== 'AbortError') console.warn('Blätter-Verzeichnis Fehler:', err);
    }
}

async function pickCardsExportDir() {
    if (!window.showDirectoryPicker) {
        alert('Dein Browser unterstützt Directory Picker nicht.');
        return;
    }
    try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        cardsExportDirHandle = handle;
        updateDirDisplay();
    } catch (err) {
        if (err && err.name !== 'AbortError') console.warn('Cards-Verzeichnis Fehler:', err);
    }
}

async function pickWerkstattDir() {
    if (!window.showDirectoryPicker) {
        alert('Dein Browser unterstützt Directory Picker nicht.');
        return;
    }
    try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        werkstattDirHandle = handle;
        updateDirDisplay();
    } catch (err) {
        if (err && err.name !== 'AbortError') console.warn('Werkstatt-Verzeichnis Fehler:', err);
    }
}

function updateDirDisplay() {
    const blaetterEl = document.getElementById('blaetterDirDisplay');
    const cardsEl = document.getElementById('cardsExportDirDisplay');
    const werkstattEl = document.getElementById('werkstattDirDisplay');

    if (blaetterEl) {
        blaetterEl.textContent = blaetterDirHandle ? ('📁 ' + blaetterDirHandle.name) : '(nicht gewählt)';
        blaetterEl.style.color = blaetterDirHandle ? '#52be80' : '#888';
    }
    if (cardsEl) {
        cardsEl.textContent = cardsExportDirHandle ? ('📁 ' + cardsExportDirHandle.name) : '(nicht gewählt)';
        cardsEl.style.color = cardsExportDirHandle ? '#52be80' : '#888';
    }
    if (werkstattEl) {
        werkstattEl.textContent = werkstattDirHandle ? ('📁 ' + werkstattDirHandle.name) : '(nicht gewählt)';
        werkstattEl.style.color = werkstattDirHandle ? '#52be80' : '#888';
    }
}

window.addEventListener('load', updateDirDisplay);

// ---------------------------------------------------------------------------
// Optionaler PDF-Import: erzeugt eine neue XML aus einem Blätter-Ordner oder
// ergänzt fehlende Einträge. Wird nur aufgerufen wenn kein XML geladen wurde.
// ---------------------------------------------------------------------------
async function offerPdfImportIfMissing() {
    if (!window.showDirectoryPicker) return; // API nicht verfügbar

    const isFresh = !xmlData;
    const msg = isFresh
        ? 'Kein XML gewählt. Soll eine neue XML aus einem PDF-Ordner erstellt werden?'
        : 'Sollen neue PDFs aus dem Blätter-Ordner als Einträge ergänzt werden?\n\n(Nur fehlende Titel werden hinzugefügt – vorhandene Einträge bleiben unverändert.)';

    const doImport = confirm(msg);
    if (!doImport) return;

    // Frische XML-Struktur anlegen wenn noch keine vorhanden
    if (isFresh) {
        const timestamp = new Date().toISOString().replace('T', 'T').slice(0, 19);
        const parser = new DOMParser();
        xmlData = parser.parseFromString(
            '<?xml version="1.0" encoding="UTF-8"?><dataroot xmlns:od="urn:schemas-microsoft-com:officedata" generated="' + timestamp + '"></dataroot>',
            'text/xml'
        );
        getRenderApi()?.resetCardRenderCache();
        xmlFileName = 'Notentisch-Neu.xml';
        xmlFileHandle = null;
    }

    let dirHandle;
    try {
        dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (err) {
        if (err && err.name !== 'AbortError') console.warn('PDF-Import abgebrochen:', err);
        return;
    }

    // Alle bekannten PDF-Dateinamen aus der XML sammeln (normalisiert)
    const knownFileNames = new Set();
    xmlData.querySelectorAll('NotenTisch, Notentisch').forEach(node => {
        const sp = node.querySelector('Speicherort')?.textContent || '';
        sp.split('#').forEach(part => {
            const p = part.trim();
            if (p.toLowerCase().endsWith('.pdf')) {
                knownFileNames.add(p.split(/[\\/]/).pop().toLowerCase().trim());
            }
        });
    });

    // PDFs im gewählten Ordner einlesen
    const newEntries = [];
    let maxId = 0;
    xmlData.querySelectorAll('NotenTisch, Notentisch').forEach(node => {
        const id = parseInt(node.querySelector('NotID')?.textContent || '0', 10);
        if (id > maxId) maxId = id;
    });

    for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'file') continue;
        if (!entry.name.toLowerCase().endsWith('.pdf')) continue;
        if (knownFileNames.has(entry.name.toLowerCase().trim())) continue;

        const title = entry.name.replace(/\.pdf$/i, '');
        // Speicherort: Titel#Dateiname.pdf# (relativ, da Vollpfad im Browser unbekannt)
        const speicherort = title + '#' + entry.name + '#';

        maxId++;
        const node = xmlData.createElement('NotenTisch');
        node.innerHTML =
            '<NotID>' + maxId + '</NotID>' +
            '<Arbeitsstatus>zur\u00fcckgestellt</Arbeitsstatus>' +
            '<Titel>' + title.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</Titel>' +
            '<zuletztgespielt/>' +
            '<Speicherort>' + speicherort.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</Speicherort>';
        newEntries.push(node);
    }

    if (newEntries.length === 0) {
        alert('Keine neuen PDFs gefunden – alle sind bereits in der XML enthalten.');
        return;
    }

    const root = xmlData.documentElement;
    newEntries.forEach(n => root.appendChild(n));
    getRenderApi()?.resetCardRenderCache();
    getRenderApi()?.renderBoard();
    markUnsavedChange();
    alert(newEntries.length + ' neue Einträge hinzugefügt. Bitte XML speichern.');
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
            } else {
                // Kein XML gewählt – PDF-Import anbieten
                await offerPdfImportIfMissing();
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

function getCardNodeById(cardId) {
    return getRenderApi()?.getCardNodeById(cardId) || null;
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
    const viewportWidthText = centerNode.querySelector('ViewportWidth')?.textContent || '';
    const viewportHeightText = centerNode.querySelector('ViewportHeight')?.textContent || '';
    const screenWidthText = centerNode.querySelector('ScreenWidth')?.textContent || '';
    const screenHeightText = centerNode.querySelector('ScreenHeight')?.textContent || '';
    const zoom = Number(zoomText);
    const posRelX = Number(posRelXText);
    const posRelY = Number(posRelYText);
    const viewportWidth = Number(viewportWidthText);
    const viewportHeight = Number(viewportHeightText);
    const screenWidth = Number(screenWidthText);
    const screenHeight = Number(screenHeightText);

    return {
        zoom: Number.isFinite(zoom) ? zoom : null,
        align: alignText || null,
        zoomFocus: focusText || null,
        posRelX: Number.isFinite(posRelX) ? Math.max(0, Math.min(1, posRelX)) : null,
        posRelY: Number.isFinite(posRelY) ? Math.max(0, Math.min(1, posRelY)) : null,
        viewportWidth: Number.isFinite(viewportWidth) && viewportWidth > 0 ? Math.round(viewportWidth) : null,
        viewportHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? Math.round(viewportHeight) : null,
        screenWidth: Number.isFinite(screenWidth) && screenWidth > 0 ? Math.round(screenWidth) : null,
        screenHeight: Number.isFinite(screenHeight) && screenHeight > 0 ? Math.round(screenHeight) : null
    };
}

function applyCenterSettingsFromXml(cardId) {
    try {
        const settingsFromXml = readCenterSettingsFromXml(cardId);
        if (!settingsFromXml) return;
        if (typeof applyCenterViewSettings === 'function') {
            applyCenterViewSettings(settingsFromXml, { rerender: false });
        }
    } catch (err) {
        console.warn('Center-Einstellungen aus XML konnten nicht angewendet werden:', err);
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
    upsertCenterChild('ViewportWidth', Number(currentView.viewportWidth ?? 0));
    upsertCenterChild('ViewportHeight', Number(currentView.viewportHeight ?? 0));
    upsertCenterChild('ScreenWidth', Number(currentView.screenWidth ?? 0));
    upsertCenterChild('ScreenHeight', Number(currentView.screenHeight ?? 0));

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
    try { localStorage.setItem('saveCenterSettingsModeActive', saveCenterSettingsModeActive ? '1' : '0'); } catch (e) {}
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

// Render-/Stack-Logik wurde nach render.js ausgelagert.

function setupDropListeners() {
    const dropTargets = ['Q1', 'Q2', 'Q3', 'Q4', 'CENTER'];
    dropTargets.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.dropBound) {
            // Inline-Handler in board.html nutzen, um doppelte Drop-Verarbeitung zu vermeiden.
            if (typeof el.ondragover !== 'function') {
                el.addEventListener('dragover', (e) => e.preventDefault());
            }
            if (typeof el.ondrop !== 'function') {
                el.addEventListener('drop', drop);
            }
            el.dataset.dropBound = 'true';
        }

        // Rücklegen robust absichern: EIN zentraler Klickpfad pro Quadrant (Capture-Phase).
        if (el && ['Q1', 'Q2', 'Q3', 'Q4'].includes(id) && !el.dataset.centerClickBound) {
            el.addEventListener('click', (event) => {
                const hasCenterSelection = (
                    (activeCenterCardId !== null && activeCenterCardId !== undefined)
                    || !!document.querySelector('.card-container.in-center[data-cardid]')
                );
                if (!hasCenterSelection) return;

                // Scroll-/Stack-Buttons dürfen keinen Rücklauf triggern.
                const target = event?.target;
                if (target && (target.closest?.('.quadrant-stack-controls') || target.closest?.('.quadrant-stack-btn'))) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                moveCardFromCenterTo(id);
            }, true);
            el.dataset.centerClickBound = 'true';
        }
    });
}

// ---------------------------------------------------------------------------
// Suchfunktion
// ---------------------------------------------------------------------------
let pendingSearchMatch = null;

function showSearchKeyboard(inputEl) {
    if (!inputEl) return;
    // Fokus + explizite Keyboard-Anforderung (wenn Browser/API es zulässt).
    inputEl.focus({ preventScroll: true });
    try {
        inputEl.click();
    } catch {}
    try {
        const len = (inputEl.value || '').length;
        inputEl.setSelectionRange(len, len);
    } catch {}
    try {
        if (navigator.virtualKeyboard && typeof navigator.virtualKeyboard.show === 'function') {
            navigator.virtualKeyboard.show();
        }
    } catch {}
}

function openSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    const input   = document.getElementById('search-input');
    if (!overlay) return;
    pendingSearchMatch = null;
    overlay.classList.add('visible');
    if (input) {
        input.value = '';
        showSearchKeyboard(input);
    }
    renderSearchResults([]);
    setSearchMessage('');
    const fertigBtn = document.querySelector('#search-panel .search-btn-row .btn');
    if (fertigBtn) fertigBtn.textContent = 'Abbrechen';
}

function closeSearchOverlay() {
    if (pendingSearchMatch) {
        executeSearchDrop(pendingSearchMatch);
        pendingSearchMatch = null;
    }
    const overlay = document.getElementById('search-overlay');
    if (overlay) overlay.classList.remove('visible');
}

function searchKeyDown(event) {
    if (event.key === 'Escape') {
        pendingSearchMatch = null;
        const overlay = document.getElementById('search-overlay');
        if (overlay) overlay.classList.remove('visible');
        return;
    }
    if (event.key === 'Enter') {
        const input = document.getElementById('search-input');
        const rawValue = input ? input.value.trim() : '';
        if (rawValue.length === 0) {
            showAllCardsAlphabetical();
        }
    }
}

function searchInputClicked() {
    const input = document.getElementById('search-input');
    const rawValue = input ? input.value.trim() : '';
    if (rawValue.length === 0) {
        showAllCardsAlphabetical();
        return;
    }
    searchCards();
}

const STATUS_LABELS = {
    'gelernt':        'Stapel Gelernt (Q4)',
    'geübt':          'Stapel Geübt (Q3)',
    'wiederholen':    'Stapel Wiederholen (Q2)',
    'zurückgestellt': 'Stapel Zurückgestellt (Q1)'
};

function getStatusLabel(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('gelernt'))     return STATUS_LABELS['gelernt'];
    if (s.includes('geübt'))       return STATUS_LABELS['geübt'];
    if (s.includes('wiederholen')) return STATUS_LABELS['wiederholen'];
    return STATUS_LABELS['zurückgestellt'];
}

function setSearchMessage(msg) {
    const el = document.getElementById('search-message');
    if (el) el.textContent = msg;
}

function normalizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function renderSearchResults(matches) {
    const list = document.getElementById('search-result-list');
    if (!list) return;
    list.innerHTML = '';
    matches.forEach(m => {
        const li = document.createElement('li');
        li.innerHTML =
            '<div class="result-title">' + m.titel.replace(/</g, '&lt;') + '</div>' +
            '<div class="result-status">' + getStatusLabel(m.status) + '</div>';
        li.addEventListener('click', () => pickSearchResult(m));
        list.appendChild(li);
    });
}

function showAllCardsAlphabetical() {
    setSearchMessage('');
    if (!xmlData) { renderSearchResults([]); return; }
    const nodes = getRenderApi()?.getCardNodes() || [];
    const all = [];
    nodes.forEach((node, idx) => {
        const titel = node.querySelector('Titel')?.textContent || '';
        const status = node.querySelector('Arbeitsstatus')?.textContent || '';
        const speicherort = node.querySelector('Speicherort')?.textContent || '';
        all.push({ idx, titel, status, speicherort });
    });
    const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
    all.sort((a, b) => collator.compare(String(a.titel || ''), String(b.titel || '')));
    renderSearchResults(all);
    if (all.length === 0) {
        setSearchMessage('Keine Blätter geladen.');
    } else {
        setSearchMessage('Alle ' + all.length + ' Blätter – alphabetisch.');
    }
}

function searchCards() {
    const input = document.getElementById('search-input');
    const query = normalizeSearchText(input ? input.value : '');
    setSearchMessage('');
    if (!xmlData || query.length < 1) { renderSearchResults([]); return; }

    const nodes = getRenderApi()?.getCardNodes() || [];
    const matches = [];
    nodes.forEach((node, idx) => {
        const titel  = node.querySelector('Titel')?.textContent || '';
        const status = node.querySelector('Arbeitsstatus')?.textContent || '';
        const speicherort = node.querySelector('Speicherort')?.textContent || '';
        if (normalizeSearchText(titel).includes(query)) {
            matches.push({ idx, titel, status, speicherort });
        }
    });
    renderSearchResults(matches);
    if (matches.length === 0) setSearchMessage('Kein Blatt gefunden.');
}

function pickSearchResult(match) {
    if (!xmlData) return;
    if (currentPdfDoc) {
        alert('Tisch leeren!');
        return;
    }
    pendingSearchMatch = match;

    const statusLabel = getStatusLabel(match.status);
    setSearchMessage('Ich entnehme das Blatt \u201e' + match.titel + '\u201c aus deinem ' + statusLabel.replace(/\s*\(Q\d\)/, '') + '.');
    renderSearchResults([]);
    const input = document.getElementById('search-input');
    if (input) input.value = '';

    const fertigBtn = document.querySelector('#search-panel .search-btn-row .btn');
    if (fertigBtn) fertigBtn.textContent = 'Fertig';
}

function hideQuadrantsForRender() {
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(qid => {
        const el = document.getElementById(qid);
        if (el) el.style.visibility = 'hidden';
    });
}

function showQuadrantsAfterRender() {
    requestAnimationFrame(() => {
        ['Q1', 'Q2', 'Q3', 'Q4'].forEach(qid => {
            const el = document.getElementById(qid);
            if (el) el.style.visibility = 'visible';
        });
    });
}

function moveCardToQuadrant(cardIdx, targetQuadId) {
    // Versuche Karte im DOM zu finden
    let cardEl = document.querySelector('.card-container[data-cardid="' + String(cardIdx) + '"]');

    if (!cardEl) {
        // Schneller Pfad: Einzelkarte aus Render-Cache erzeugen/holen.
        // WICHTIG: resetCardRenderCache() hier NICHT aufrufen! Das würde alle Stapel neu aufbauen.
        // Stattdessen: ensureCardElementById reicht, um eine Karte on-demand zu erstellen.
        try {
            cardEl = getRenderApi()?.ensureCardElementById?.(cardIdx) || null;
        } catch (err) {
            // Falls ensureCardElementById fehlschlägt: Karte kann nicht erstellt werden
            console.warn('moveCardToQuadrant: Karte ' + cardIdx + ' konnte nicht erstellt werden:', err);
            return null;
        }
    }

    if (!cardEl) return null;

    // Bestimme aktuellen Quadrant der Karte
    const currentParent = cardEl.parentElement;
    const currentQuadId = currentParent?.id;

    // Falls bereits im Zielquadrant: nur oben platzieren
    if (currentQuadId === targetQuadId) {
        const targetQuadrant = document.getElementById(targetQuadId);
        if (targetQuadrant) {
            placeCardAtTopOfQuadrant(targetQuadrant, cardEl);
        }
    } else {
        // Karte ist in anderem Quadrant oder nirgendwo: entferne aus altem, füge in neuen ein
        if (currentParent && currentParent.id && ['Q1', 'Q2', 'Q3', 'Q4'].includes(currentParent.id)) {
            cardEl.remove();
        }

        const targetQuadrant = document.getElementById(targetQuadId);
        if (targetQuadrant) {
            placeCardAtTopOfQuadrant(targetQuadrant, cardEl);
        }
    }

    return cardEl;
}

function executeSearchDrop(match) {
    if (!xmlData || !match) return;

    try {
        // Quadrant bestimmen
        const s = (match.status || '').toLowerCase();
        let quadId = 'Q1';
        if (s.includes('wiederholen'))  quadId = 'Q2';
        else if (s.includes('geübt'))   quadId = 'Q3';
        else if (s.includes('gelernt')) quadId = 'Q4';

        // Karte in den richtigen Quadrant verschieben (wie bei Drop)
        const cardEl = moveCardToQuadrant(match.idx, quadId);
        if (!cardEl) return;

        // Layout aktualisieren (wie bei Drop)
        getRenderApi()?.updateStackLayout();

        // Im Übersichtsmodus kein Center-Drop: nur Stapelbewegung sichtbar halten.
        if (overviewModeActive) {
            setSaveDateState(false, getModeHintText());
            return;
        }

        // Nur ins Center legen wenn die Karte eine PDF-Adresse hat —
        // sonst bleibt activeCenterCardId = null und die Karte wird nicht gesperrt.
        if (!cardEl.dataset.pdf) {
            console.warn('executeSearchDrop: Karte hat keine PDF-Adresse, Center-Drop übersprungen.', cardEl.dataset.cardid);
            return;
        }

        // Center vorbereiten (wie bei Drop)
        const userConfig = getUserConfigForDropBehavior();
        const shouldApplyStoredCenterView = !!(saveCenterSettingsModeActive || userConfig.useZoomSettingsOnDrop);
        if (typeof discardCenterPendingScrollState === 'function') {
            discardCenterPendingScrollState();
        }
        document.querySelectorAll('.card-container.in-center').forEach((el) => el.classList.remove('in-center'));
        cardEl.classList.add('in-center');
        lastCardIdFromCenter = cardEl.dataset.cardid;
        activeCenterCardId   = cardEl.dataset.cardid;
        if (shouldApplyStoredCenterView) {
            applyCenterSettingsFromXml(cardEl.dataset.cardid);
        }
        if (typeof showPdfPages === 'function') {
            showPdfPages(cardEl.dataset.pdf);
        }
        setSaveDateState(false, getModeHintText());
    } catch (err) {
        recoverBoardUiStateAfterError('executeSearchDrop', {
            error: err,
            centerCardId: activeCenterCardId !== null ? String(activeCenterCardId) : null
        });
    }
}

function drag(event) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text', event.currentTarget.id);
    console.log('Drag started: ' + event.currentTarget.id);
}

function getDefaultDropBehaviorConfig() {
    return {
        useZoomSettingsOnDrop: true,
        dropGlowDurationMs: 1400
    };
}

function getUserConfigForDropBehavior() {
    const fallback = getDefaultDropBehaviorConfig();
    if (typeof loadUserConfig === 'function') {
        try {
            const loaded = loadUserConfig();
            return {
                useZoomSettingsOnDrop: loaded?.useZoomSettingsOnDrop !== false,
                dropGlowDurationMs: Number.isFinite(Number(loaded?.dropGlowDurationMs))
                    ? Number(loaded.dropGlowDurationMs)
                    : fallback.dropGlowDurationMs
            };
        } catch (err) {
            console.warn('Benutzerkonfiguration für Drop-Verhalten konnte nicht geladen werden:', err);
        }
    }
    return fallback;
}

function recoverBoardUiStateAfterError(context, options = {}) {
    console.error('Board-Recovery nach Fehler in ' + context, options.error || '');
    try {
        getRenderApi()?.renderBoard();
    } catch (renderErr) {
        console.error('Board-Recovery renderBoard fehlgeschlagen:', renderErr);
    }

    const centerCardId = options.centerCardId;
    if (centerCardId !== null && centerCardId !== undefined && centerCardId !== '') {
        try {
            const centerCard = document.querySelector('.card-container[data-cardid="' + String(centerCardId) + '"]');
            if (centerCard) {
                document.querySelectorAll('.card-container.in-center').forEach((el) => el.classList.remove('in-center'));
                centerCard.classList.add('in-center');
                activeCenterCardId = String(centerCardId);
            }
        } catch (centerErr) {
            console.error('Board-Recovery Center-Wiederherstellung fehlgeschlagen:', centerErr);
        }
    }

    try {
        getRenderApi()?.updateStackLayout();
    } catch (layoutErr) {
        console.error('Board-Recovery updateStackLayout fehlgeschlagen:', layoutErr);
    }
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

function normalizeCardStackStyle(cardElement) {
    if (!cardElement) return;
    cardElement.classList.remove('in-center');
    cardElement.classList.remove('drop-glow');
}

function clearCenterAfterCardExit() {
    if (typeof currentPdfDoc !== 'undefined') currentPdfDoc = null;
    if (typeof currentPdfPath !== 'undefined') currentPdfPath = '';
    if (typeof totalPages !== 'undefined') totalPages = 0;
    if (typeof currentPageOffset !== 'undefined') currentPageOffset = 0;
    if (typeof discardCenterPendingScrollState === 'function') {
        discardCenterPendingScrollState();
    }
    const centerContainer = document.getElementById('center-content');
    if (centerContainer) {
        centerContainer.innerHTML = '';
    }
    if (typeof updateCenterFilenameLabel === 'function') {
        updateCenterFilenameLabel('');
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
    host.style.flex = '0 0 auto';
    host.style.width = 'max-content';

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
        quadrantOffsets: getRenderApi()?.getQuadrantOffsets() || { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
        centerVisual: (() => { try { return captureCenterVisualSnapshot(); } catch (e) { return null; } })(),
        stackCount: getRenderApi()?.getStackCount() || 8,
        lastCardIdFromCenter,
        activeCenterCardId
    };
}

function getCardLayoutSnapshotForConfig() {
    const quadrants = { Q1: [], Q2: [], Q3: [], Q4: [] };

    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((quadrantId) => {
        const quadrant = document.getElementById(quadrantId);
        if (!quadrant) return;
        quadrants[quadrantId] = Array.from(quadrant.querySelectorAll('.card-container[data-cardid]'))
            .map((el) => String(el.dataset.cardid || '').trim())
            .filter(Boolean);
    });

    let centerCardId = activeCenterCardId;
    if (centerCardId === null || centerCardId === undefined || centerCardId === '') {
        const inCenter = document.querySelector('.card-container.in-center[data-cardid]');
        centerCardId = inCenter ? inCenter.dataset.cardid : null;
    }

    return {
        savedAt: Date.now(),
        quadrants,
        centerCardId: (centerCardId !== null && centerCardId !== undefined && centerCardId !== '') ? String(centerCardId) : null,
        stackCount: getRenderApi()?.getStackCount() || 8,
        quadrantOffsets: getRenderApi()?.getQuadrantOffsets() || { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }
    };
}

function applyCardLayoutSnapshotFromConfig(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') return false;

    const attempts = Math.max(1, Number(options.attempts) || 18);
    const retryDelayMs = Math.max(20, Number(options.retryDelayMs) || 80);
    let remaining = attempts;

    const applyOnce = () => {
        const stackInput = document.getElementById('stackCount');
        if (stackInput && Number.isFinite(Number(snapshot.stackCount))) {
            stackInput.value = String(Math.max(1, Math.min(10, Number(snapshot.stackCount))));
        }

        if (snapshot.quadrantOffsets && typeof snapshot.quadrantOffsets === 'object') {
            getRenderApi()?.setQuadrantOffsets(snapshot.quadrantOffsets);
        }

        const quadrants = snapshot.quadrants || {};
        let movedAny = false;

        ['Q1', 'Q2', 'Q3', 'Q4'].forEach((quadrantId) => {
            const ids = Array.isArray(quadrants[quadrantId]) ? quadrants[quadrantId] : [];
            if (!ids.length) return;

            const target = document.getElementById(quadrantId);
            if (!target) return;

            for (let i = ids.length - 1; i >= 0; i--) {
                const cardId = String(ids[i] || '').trim();
                if (!cardId) continue;
                const card = document.querySelector('.card-container[data-cardid="' + cardId + '"]');
                if (!card) continue;
                placeCardAtTopOfQuadrant(target, card);
                movedAny = true;
            }
        });

        const allCards = document.querySelectorAll('.card-container.in-center');
        allCards.forEach((el) => el.classList.remove('in-center'));

        if (snapshot.centerCardId !== null && snapshot.centerCardId !== undefined && snapshot.centerCardId !== '') {
            const centerCard = document.querySelector('.card-container[data-cardid="' + String(snapshot.centerCardId) + '"]');
            if (centerCard) {
                centerCard.classList.add('in-center');
                activeCenterCardId = String(snapshot.centerCardId);
            }
        }

        if (movedAny) {
            getRenderApi()?.updateStackLayout();
            return true;
        }

        return false;
    };

    const tryApply = () => {
        const done = applyOnce();
        if (done) return;
        remaining -= 1;
        if (remaining <= 0) return;
        setTimeout(tryApply, retryDelayMs);
    };

    tryApply();
    return true;
}

function restoreBoardSnapshotFromConfig(snapshot, options = {}) {
    if (!snapshot || !snapshot.xmlText) return false;

    const renderApi = getRenderApi();
    const preferDomRestore = !!options.preferDomRestore;
    const hasVisibleCards = document.querySelectorAll('.card-container[data-cardid]').length > 0;
    const canReuseDomState = preferDomRestore && hasVisibleCards && !!xmlData;

    if (!canReuseDomState) {
        try {
            const parsedXml = new DOMParser().parseFromString(snapshot.xmlText, 'text/xml');
            xmlData = parsedXml;
            renderApi?.resetCardRenderCache();
            if (snapshot.xmlFileName) {
                xmlFileName = snapshot.xmlFileName;
            }
        } catch {
            return false;
        }
    } else if (snapshot.xmlFileName) {
        xmlFileName = snapshot.xmlFileName;
    }

    if (snapshot.quadrantOffsets && typeof snapshot.quadrantOffsets === 'object') {
        getRenderApi()?.setQuadrantOffsets(snapshot.quadrantOffsets);
    }

    const stackInput = document.getElementById('stackCount');
    if (stackInput && Number.isFinite(Number(snapshot.stackCount))) {
        stackInput.value = String(Math.max(1, Math.min(10, Number(snapshot.stackCount))));
    }

    lastCardIdFromCenter = snapshot.lastCardIdFromCenter ?? null;
    activeCenterCardId = snapshot.activeCenterCardId ?? null;

    if (!preferDomRestore || !hasVisibleCards) {
        // Fallback: kompletter Neuaufbau nur wenn kein brauchbares DOM vorhanden ist.
        renderApi?.renderBoard();
    }

    try {
        renderApi?.syncVisibleCardAudioBadges?.();
        // Verzögere updateStackLayout() nach renderBoard() mit ausreichend Puffer für DOM-Rendering
        setTimeout(() => {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    try {
                        getRenderApi()?.updateStackLayout();
                    } catch (err) {
                        console.warn('updateStackLayout nach Restore fehlgeschlagen:', err);
                    }
                }, 0);
            });
        }, 50);
        if (activeCenterCardId !== null && activeCenterCardId !== undefined) {
            const centerCard = document.querySelector('.card-container[data-cardid="' + activeCenterCardId + '"]');
            if (centerCard) {
                centerCard.classList.add('in-center');
            }
        }
    } catch (err) {
        recoverBoardUiStateAfterError('restoreBoardSnapshotFromConfig.postRestore', {
            error: err,
            centerCardId: activeCenterCardId
        });
    }

    let centerVisualRestored = false;
    try {
        centerVisualRestored = restoreCenterVisualSnapshot(snapshot.centerVisual);
    } catch (err) {
        console.warn('Center-Visual-Restore fehlgeschlagen:', err);
        centerVisualRestored = false;
    }

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
            const shouldApplyStoredCenterView = !!(saveCenterSettingsModeActive || userConfig.useZoomSettingsOnDrop);
            if (typeof discardCenterPendingScrollState === 'function') {
                discardCenterPendingScrollState();
            }
            card.classList.add('in-center');
            lastCardIdFromCenter = card.dataset.cardid;  // Merke für saveDate
            activeCenterCardId = card.dataset.cardid;
            if (shouldApplyStoredCenterView) {
                applyCenterSettingsFromXml(card.dataset.cardid);
            }
            showPdfPages(card.dataset.pdf);
            // Reset Button wenn neue Karte ins CENTER kommt
            setSaveDateState(false, getModeHintText());
            console.log('Moved to center, lastCardIdFromCenter = ' + lastCardIdFromCenter);
        }
    } else if (isQuadrant) {
        const userConfig = getUserConfigForDropBehavior();
        const shouldPersistCenterView = !!(saveCenterSettingsModeActive || userConfig.useZoomSettingsOnDrop);
        const cameFromCenter = card.classList.contains('in-center');
        if (cameFromCenter && shouldPersistCenterView) {
            writeCenterSettingsToCardNode(card.dataset.cardid);
        }
        placeCardAtTopOfQuadrant(event.currentTarget, card);
        normalizeCardStackStyle(card);
        if (!overviewModeActive) {
            applyDropGlow(card, userConfig.dropGlowDurationMs);
        }
        lastCardIdFromCenter = card.dataset.cardid;  // Merke für saveDate auch nach ablegen
        if (cameFromCenter) {
            activeCenterCardId = null;
            clearCenterAfterCardExit();
        }
        saveDateToXml(card.dataset.cardid, targetId);
        if (isPlayMode) {
            savePlayedDateToXml(card.dataset.cardid);
        }
        saveXml(true, { allowPicker: false });
        console.log('Moved to quadrant: ' + targetId + ', lastCardIdFromCenter = ' + lastCardIdFromCenter);
        getRenderApi()?.updateStackLayout();
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
    const card = (getRenderApi()?.getCardNodes() || [])[parseInt(cardId)];
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
    const card = (getRenderApi()?.getCardNodes() || [])[parseInt(cardId)];
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

async function syncCanonicalXmlAndCleanupVariants(serializedXml) {
    if (!xmlFolderHandle) return;
    if (typeof xmlFolderHandle.getFileHandle !== 'function') return;

    const canonicalName = 'Notentisch.xml';
    const currentName = String(xmlFileName || '').trim();

    try {
        // Immer eine kanonische Austauschdatei pflegen, damit Access eindeutig importiert.
        const canonicalHandle = await xmlFolderHandle.getFileHandle(canonicalName, { create: true });
        const writableCanonical = await canonicalHandle.createWritable();
        await writableCanonical.write(serializedXml);
        await writableCanonical.close();

        xmlFileHandle = canonicalHandle;
        xmlFileName = canonicalName;
        await saveXmlDirectFileHandle(canonicalHandle);
    } catch (err) {
        console.warn('Kanonische XML konnte nicht geschrieben werden:', err);
        return;
    }

    if (typeof xmlFolderHandle.removeEntry !== 'function') {
        return;
    }

    try {
        const variants = [];
        for await (const entry of xmlFolderHandle.values()) {
            if (!entry || entry.kind !== 'file') continue;
            const name = String(entry.name || '');
            if (!/^Notentisch-.+\.xml$/i.test(name)) continue;
            variants.push(name);
        }

        for (const variantName of variants) {
            if (currentName && variantName.toLowerCase() === currentName.toLowerCase()) {
                // Aktuelle Varianten-Datei ist nach der Kanonisierung redundant.
                await xmlFolderHandle.removeEntry(variantName);
                continue;
            }
            await xmlFolderHandle.removeEntry(variantName);
        }

        if (variants.length) {
            console.log('XML-Austausch bereinigt, entfernte Varianten: ' + variants.length);
        }
    } catch (err) {
        console.warn('XML-Varianten konnten nicht vollständig bereinigt werden:', err);
    }
}

async function saveXml(silent = true, options = {}) {
    if (!xmlData) return;
    const allowPicker = options.allowPicker !== false;
    
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
        const ensuredHandle = await ensureXmlFileHandle({ allowPicker });
        if (!ensuredHandle || !xmlFileHandle) {
            markUnsavedChange();
            return;
        }
        
        // Direkt in die Datei schreiben (überschreibt)
        const serializedXml = new XMLSerializer().serializeToString(xmlData);
        const writable = await xmlFileHandle.createWritable();
        await writable.write(serializedXml);
        await writable.close();
        // Access-Austauschaktion bewusst deaktiviert:
        // kein kanonischer Sync/Variant-Cleanup beim normalen Speichern.
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

async function autoLoadLastXmlFileIfNeeded() {
    if (xmlData) return false;

    try {
        const directHandle = await loadXmlDirectFileHandle();
        if (directHandle) {
            let permission = 'granted';
            if (typeof directHandle.queryPermission === 'function') {
                permission = await directHandle.queryPermission({ mode: 'read' });
            }
            if (permission === 'prompt' && typeof directHandle.requestPermission === 'function') {
                permission = await directHandle.requestPermission({ mode: 'read' });
            }
            if (permission === 'granted') {
                await openAndLoadXmlHandle(directHandle);
                return true;
            }
        }
    } catch (err) {
        console.warn('Direktes XML-Autoload fehlgeschlagen:', err);
    }

    try {
        let folderHandle = xmlFolderHandle;
        if (!folderHandle) {
            folderHandle = await loadFolderHandle();
        }
        if (!folderHandle) return false;

        let permission = 'granted';
        if (typeof folderHandle.queryPermission === 'function') {
            permission = await folderHandle.queryPermission({ mode: 'read' });
        }
        if (permission === 'prompt' && typeof folderHandle.requestPermission === 'function') {
            permission = await folderHandle.requestPermission({ mode: 'read' });
        }
        if (permission !== 'granted') return false;

        let canonicalExists = false;
        let bestEntry = null;
        for await (const entry of folderHandle.values()) {
            if (!entry || entry.kind !== 'file') continue;
            const name = String(entry.name || '');
            if (!/^Notentisch.*\.xml$/i.test(name)) continue;
            if (name.toLowerCase() === 'notentisch.xml') {
                canonicalExists = true;
                continue;
            }

            try {
                const file = await entry.getFile();
                const modified = Number(file?.lastModified || 0);
                if (!bestEntry || modified > bestEntry.modified) {
                    bestEntry = { name, modified };
                }
            } catch (err) {
                console.warn('XML-Metadaten konnten nicht gelesen werden:', name, err);
            }
        }

        const fallbackName = localStorage.getItem('xmlLastFileName') || xmlFileName || 'Notentisch.xml';
        const selectedName = canonicalExists
            ? 'Notentisch.xml'
            : (bestEntry?.name || fallbackName);
        const xmlHandle = await folderHandle.getFileHandle(selectedName, { create: false });
        await openAndLoadXmlHandle(xmlHandle);
        return true;
    } catch (err) {
        return false;
    }
}

function moveCardFromCenterTo(quadrantId) {
    let card = null;
    const markedCenterCard = document.querySelector('.card-container.in-center[data-cardid]');
    let fallbackCardId = null;

    if (activeCenterCardId !== null && activeCenterCardId !== undefined) {
        card = document.querySelector('.card-container[data-cardid="' + activeCenterCardId + '"]');
        fallbackCardId = String(activeCenterCardId || '').trim();
    }

    // Schutzprüfung: Wenn aktive ID fehlt/veraltet ist, nutze die tatsächlich markierte Center-Karte.
    if (!card && markedCenterCard) {
        card = markedCenterCard;
        activeCenterCardId = String(markedCenterCard.dataset.cardid || '');
    }

    if (!card) {
        card = document.querySelector('.card-container.in-center');
    }

    // Falls aktive ID und Markierung auseinanderlaufen, hat die sichtbare Markierung Vorrang.
    if (card && markedCenterCard && card !== markedCenterCard) {
        card = markedCenterCard;
        activeCenterCardId = String(markedCenterCard.dataset.cardid || '');
    }

    if (!card && lastCardIdFromCenter !== null && lastCardIdFromCenter !== undefined) {
        card = document.querySelector('.card-container[data-cardid="' + lastCardIdFromCenter + '"]');
        fallbackCardId = fallbackCardId || String(lastCardIdFromCenter || '').trim();
    }

    // Wenn die Karte nur als Center-PDF sichtbar ist, aber kein DOM-Element mehr existiert,
    // Karte aus Status ableiten und on-demand in einen Quadranten einhängen.
    if (!card && fallbackCardId) {
        const statusQuadrantId = getQuadrantIdForCardId(fallbackCardId);
        card = moveCardToQuadrant(fallbackCardId, statusQuadrantId);
        if (card) {
            card.classList.add('in-center');
        }
    }

    const targetQuadrant = document.getElementById(quadrantId);
    if (card && targetQuadrant) {
        const userConfig = getUserConfigForDropBehavior();
        const shouldPersistCenterView = !!(saveCenterSettingsModeActive || userConfig.useZoomSettingsOnDrop);
        placeCardAtTopOfQuadrant(targetQuadrant, card);
        normalizeCardStackStyle(card);
        if (!overviewModeActive) {
            applyDropGlow(card, userConfig.dropGlowDurationMs);
        }

        if (shouldPersistCenterView) {
            try {
                writeCenterSettingsToCardNode(card.dataset.cardid);
            } catch (err) {
                console.warn('Center-Settings konnten beim Zurücklegen nicht gespeichert werden:', err);
            }
        }

        activeCenterCardId = null;
        clearCenterAfterCardExit();
        lastCardIdFromCenter = card.dataset.cardid;
        try {
            saveDateToXml(card.dataset.cardid, quadrantId);
            if (isPlayMode) {
                savePlayedDateToXml(card.dataset.cardid);
            }
            saveXml(true, { allowPicker: false });
        } catch (err) {
            console.warn('Metadaten konnten beim Zurücklegen nicht vollständig gespeichert werden:', err);
        }

        getRenderApi()?.updateStackLayout();
    }
}

function moveCardToQ2(event) {
    moveCardFromCenterTo('Q2');
}

function scrollQuadrant(id, direction) {
    const q = document.getElementById(id);
    if (q) q.scrollTop += (direction === 'down' ? 180 : -180);
}

function handleViewportResize() {
    getRenderApi()?.updateStackLayout();
}

function shouldSkipAutoLoadSavedFolder() {
    try {
        if (sessionStorage.getItem('notentischSkipAutoLoadSavedFolder') === '1') {
            sessionStorage.removeItem('notentischSkipAutoLoadSavedFolder');
            return true;
        }
        return false;
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

function restoreSaveCenterSettingsModeState() {
    try {
        const stored = localStorage.getItem('saveCenterSettingsModeActive');
        if (stored === '1') saveCenterSettingsModeActive = true;
    } catch (e) {}
    updateSaveCenterSettingsButtonState();
}

function initializeBoardFilehandling() {
    const safeRun = (fn) => {
        try { fn(); } catch (err) {}
    };

    safeRun(() => setupDropListeners());

    safeRun(() => {
        if (typeof restoreBoardSessionState === 'function') {
            restoreBoardSessionState();
        }
    });

    safeRun(() => getRenderApi()?.initializeStackControls());

    // Layout erst nach erstem Paint berechnen; darf Board-Start nicht blockieren.
    setTimeout(() => {
        requestAnimationFrame(() => {
            setTimeout(() => {
                safeRun(() => getRenderApi()?.updateStackLayout());
            }, 0);
        });
    }, 150);

    safeRun(() => {
        if (!shouldSkipAutoLoadSavedFolder()) {
            loadSavedFolder()
                .then(() => autoLoadLastXmlFileIfNeeded())
                .catch(() => {});
        }
    });

    safeRun(() => applyModeButtonState());
    safeRun(() => restoreOverviewModeState());
    safeRun(() => restoreSafetyBackupIfAvailable());
    safeRun(() => restoreSaveCenterSettingsModeState());
    safeRun(() => window.addEventListener('resize', handleViewportResize));

    // Bei History-/bfcache-Rueckkehr sicherstellen, dass die aktuelle Staffelung angewendet wird.
    safeRun(() => {
        window.addEventListener('pageshow', () => {
            setTimeout(() => {
                const renderApi = getRenderApi();
                if (!renderApi) return;
                renderApi.updateStackLayout?.();
            }, 0);
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBoardFilehandling);
} else {
    initializeBoardFilehandling();
}
