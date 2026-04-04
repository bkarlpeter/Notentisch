// Search overlay logic for board cards.
let pendingSearchMatch = null;

const STATUS_LABELS = {
    gelernt: 'Stapel Gelernt (Q4)',
    geubt: 'Stapel Geuebt (Q3)',
    wiederholen: 'Stapel Wiederholen (Q2)',
    zurueckgestellt: 'Stapel Zurueckgestellt (Q1)'
};

function normalizeStatusForSearch(status) {
    return String(status || '').toLowerCase().replace(/ue/g, 'u').replace(/\u00fc/g, 'u').replace(/ü/g, 'u');
}

function openSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-input');
    if (!overlay) return;
    pendingSearchMatch = null;
    overlay.classList.add('visible');
    if (input) {
        input.value = '';
        input.focus();
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
    }
}

function getStatusLabel(status) {
    const s = normalizeStatusForSearch(status);
    if (s.includes('gelernt')) return STATUS_LABELS.gelernt;
    if (s.includes('geubt')) return STATUS_LABELS.geubt;
    if (s.includes('wiederholen')) return STATUS_LABELS.wiederholen;
    return STATUS_LABELS.zurueckgestellt;
}

function setSearchMessage(msg) {
    const el = document.getElementById('search-message');
    if (el) el.textContent = msg;
}

function renderSearchResults(matches) {
    const list = document.getElementById('search-result-list');
    if (!list) return;
    list.innerHTML = '';
    matches.forEach((m) => {
        const li = document.createElement('li');
        li.innerHTML =
            '<div class="result-title">' + m.titel.replace(/</g, '&lt;') + '</div>' +
            '<div class="result-status">' + getStatusLabel(m.status) + '</div>';
        li.addEventListener('click', () => pickSearchResult(m));
        list.appendChild(li);
    });
}

function searchCards() {
    const input = document.getElementById('search-input');
    const query = (input ? input.value : '').trim().toLowerCase();
    setSearchMessage('');
    if (!xmlData || query.length < 1) {
        renderSearchResults([]);
        return;
    }

    const nodes = getRenderApi()?.getCardNodes() || [];
    const matches = [];
    nodes.forEach((node, idx) => {
        const titel = node.querySelector('Titel')?.textContent || '';
        const status = node.querySelector('Arbeitsstatus')?.textContent || '';
        const speicherort = node.querySelector('Speicherort')?.textContent || '';
        if (titel.toLowerCase().includes(query)) {
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
    setSearchMessage('Ich entnehme das Blatt "' + match.titel + '" aus deinem ' + statusLabel.replace(/\s*\(Q\d\)/, '') + '.');
    renderSearchResults([]);
    const input = document.getElementById('search-input');
    if (input) input.value = '';

    const fertigBtn = document.querySelector('#search-panel .search-btn-row .btn');
    if (fertigBtn) fertigBtn.textContent = 'Fertig';
}

function executeSearchDrop(match) {
    if (!xmlData || !match) return;

    const s = normalizeStatusForSearch(match.status);
    let quadId = 'Q1';
    if (s.includes('wiederholen')) quadId = 'Q2';
    else if (s.includes('geubt')) quadId = 'Q3';
    else if (s.includes('gelernt')) quadId = 'Q4';

    const cards = getRenderApi()?.getCardNodes() || [];
    let posInQuad = 0;
    let counter = 0;
    cards.forEach((node, idx) => {
        const st = normalizeStatusForSearch(node.querySelector('Arbeitsstatus')?.textContent || '');
        let q = 'Q1';
        if (st.includes('wiederholen')) q = 'Q2';
        else if (st.includes('geubt')) q = 'Q3';
        else if (st.includes('gelernt')) q = 'Q4';
        if (q === quadId) {
            if (idx === match.idx) posInQuad = counter;
            counter++;
        }
    });

    getRenderApi()?.setQuadrantOffset(quadId, posInQuad);
    getRenderApi()?.renderBoard();

    const cardEl = document.getElementById('card-' + match.idx);
    if (!cardEl) return;

    const userConfig = getUserConfigForDropBehavior();
    const shouldApplyStoredCenterView = !!(saveCenterSettingsModeActive || userConfig.useZoomSettingsOnDrop);
    if (typeof discardCenterPendingScrollState === 'function') {
        discardCenterPendingScrollState();
    }
    cardEl.classList.add('in-center');
    lastCardIdFromCenter = cardEl.dataset.cardid;
    activeCenterCardId = cardEl.dataset.cardid;
    if (shouldApplyStoredCenterView) {
        applyCenterSettingsFromXml(cardEl.dataset.cardid);
    }
    showPdfPages(cardEl.dataset.pdf);
    setSaveDateState(false, getModeHintText());
}
