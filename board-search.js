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

function moveCardToQuadrant(cardIdx, targetQuadId) {
    // Versuche Karte im DOM zu finden
    let cardEl = document.querySelector('.card-container[data-cardid="' + String(cardIdx) + '"]');

    if (!cardEl) {
        // Karte nicht im DOM: erstelle nur diese eine Karte (nicht renderBoard)
        cardEl = getRenderApi()?.ensureCardElementById?.(cardIdx) || null;
        if (!cardEl) return null;
    }

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

    // Karte in den richtigen Quadrant verschieben (wie bei Drop)
    let cardEl = moveCardToQuadrant(match.idx, quadId);
    if (!cardEl) return;

    // Layout aktualisieren (wie bei Drop)
    getRenderApi()?.updateStackLayout();

    // Center vorbereiten (wie bei Drop)
    const userConfig = getUserConfigForDropBehavior();
    const shouldApplyStoredCenterView = !!(saveCenterSettingsModeActive || userConfig.useZoomSettingsOnDrop);
    if (typeof discardCenterPendingScrollState === 'function') {
        discardCenterPendingScrollState();
    }
    document.querySelectorAll('.card-container.in-center').forEach((el) => el.classList.remove('in-center'));
    cardEl.classList.add('in-center');
    lastCardIdFromCenter = cardEl.dataset.cardid;
    activeCenterCardId = cardEl.dataset.cardid;
    if (shouldApplyStoredCenterView) {
        applyCenterSettingsFromXml(cardEl.dataset.cardid);
    }
    showPdfPages(cardEl.dataset.pdf);
    setSaveDateState(false, getModeHintText());
    if (typeof notifyCardEnteredCenter === 'function') notifyCardEnteredCenter(cardEl.dataset.cardid);
}
