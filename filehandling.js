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
const BOARD_PENDING_CONFIG_RETURN_KEY = 'notentischPendingConfigReturn';

function getRenderApi() {
    return window.NotentischRender || null;
}

function persistSafetyBackup() {}

function clearSafetyBackup() {}

function restoreSafetyBackupIfAvailable() {
    return false;
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
// Search-Overlay logic moved to board-search.js.
// Drag-and-drop logic moved to board-dnd.js.
// Config-session snapshot/restore helpers moved to board-session-state.js.

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
        const shouldPersistCenterView = !!(saveCenterSettingsModeActive || userConfig.useZoomSettingsOnDrop);
        if (shouldPersistCenterView && card.classList.contains('in-center')) {
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

        getRenderApi()?.updateStackLayout();
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
    getRenderApi()?.updateStackLayout();
}

function handleBoardPageShow(event) {
    const renderApi = getRenderApi();
    if (!renderApi) return;

    const hasPendingConfigReturn = (() => {
        try {
            return sessionStorage.getItem(BOARD_PENDING_CONFIG_RETURN_KEY) === '1';
        } catch {
            return false;
        }
    })();

    if (hasPendingConfigReturn && typeof restoreBoardSessionState === 'function') {
        restoreBoardSessionState();
        try {
            sessionStorage.removeItem(BOARD_PENDING_CONFIG_RETURN_KEY);
        } catch {
        }
        return;
    }

    // Kein bfcache (persisted=false): DOMContentLoaded hat bereits alles aufgebaut.
    // Kein erneutes renderBoard() aufrufen, das würde DOM-Positionen überschreiben.
    if (!event?.persisted) {
        renderApi.updateStackLayout();
        return;
    }

    // bfcache-Wiederherstellung: prüfen ob ein Config-Rücksprung-Snapshot wartet.
    const hasConfigReturn = (() => {
        try {
            return !!(sessionStorage.getItem(BOARD_SESSION_STATE_KEY) ||
                     localStorage.getItem(BOARD_SESSION_FALLBACK_KEY) ||
                     localStorage.getItem(BOARD_CARD_LAYOUT_KEY));
        } catch { return false; }
    })();

    if (hasConfigReturn && typeof restoreBoardSessionState === 'function') {
        restoreBoardSessionState();
        return;
    }

    const configuredCount = renderApi.getStackCount();
    const visibleCounts = ['Q1', 'Q2', 'Q3', 'Q4'].map((quadrantId) => {
        const quadrant = document.getElementById(quadrantId);
        if (!quadrant) return 0;
        return quadrant.querySelectorAll('.card-container[data-cardid]:not(.in-center)').length;
    });
    const maxVisibleCount = visibleCounts.length ? Math.max(...visibleCounts) : 0;

    if (maxVisibleCount !== configuredCount && xmlData) {
        // Rebuild from in-memory XML to apply new stack limit without reloading files.
        renderApi.renderBoard();
        return;
    }

    renderApi.updateStackLayout();
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupDropListeners();
        restorePlayModeState();
        if (typeof restoreBoardSessionState === 'function') {
            restoreBoardSessionState();
        }
        try {
            sessionStorage.removeItem(BOARD_PENDING_CONFIG_RETURN_KEY);
        } catch {
        }
        getRenderApi()?.initializeStackControls();
        getRenderApi()?.updateStackLayout();
        if (!shouldSkipAutoLoadSavedFolder()) {
            loadSavedFolder();
        }
        applyModeButtonState();
        restoreSafetyBackupIfAvailable();
        restoreSaveCenterSettingsModeState();
        window.addEventListener('resize', handleViewportResize);
        window.addEventListener('pageshow', handleBoardPageShow);
    });
} else {
    setupDropListeners();
    restorePlayModeState();
    if (typeof restoreBoardSessionState === 'function') {
        restoreBoardSessionState();
    }
    try {
        sessionStorage.removeItem(BOARD_PENDING_CONFIG_RETURN_KEY);
    } catch {
    }
    getRenderApi()?.initializeStackControls();
    getRenderApi()?.updateStackLayout();
    if (!shouldSkipAutoLoadSavedFolder()) {
        loadSavedFolder();
    }
    applyModeButtonState();
    restoreSafetyBackupIfAvailable();
    restoreSaveCenterSettingsModeState();
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('pageshow', handleBoardPageShow);
}
