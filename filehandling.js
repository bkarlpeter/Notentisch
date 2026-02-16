let xmlData = null;
let xmlFileName = null;
let xmlFileHandle = null;
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
        renderBoard();
    };
    reader.readAsText(file);
}

function renderBoard() {
    if (!xmlData) return;
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
        const el = document.getElementById(q);
        if (el) el.innerHTML = '';
    });
    
    const cards = xmlData.querySelectorAll('NotenTisch');
    let counts = { 'Q1': 0, 'Q2': 0, 'Q3': 0, 'Q4': 0 };
    const limit = parseInt(document.getElementById('staffelLimit')?.value || '8');
    
    cards.forEach((cardEl, idx) => {
        const titel = cardEl.querySelector('Titel')?.textContent || 'Unbekannt';
        const speicherort = cardEl.querySelector('Speicherort')?.textContent || '';
        const status = cardEl.querySelector('Arbeitsstatus')?.textContent || 'zurueckgestellt';
        
        let quad = 'Q1';
        if (status.includes('wiederholen')) quad = 'Q2';
        if (status.includes('geübt')) quad = 'Q3';
        if (status.includes('gelernt')) quad = 'Q4';
        
        if (counts[quad] >= limit) return;
        counts[quad]++;
        
        const div = document.createElement('div');
        div.className = 'card-container visible';
        div.id = 'card-' + idx;
        div.dataset.cardid = idx;
        div.dataset.pdf = speicherort;
        div.draggable = true;
        
        const img = document.createElement('div');
        img.className = 'card';
        img.style.backgroundSize = 'cover';
        img.style.backgroundPosition = 'top';
        img.style.backgroundColor = '#ccc';
        
        loadCardImage(img, titel);
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'card-title';
        titleDiv.textContent = titel;
        
        div.appendChild(img);
        div.appendChild(titleDiv);
        
        div.addEventListener('dragstart', drag);
        div.addEventListener('dblclick', moveCardToQ2);
        
        document.getElementById(quad).appendChild(div);
    });
    
    // WICHTIG: Registriere Drop-Listener auf alle Quadranten + CENTER
    setupDropListeners();
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

function loadCardImage(imgElement, titel) {
    const variations = [
        sanitizeTitle(titel),
        'card_' + titel.trim().replace(/[,\.]$/g, '').replace(/ /g, '_') + '.png',
        'card_' + titel.toLowerCase().trim().replace(/[,\.]/g, '').replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ /g, '_').replace(/_+$/, '') + '.png',
    ];
    
    let currentIdx = 0;
    
    function tryNext() {
        if (currentIdx >= variations.length) {
            imgElement.style.backgroundColor = '#aaa';
            return;
        }
        
        const filename = variations[currentIdx];
        const img = new Image();
        
        img.onload = () => {
            imgElement.style.backgroundImage = 'url("./Cards_Export/' + filename + '")';
        };
        
        img.onerror = () => {
            currentIdx++;
            tryNext();
        };
        
        img.src = './Cards_Export/' + filename;
    }
    
    tryNext();
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
        if (card.dataset.pdf) {
            card.classList.add('in-center');
            showPdfPages(card.dataset.pdf);
            savePlayedDateToXml(card.dataset.cardid);
            console.log('Moved to center');
        }
    } else if (isQuadrant) {
        event.currentTarget.appendChild(card);
        card.classList.remove('in-center');
        saveDateToXml(card.dataset.cardid, targetId);
        console.log('Moved to quadrant: ' + targetId);
    }
}

function savePlayedDateToXml(cardId) {
    if (!xmlData) return;
    const card = xmlData.querySelectorAll('NotenTisch')[parseInt(cardId)];
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
    console.log('Saved played date: ' + dateStr + ' for card ' + cardId);
}

function saveDateToXml(cardId, quadrant) {
    if (!xmlData) return;
    const card = xmlData.querySelectorAll('NotenTisch')[parseInt(cardId)];
    if (!card) return;
    
    const map = { 'Q1': 'zurückgestellt', 'Q2': 'wiederholen', 'Q3': 'geübt', 'Q4': 'gelernt' };
    let el = card.querySelector('Arbeitsstatus');
    if (!el) {
        el = xmlData.createElement('Arbeitsstatus');
        card.appendChild(el);
    }
    el.textContent = map[quadrant] || 'spielen';
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
        saveDateToXml(card.dataset.cardid, quadrantId);
        
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

// Starte Drop-Listener wenn Seite geladen
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDropListeners);
} else {
    setupDropListeners();
}

// Load saved folder when HTML loads
window.addEventListener('DOMContentLoaded', async () => {
    await loadSavedFolder();
});