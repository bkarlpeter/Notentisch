function setupDropListeners() {
    const dropTargets = ['Q1', 'Q2', 'Q3', 'Q4', 'CENTER'];
    dropTargets.forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.dropBound) {
            // Inline handlers in board.html are preferred to avoid duplicate drop handling.
            if (typeof el.ondragover !== 'function') {
                el.addEventListener('dragover', (e) => e.preventDefault());
            }
            if (typeof el.ondrop !== 'function') {
                el.addEventListener('drop', drop);
            }
            el.dataset.dropBound = 'true';
        }
    });
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
    if (typeof discardCenterPendingScrollState === 'function') {
        discardCenterPendingScrollState();
    }
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
            lastCardIdFromCenter = card.dataset.cardid;
            activeCenterCardId = card.dataset.cardid;
            if (shouldApplyStoredCenterView) {
                applyCenterSettingsFromXml(card.dataset.cardid);
            }
            showPdfPages(card.dataset.pdf);
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
        card.classList.remove('in-center');
        applyDropGlow(card, userConfig.dropGlowDurationMs);
        lastCardIdFromCenter = card.dataset.cardid;
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
        getRenderApi()?.updateStackLayout();
    }
}
