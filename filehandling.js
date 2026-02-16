let xmlData = null;

function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;
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
        if (el) {
            el.addEventListener('dragover', (e) => e.preventDefault());
            el.addEventListener('drop', drop);
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
            console.log('Moved to center');
        }
    } else if (isQuadrant) {
        event.currentTarget.appendChild(card);
        card.classList.remove('in-center');
        saveDateToXml(card.dataset.cardid, targetId);
        console.log('Moved to quadrant: ' + targetId);
    }
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
    
    // TODO: Feld <zuletztgespielt> mit aktuellem Datum speichern
    // Format: YYYY-MM-DD oder DD.MM.YYYY
    // Muss erst in XML-Struktur hinzugefuegt werden
}

function saveXml() {
    if (!xmlData) return;
    const blob = new Blob([new XMLSerializer().serializeToString(xmlData)], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'notentisch.xml';
    a.click();
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