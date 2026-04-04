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
        activeCenterCardId,
        isPlayMode: isPlayMode
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

        getRenderApi()?.updateStackLayout();

        if (movedAny) {
            return true;
        }

        return false;
    };

    const tryApply = () => {
        const done = applyOnce();
        if (done) return;
        remaining -= 1;
        if (remaining <= 0) {
            getRenderApi()?.updateStackLayout();
            return;
        }
        setTimeout(tryApply, retryDelayMs);
    };

    tryApply();
    return true;
}

function restoreBoardSnapshotFromConfig(snapshot, options = {}) {
    if (!snapshot || !snapshot.xmlText) return false;

    try {
        const parsedXml = new DOMParser().parseFromString(snapshot.xmlText, 'text/xml');
        xmlData = parsedXml;
        getRenderApi()?.resetCardRenderCache();
        if (snapshot.xmlFileName) {
            xmlFileName = snapshot.xmlFileName;
        }
    } catch {
        return false;
    }

    if (snapshot.quadrantOffsets && typeof snapshot.quadrantOffsets === 'object') {
        getRenderApi()?.setQuadrantOffsets(snapshot.quadrantOffsets);
    }

    lastCardIdFromCenter = snapshot.lastCardIdFromCenter ?? null;
    activeCenterCardId = snapshot.activeCenterCardId ?? null;
    if (typeof snapshot.isPlayMode === 'boolean') {
        isPlayMode = snapshot.isPlayMode;
        persistPlayModeState();
        applyModeButtonState();
    }

    const renderApi = getRenderApi();
    const preferDomRestore = !!options.preferDomRestore;
    const hasVisibleCards = document.querySelectorAll('.card-container[data-cardid]').length > 0;

    if (!preferDomRestore || !hasVisibleCards) {
        renderApi?.renderBoard();
    }

    renderApi?.syncVisibleCardAudioBadges?.();
    getRenderApi()?.updateStackLayout();

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
