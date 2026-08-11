let currentPdfDoc = null;
let currentPdfPath = '';
let currentPageOffset = 0;
let totalPages = 0;
let currentZoom = settings.defaultZoom;
let currentRenderToken = 0;
let zoomRenderTimer = null;
let centerHorizontalAlign = 'left';
let nextRenderViewAnchor = null;
let zoomHoldDelayTimer = null;
let zoomHoldInterval = null;
let renderedZoom = settings.defaultZoom;
let isZoomHolding = false;
const CONTINUOUS_STEP_FACTOR = 0.55;
let suppressNextZoomClick = false;
let continuousZoomDidRun = false;
let pendingRelativeScrollPosition = null;

function discardCenterPendingScrollState() {
    pendingRelativeScrollPosition = null;
    nextRenderViewAnchor = null;
}

function clampRelative(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(1, parsed));
}

function getRelativeScrollPosition(container) {
    if (!container) return { x: 0, y: 0 };
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    return {
        x: maxScrollLeft > 0 ? clampRelative(container.scrollLeft / maxScrollLeft) : 0,
        y: maxScrollTop > 0 ? clampRelative(container.scrollTop / maxScrollTop) : 0
    };
}

function applyRelativeScrollPosition(container, relativePosition) {
    if (!container || !relativePosition) return;
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const x = clampRelative(relativePosition.x);
    const y = clampRelative(relativePosition.y);
    container.scrollLeft = Math.round(maxScrollLeft * x);
    container.scrollTop = Math.round(maxScrollTop * y);
}

function setCenterHorizontalAlign(value) {
    centerHorizontalAlign = normalizeCenterAlign(value);
}

function normalizeCenterZoomFocusMode(value) {
    return 'left-top';
}

function getCenterPagesHost() {
    return document.getElementById('center-pages-host');
}

function getTransformOriginForFocusMode() {
    const focusMode = getEffectiveFocusMode();
    if (focusMode === 'right-top') return '100% 0%';
    if (focusMode === 'center') return '50% 50%';
    return '0% 0%';
}

function getEffectiveFocusMode() {
    return normalizeCenterZoomFocusMode(settings.centerZoomFocus);
}

function getCenterHostMetrics(container) {
    const host = getCenterPagesHost();
    if (!container || !host) {
        return { left: 0, top: 0, width: 1, height: 1 };
    }

    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || host.scrollWidth || host.clientWidth || 1));
    const height = Math.max(1, Math.round(rect.height || host.scrollHeight || host.clientHeight || 1));

    return {
        left: Number(host.offsetLeft) || 0,
        top: Number(host.offsetTop) || 0,
        width,
        height
    };
}

function getFocusAnchorPoint(mode, hostMetrics) {
    if (mode === 'right-top') {
        return { x: hostMetrics.width, y: 0 };
    }
    if (mode === 'center') {
        return {
            x: hostMetrics.width / 2,
            y: hostMetrics.height / 2
        };
    }
    return { x: 0, y: 0 };
}

function applyFocusAnchorByMode(container, smooth = false) {
    if (!container) return;

    const focusMode = getEffectiveFocusMode();
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    let targetLeft = 0;
    let targetTop = 0;

    if (focusMode === 'right-top') {
        targetLeft = maxScrollLeft;
    } else if (focusMode === 'center') {
        targetLeft = Math.round(maxScrollLeft / 2);
        targetTop = Math.round(maxScrollTop / 2);
    }

    const behavior = smooth ? 'smooth' : 'auto';
    container.scrollTo({
        top: Math.max(0, Math.min(maxScrollTop, targetTop)),
        left: Math.max(0, Math.min(maxScrollLeft, targetLeft)),
        behavior
    });
}

function applyLiveZoomPreview() {
    const host = getCenterPagesHost();
    if (!host) return;

    const baseZoom = Math.max(0.001, renderedZoom);
    const scale = currentZoom / baseZoom;
    host.style.transformOrigin = getTransformOriginForFocusMode();
    host.style.transform = 'scale(' + scale + ')';
}

function getCurrentCenterViewSettings() {
    const container = document.getElementById('center-content');
    const relativePosition = getRelativeScrollPosition(container);
    const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);
    const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0);
    const screenWidth = Number(window.screen?.width || 0);
    const screenHeight = Number(window.screen?.height || 0);
    return {
        zoom: currentZoom,
        align: centerHorizontalAlign,
        zoomFocus: normalizeCenterZoomFocusMode(settings.centerZoomFocus),
        posRelX: relativePosition.x,
        posRelY: relativePosition.y,
        viewportWidth: Number.isFinite(viewportWidth) && viewportWidth > 0 ? Math.round(viewportWidth) : null,
        viewportHeight: Number.isFinite(viewportHeight) && viewportHeight > 0 ? Math.round(viewportHeight) : null,
        screenWidth: Number.isFinite(screenWidth) && screenWidth > 0 ? Math.round(screenWidth) : null,
        screenHeight: Number.isFinite(screenHeight) && screenHeight > 0 ? Math.round(screenHeight) : null
    };
}

function getCenterDisplayMode() {
    const center = document.getElementById('CENTER');
    if (!center) return 'normal';
    if (center.classList.contains('full')) return 'full';
    if (center.classList.contains('wide')) return 'wide';
    return 'normal';
}

function getCurrentCenterRuntimeState() {
    if (!currentPdfPath) return null;
    const viewSettings = getCurrentCenterViewSettings();
    return {
        pdfPath: currentPdfPath,
        pageOffset: currentPageOffset,
        zoom: viewSettings.zoom,
        align: viewSettings.align,
        zoomFocus: viewSettings.zoomFocus,
        posRelX: viewSettings.posRelX,
        posRelY: viewSettings.posRelY,
        mode: getCenterDisplayMode()
    };
}

function applyCenterDisplayMode(mode) {
    const center = document.getElementById('CENTER');
    if (!center) return;

    function resetCenterSizing() {
        center.style.right = '';
        center.style.left = '';
        center.style.top = '';
        center.style.bottom = '';
        center.style.width = '';
        center.style.height = '';
        center.style.maxWidth = '';
        center.style.minWidth = '';
        center.style.transform = '';
    }

    center.classList.remove('wide', 'full');
    resetCenterSizing();

    if (mode === 'full') {
        center.classList.add('full');
        center.style.left = '10px';
        center.style.right = '10px';
        center.style.top = '10px';
        center.style.bottom = '10px';
        center.style.width = 'auto';
        center.style.height = 'auto';
        center.style.maxWidth = 'none';
        center.style.minWidth = '0';
        center.style.transform = 'none';
    } else if (mode === 'wide') {
        center.classList.add('wide');
        const rect = center.getBoundingClientRect();
        const leftTarget = 30;
        const fixedWidth = Math.max(680, Math.floor(rect.right - leftTarget));
        center.style.right = 'auto';
        center.style.left = leftTarget + 'px';
        center.style.width = fixedWidth + 'px';
        center.style.maxWidth = 'none';
        center.style.minWidth = '0';
        center.style.transform = 'translateY(-50%)';
    }

    syncWideButtonState();
}

function restoreCenterRuntimeState(state, options = {}) {
    if (!state || !state.pdfPath) return;

    applyCenterViewSettings(state, {
        rerender: false,
        preserveConfiguredFocus: !!options.preserveConfiguredFocus
    });
    applyCenterDisplayMode(state.mode);
    showPdfPages(state.pdfPath, { pageOffset: state.pageOffset });
}

function applyCenterViewSettings(viewSettings, options = {}) {
    const shouldRerender = !!options.rerender;
    const preserveConfiguredFocus = !!options.preserveConfiguredFocus;
    if (!viewSettings || typeof viewSettings !== 'object') return;

    if (viewSettings.align) {
        setCenterHorizontalAlign(viewSettings.align);
    }

    if (!preserveConfiguredFocus && viewSettings.zoomFocus) {
        settings.centerZoomFocus = normalizeCenterZoomFocusMode(viewSettings.zoomFocus);
    }

    if (Number.isFinite(Number(viewSettings.zoom))) {
        const parsedZoom = Number(viewSettings.zoom);
        currentZoom = Math.min(settings.centerMaxZoom, Math.max(settings.centerMinZoom, parsedZoom));
    }

    const hasRelativePosition = Number.isFinite(Number(viewSettings.posRelX)) || Number.isFinite(Number(viewSettings.posRelY));
    if (hasRelativePosition) {
        const normalizedAlign = normalizeCenterAlign(viewSettings.align || centerHorizontalAlign);
        const normalizedFocus = normalizeCenterZoomFocusMode(viewSettings.zoomFocus || settings.centerZoomFocus);
        let normalizedX = clampRelative(viewSettings.posRelX);
        if ((normalizedAlign === 'middle' || normalizedFocus === 'center') && normalizedX <= 0.001) {
            normalizedX = 0.5;
        }
        pendingRelativeScrollPosition = {
            x: normalizedX,
            y: clampRelative(viewSettings.posRelY)
        };
    }

    applyCenterHorizontalAlign(false);

    if (shouldRerender && currentPdfDoc) {
        renderPdfPages();
    }
}

function captureViewAnchor(container) {
    if (!container) return null;
    const focusMode = getEffectiveFocusMode();
    const hostMetrics = getCenterHostMetrics(container);

    if (focusMode === 'left-top') {
        return {
            viewportX: 0,
            viewportY: 0,
            contentX: 0,
            contentY: 0,
            clientWidth: container.clientWidth,
            clientHeight: container.clientHeight,
            mode: focusMode
        };
    }

    const point = getFocusAnchorPoint(focusMode, hostMetrics);

    return {
        viewportX: hostMetrics.left - container.scrollLeft + point.x,
        viewportY: hostMetrics.top - container.scrollTop + point.y,
        contentX: point.x,
        contentY: point.y,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        mode: focusMode
    };
}

function applyViewAnchor(container, anchor, zoomRatio) {
    if (!container || !anchor) return;
    const R = (zoomRatio > 0 && Number.isFinite(zoomRatio)) ? zoomRatio : 1;
    const hostMetrics = getCenterHostMetrics(container);
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const mode = getEffectiveFocusMode() || anchor.mode || 'left-top';

    let targetLeft;
    if (mode === 'right-top') {
        targetLeft = maxScrollLeft;
    } else if (mode === 'center') {
        targetLeft = Math.round(maxScrollLeft / 2);
    } else {
        targetLeft = 0;
    }

    let targetTop;
    if (mode === 'center') {
        targetTop = Math.round(maxScrollTop / 2);
    } else {
        targetTop = hostMetrics.top + (R * (anchor.contentY || 0)) - (anchor.viewportY || 0);
    }

    container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, targetLeft));
    container.scrollTop = Math.max(0, Math.min(maxScrollTop, targetTop));
}

function applyCenterHorizontalAlign(smooth = false, keepPosition = false) {
    const container = document.getElementById('center-content');
    const button = document.getElementById('alignBtn');
    if (!container) return;

    const isRight = centerHorizontalAlign === 'right';
    const isMiddle = centerHorizontalAlign === 'middle';
    const desiredJustify = isRight ? 'flex-end' : (isMiddle ? 'center' : 'flex-start');

    // Wenn der Inhalt breiter als der Viewport ist, führt center/right in Flex-Containern
    // zu abgeschnittenem linken Überstand, der nicht zurückgescrollt werden kann.
    // Dann erzwingen wir flex-start und lassen Alignment nur wirken, wenn es passt.
    const host = getCenterPagesHost();
    let effectiveJustify = desiredJustify;
    if (host) {
        const hostWidth = Math.max(host.scrollWidth || 0, host.offsetWidth || 0, host.clientWidth || 0);
        const viewportWidth = Math.max(0, container.clientWidth || 0);
        if (hostWidth > (viewportWidth + 1)) {
            effectiveJustify = 'flex-start';
        }
    }

    container.style.justifyContent = effectiveJustify;

    if (button) {
        if (isRight) {
            button.textContent = 'Rechts';
            button.style.background = getToggleStepColor(2);
        } else if (isMiddle) {
            button.textContent = 'Mitte';
            button.style.background = getToggleStepColor(1);
        } else {
            button.textContent = 'Links';
            button.style.background = '';
        }
    }

    if (!keepPosition) {
        applyFocusAnchorByMode(container, smooth);
    }
}

function toggleCenterAlign() {
    if (centerHorizontalAlign === 'left') {
        centerHorizontalAlign = 'middle';
    } else if (centerHorizontalAlign === 'middle') {
        centerHorizontalAlign = 'right';
    } else {
        centerHorizontalAlign = 'left';
    }

    applyCenterHorizontalAlign(true);

    try {
        const cfg = loadUserConfig();
        cfg.centerAlign = centerHorizontalAlign;
        localStorage.setItem(USER_CONFIG_KEY, JSON.stringify(cfg));
    } catch (err) {
    }
}

function alignCenterTopLeft(smooth = false) {
    const container = document.getElementById('center-content');
    if (!container) return;
    applyFocusAnchorByMode(container, smooth);
}

function queueZoomRender() {
    if (!currentPdfDoc) return;
    if (zoomRenderTimer) clearTimeout(zoomRenderTimer);

    const centerContainer = document.getElementById('center-content');
    // Aktuelle relative Scrollposition sichern, damit nach dem Re-Render
    // dieselbe Stelle sichtbar bleibt (statt auf left-top zu springen).
    const relPos = getRelativeScrollPosition(centerContainer);
    pendingRelativeScrollPosition = { x: relPos.x, y: relPos.y };
    nextRenderViewAnchor = null;

    zoomRenderTimer = setTimeout(() => {
        renderPdfPages();
        zoomRenderTimer = null;
    }, settings.centerZoomDebounceMs);
}

function stepZoom(deltaStep) {
    const minZoom = settings.centerMinZoom;
    const maxZoom = settings.centerMaxZoom;
    const nextZoom = Math.min(maxZoom, Math.max(minZoom, Math.round((currentZoom + deltaStep) * 1000) / 1000));
    if (nextZoom === currentZoom) return;
    currentZoom = nextZoom;
    queueZoomRender();
}

function setZoom(zoomLevel, allowBelowMin = false) {
    const minZoom = allowBelowMin ? 0.05 : settings.centerMinZoom;
    currentZoom = Math.min(settings.centerMaxZoom, Math.max(minZoom, zoomLevel));
    queueZoomRender();
}

function zoomIn() {
    stepZoom(settings.zoomStep);
    console.log('Zoom IN:', currentZoom);
}

function zoomOut() {
    stepZoom(-settings.zoomStep);
    console.log('Zoom OUT:', currentZoom);
}

function stopContinuousZoom() {
    isZoomHolding = false;
    if (zoomHoldDelayTimer) {
        clearTimeout(zoomHoldDelayTimer);
        zoomHoldDelayTimer = null;
    }
    if (zoomHoldInterval) {
        clearInterval(zoomHoldInterval);
        zoomHoldInterval = null;
    }
}

function startContinuousZoom(direction) {
    const doZoom = direction === 'in'
        ? () => stepZoom(settings.zoomStep * CONTINUOUS_STEP_FACTOR)
        : () => stepZoom(-settings.zoomStep * CONTINUOUS_STEP_FACTOR);
    stopContinuousZoom();
    continuousZoomDidRun = false;

    if (!settings.centerZoomHoldEnabled) {
        return;
    }

    isZoomHolding = true;

    zoomHoldDelayTimer = setTimeout(() => {
        continuousZoomDidRun = true;
        doZoom();
        zoomHoldInterval = setInterval(doZoom, settings.centerZoomHoldIntervalMs);
    }, settings.centerZoomHoldDelayMs);
}

function bindContinuousZoomButtons() {
    const inBtn = document.getElementById('zoomInBtn');
    const outBtn = document.getElementById('zoomOutBtn');
    if (!inBtn || !outBtn) return;

    const finalizeContinuousZoom = () => {
        stopContinuousZoom();
        if (continuousZoomDidRun) {
            suppressNextZoomClick = true;
            queueZoomRender();
        }
    };

    const bind = (btn, direction) => {
        if (btn.dataset.holdBound === 'true') return;

        btn.addEventListener('pointerdown', () => startContinuousZoom(direction));
        btn.addEventListener('pointerup', finalizeContinuousZoom);
        btn.addEventListener('pointerleave', () => {
            finalizeContinuousZoom();
        });
        btn.addEventListener('pointercancel', () => {
            finalizeContinuousZoom();
        });
        btn.addEventListener('click', (event) => {
            if (!suppressNextZoomClick) return;
            suppressNextZoomClick = false;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
        btn.dataset.holdBound = 'true';
    };

    bind(inBtn, 'in');
    bind(outBtn, 'out');
}

function fitPdfWidth() {
    if (!currentPdfDoc) return;

    const centerContainer = document.getElementById('center-content');
    const center = document.getElementById('CENTER');
    if (!centerContainer) return;

    const maxWidth = centerContainer.clientWidth;
    const centerHeight = centerContainer.clientHeight;
    const isExpanded = !!(center && (center.classList.contains('wide') || center.classList.contains('full')));
    const useConfiguredMonitorPages = settings.layoutPreset === 'monitor-2x3' && !isExpanded;
    const lastPageToFit = useConfiguredMonitorPages
        ? Math.min(totalPages, currentPageOffset + settings.centerFitMonitorPages)
        : totalPages;

    const pagePromises = [];
    for (let pageNum = currentPageOffset + 1; pageNum <= lastPageToFit; pageNum++) {
        pagePromises.push(currentPdfDoc.getPage(pageNum));
    }

    Promise.all(pagePromises).then(pages => {
        if (!pages.length) return;

        let totalUnitWidth = 0;
        pages.forEach(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            const baseScale = centerHeight / viewport.height;
            totalUnitWidth += (viewport.width * baseScale);
        });

        // centerCanvasExtraWidth steuert jetzt den Grid-Gap außerhalb des Centers,
        // daher keine zusätzliche Breitenreduktion pro Seite mehr im PDF-Fit.
        const availableForPdf = Math.max(1, maxWidth);
        const zoom = availableForPdf / totalUnitWidth;
        setZoom(zoom, true);
    });
}

function fitPdfHeight() {
    if (!currentPdfDoc) return;
    setZoom(1.0);
}

function updateScrollButtons() {
    // Center scroll buttons were removed; keep this hook as a no-op for existing callers.
}

function scrollPdf(direction) {
    const container = document.getElementById('center-content');
    if (!container) return;

    const step = Math.max(40, Math.floor(settings.scrollStep));
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const targetTop = direction === 'up'
        ? Math.max(0, container.scrollTop - step)
        : Math.min(maxScroll, container.scrollTop + step);

    const behavior = settings.centerSmoothScroll ? 'smooth' : 'auto';
    container.scrollTo({ top: targetTop, left: container.scrollLeft, behavior });
}

function toggleWide() {
    const center = document.getElementById('CENTER');
    const btn = document.getElementById('wideBtn');
    if (!center || !btn) return;

    function resetCenterSizing() {
        center.style.right = '';
        center.style.left = '';
        center.style.top = '';
        center.style.bottom = '';
        center.style.width = '';
        center.style.height = '';
        center.style.maxWidth = '';
        center.style.minWidth = '';
        center.style.transform = '';
    }

    if (center.classList.contains('full')) {
        center.classList.remove('full');
        resetCenterSizing();
        btn.textContent = 'Norm';
        btn.style.background = '';
        btn.classList.remove('full-state');
    } else if (center.classList.contains('wide')) {
        center.classList.remove('wide');
        center.classList.add('full');
        btn.textContent = 'Full';
        btn.style.background = getToggleStepColor(2);
        btn.classList.add('full-state');
        center.style.left = '10px';
        center.style.right = '10px';
        center.style.top = '10px';
        center.style.bottom = '10px';
        center.style.width = 'auto';
        center.style.height = 'auto';
        center.style.maxWidth = 'none';
        center.style.minWidth = '0';
        center.style.transform = 'none';
    } else {
        const rect = center.getBoundingClientRect();
        const leftTarget = 30;
        const fixedWidth = Math.max(680, Math.floor(rect.right - leftTarget));
        center.classList.remove('wide');
        center.classList.remove('full');
        center.classList.add('wide');
        btn.textContent = 'Weit';
        btn.style.background = getToggleStepColor(1);
        btn.classList.remove('full-state');
        center.style.right = 'auto';
        center.style.left = leftTarget + 'px';
        center.style.top = '';
        center.style.bottom = '';
        center.style.width = fixedWidth + 'px';
        center.style.height = '';
        center.style.maxWidth = 'none';
        center.style.minWidth = '0';
        center.style.transform = 'translateY(-50%)';
    }

    if (currentPdfDoc) {
        renderPdfPages();
    }
}

function syncWideButtonState() {
    const center = document.getElementById('CENTER');
    const btn = document.getElementById('wideBtn');
    if (!center || !btn) return;

    if (center.classList.contains('full')) {
        btn.textContent = 'Full';
        btn.style.background = getToggleStepColor(2);
        btn.classList.add('full-state');
    } else if (center.classList.contains('wide')) {
        btn.textContent = 'Weit';
        btn.style.background = getToggleStepColor(1);
        btn.classList.remove('full-state');
    } else {
        btn.textContent = 'Norm';
        btn.style.background = '';
        btn.classList.remove('full-state');
    }
}

function showPdfPages(pdfPath, options = {}) {
    const rawPath = String(pdfPath || '');
    const hashParts = rawPath.split('#').map(p => p.trim()).filter(Boolean);
    const pdfParts = hashParts.filter(p => p.toLowerCase().includes('.pdf'));

    let actualPath = rawPath;
    if (pdfParts.length) {
        const relativeCandidate = pdfParts.find(p => !/^[a-zA-Z]:[\\/]/.test(p));
        actualPath = relativeCandidate || pdfParts[0];
    }

    const normalizedActual = normalizePdfServerPathV2(actualPath);

    const baseCandidates = [normalizedActual, ...pdfParts.map(p => normalizePdfServerPathV2(p))]
        .filter(Boolean)
        .map(p => p.split('/').pop())
        .filter(Boolean);

    const uniqueFileNames = [...new Set(baseCandidates)];

    currentPdfPath = normalizedActual;
    const requestedOffset = Number.isFinite(Number(options.pageOffset))
        ? Math.max(0, Math.floor(Number(options.pageOffset)))
        : 0;
    currentPageOffset = requestedOffset;

    function encodePath(p) {
        if (!p) return '';
        const safeDecode = (segment) => {
            try {
                return decodeURIComponent(segment);
            } catch {
                return segment;
            }
        };

        return String(p)
            .split('/')
            .filter(part => part !== '')
            .map(part => encodeURIComponent(safeDecode(part)))
            .join('/');
    }

    const paths = [
        encodePath(normalizedActual),
        ...uniqueFileNames.flatMap(name => [
            encodePath('Blätter/' + name),
            encodePath('Noten/Blätter/' + name),
            encodePath('Noten/' + name)
        ])
    ].filter(Boolean);

    let pathIndex = 0;

    // Try loading directly from picked blaetterDirHandle (File System Access API)
    async function tryLoadFromDirectHandle() {
        const handle = window.blaetterDirHandle;
        if (!handle || typeof pdfjsLib === 'undefined') return false;
        for (const fname of uniqueFileNames) {
            try {
                const fh = await handle.getFileHandle(fname);
                const file = await fh.getFile();
                const blobUrl = URL.createObjectURL(file);
                try {
                    const pdf = await pdfjsLib.getDocument(blobUrl).promise;
                    URL.revokeObjectURL(blobUrl);
                    currentPdfDoc = pdf;
                    totalPages = pdf.numPages;
                    currentPageOffset = Math.min(currentPageOffset, Math.max(0, totalPages - 1));
                    renderPdfPages();
                    updateCenterFilenameLabel(currentPdfPath);
                    return true;
                } catch {
                    URL.revokeObjectURL(blobUrl);
                }
            } catch { /* file not in handle, try next name */ }
        }
        return false;
    }

    function tryLoadPdf() {
        if (pathIndex >= paths.length) {
            console.error('PDF nicht erreichbar');
            const centerContainer = document.getElementById('center-content');
            if (centerContainer) {
                centerContainer.innerHTML = '<div style="text-align:center; padding:20px;"><p>PDF nicht erreichbar</p><p style="font-size:10px; color:#999;">Pfad: ' + actualPath + '</p><button onclick="selectPdfManually()" style="padding:10px 20px; background:#3498db; color:white; border:none; border-radius:4px; cursor:pointer;">PDF öffnen</button></div>';
            }
            return;
        }

        const serverPath = paths[pathIndex];
        console.log('Versuch ' + (pathIndex + 1) + ':', serverPath);

        pdfjsLib.getDocument(serverPath).promise.then(pdf => {
            console.log('PDF geladen von:', serverPath);
            currentPdfDoc = pdf;
            totalPages = pdf.numPages;
            currentPageOffset = Math.min(currentPageOffset, Math.max(0, totalPages - 1));
            renderPdfPages();
            updateCenterFilenameLabel(currentPdfPath);
        }).catch(() => {
            console.log('Fehler bei ' + serverPath);
            pathIndex++;
            tryLoadPdf();
        });
    }

    tryLoadFromDirectHandle().then(ok => { if (!ok) tryLoadPdf(); });
}

function selectPdfManually() {
    const pfad = 'C:\\Users\\User\\OneDrive\\myMusic\\Noten\\Blätter\\';
    alert('Navigiere zu:\n' + pfad);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const centerContainer = document.getElementById('center-content');
        if (centerContainer) {
            centerContainer.innerHTML = '<div style="color:#ccc;">Lade PDF...</div>';
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            currentPdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            totalPages = currentPdfDoc.numPages;
            currentPageOffset = 0;
            renderPdfPages();
        } catch (err) {
            if (centerContainer) {
                centerContainer.innerHTML = '<div style="color:#f00;">Fehler</div>';
            }
        }
    };
    input.click();
}

function renderPdfPages() {
    const latest = loadUserConfig();
    settings.pdfSharpness = latest.pdfSharpness;
    settings.paperTintPercent = latest.paperTintPercent;
    settings.paperTintColor = latest.paperTintColor;

    const centerContainer = document.getElementById('center-content');
    if (!centerContainer || !currentPdfDoc) return;

    currentRenderToken++;
    const token = currentRenderToken;
    const renderAnchor = nextRenderViewAnchor;
    nextRenderViewAnchor = null;
    const capturedRenderedZoom = renderedZoom;

    const previousHost = getCenterPagesHost();
    const pagesHost = document.createElement('div');
    pagesHost.id = 'center-pages-host-next';
    pagesHost.style.display = 'flex';
    pagesHost.style.alignItems = 'flex-start';
    pagesHost.style.flex = '0 0 auto';
    pagesHost.style.width = 'max-content';
    pagesHost.style.position = 'relative';
    pagesHost.style.zIndex = '2';
    pagesHost.style.transformOrigin = getTransformOriginForFocusMode();
    pagesHost.style.transform = 'none';

    let pageNum = currentPageOffset + 1;
    const renderedPages = [];

    function renderNextPage() {
        if (pageNum > totalPages) {
            if (token !== currentRenderToken) return;

            if (previousHost && previousHost.parentNode === centerContainer) {
                centerContainer.replaceChild(pagesHost, previousHost);
            } else {
                centerContainer.innerHTML = '';
                centerContainer.appendChild(pagesHost);
            }
            pagesHost.id = 'center-pages-host';

            updatePageInfo(renderedPages);
            applyCenterHorizontalAlign(false, true);
            // Erst Sichtbarkeit der Scroll-Buttons aktualisieren, damit danach keine Layoutverschiebung mehr passiert.
            updateScrollButtons();
            if (pendingRelativeScrollPosition) {
                applyRelativeScrollPosition(centerContainer, pendingRelativeScrollPosition);
                pendingRelativeScrollPosition = null;
            } else if (renderAnchor) {
                const zoomRatio = capturedRenderedZoom > 0 ? currentZoom / capturedRenderedZoom : 1;
                applyViewAnchor(centerContainer, renderAnchor, zoomRatio);
            } else {
                applyFocusAnchorByMode(centerContainer, false);
            }
            renderedZoom = currentZoom;
            return;
        }

        currentPdfDoc.getPage(pageNum).then(page => {
            if (token !== currentRenderToken) return;

            const viewport = page.getViewport({ scale: 1.0 });
            const baseScale = centerContainer.clientHeight / viewport.height;
            const finalScale = baseScale * currentZoom;
            const scaledViewport = page.getViewport({ scale: finalScale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const outputScale = (window.devicePixelRatio || 1) * settings.pdfSharpness;

            canvas.width = Math.floor(scaledViewport.width * outputScale);
            canvas.height = Math.floor(scaledViewport.height * outputScale);
            canvas.style.width = Math.floor(scaledViewport.width) + 'px';
            canvas.style.height = Math.floor(scaledViewport.height) + 'px';
            canvas.style.boxSizing = 'border-box';
            canvas.style.border = '1px solid #555';
            canvas.style.borderRadius = '4px';
            canvas.style.marginTop = '2px';
            canvas.style.marginBottom = '2px';

            const renderContext = {
                canvasContext: context,
                viewport: scaledViewport,
                transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
            };

            page.render(renderContext).promise.then(() => {
                if (token === currentRenderToken) {
                    applyPaperTintOverlay(context, canvas);
                    pagesHost.appendChild(canvas);
                    renderedPages.push(pageNum);
                    pageNum++;
                    renderNextPage();
                }
            });
        });
    }

    renderNextPage();
}

function updatePageInfo(renderedPages) {
    const pageInfo = document.getElementById('pageInfo');
    if (!pageInfo) return;

    if (currentPdfDoc && renderedPages && renderedPages.length > 0) {
        pageInfo.textContent = renderedPages[0] + ' - ' + renderedPages[renderedPages.length - 1] + ' / ' + totalPages;
    } else {
        pageInfo.textContent = '- / -';
    }
}

function previousPage() {
    if (currentPageOffset > 0) {
        currentPageOffset = Math.max(0, currentPageOffset - 1);
        renderPdfPages();
    }
}

function nextPage() {
    const centerContainer = document.getElementById('center-content');
    if (!centerContainer || !currentPdfDoc) return;

    let pageNum = currentPageOffset + 1;
    let totalWidth = 0;
    const maxWidth = centerContainer.clientWidth;
    let visiblePages = 0;

    function countVisiblePages(cb) {
        if (pageNum > totalPages) {
            cb(visiblePages);
            return;
        }

        currentPdfDoc.getPage(pageNum).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            const baseScale = centerContainer.clientHeight / viewport.height;
            const finalScale = baseScale * currentZoom;
            const scaledViewport = page.getViewport({ scale: finalScale });
            const occupiedWidth = scaledViewport.width;

            if (totalWidth + occupiedWidth > maxWidth && visiblePages > 0) {
                cb(visiblePages);
                return;
            }

            totalWidth += occupiedWidth;
            visiblePages++;
            pageNum++;
            countVisiblePages(cb);
        });
    }

    countVisiblePages((pages) => {
        if (currentPageOffset + pages < totalPages) {
            currentPageOffset += 1;
            renderPdfPages();
        }
    });
}

function updateCenterFilenameLabel(path) {
    const el = document.getElementById('center-filename-label');
    if (!el) return;
    if (path) {
        const raw = path.split('/').pop() || path;
        try { el.textContent = decodeURIComponent(raw); } catch { el.textContent = raw; }
    } else {
        el.textContent = '';
    }
}

function initializeCenterView() {
    const userConfig = loadUserConfig();
    setCenterHorizontalAlign(userConfig.centerAlign);
    currentZoom = userConfig.centerDefaultZoom;
    renderedZoom = currentZoom;
    settings.centerZoomFocus = normalizeCenterZoomFocusMode(userConfig.centerZoomFocus);
    syncWideButtonState();
    applyCenterHorizontalAlign(false);
    bindContinuousZoomButtons();
}
