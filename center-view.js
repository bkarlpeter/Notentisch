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

function setCenterHorizontalAlign(value) {
    centerHorizontalAlign = normalizeCenterAlign(value);
}

function captureViewAnchor(container) {
    if (!container) return null;

    const totalWidth = Math.max(1, container.scrollWidth);
    const totalHeight = Math.max(1, container.scrollHeight);
    const centerX = container.scrollLeft + (container.clientWidth / 2);
    const centerY = container.scrollTop + (container.clientHeight / 2);

    return {
        xRatio: centerX / totalWidth,
        yRatio: centerY / totalHeight
    };
}

function applyViewAnchor(container, anchor) {
    if (!container || !anchor) return;

    const totalWidth = Math.max(1, container.scrollWidth);
    const totalHeight = Math.max(1, container.scrollHeight);
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const targetLeft = Math.max(0, Math.min(maxScrollLeft, (anchor.xRatio * totalWidth) - (container.clientWidth / 2)));
    const targetTop = Math.max(0, Math.min(maxScrollTop, (anchor.yRatio * totalHeight) - (container.clientHeight / 2)));

    container.scrollLeft = targetLeft;
    container.scrollTop = targetTop;
}

function applyCenterHorizontalAlign(smooth = false) {
    const container = document.getElementById('center-content');
    const button = document.getElementById('alignBtn');
    if (!container) return;

    const isRight = centerHorizontalAlign === 'right';
    container.style.justifyContent = isRight ? 'flex-end' : 'flex-start';

    if (button) {
        button.textContent = isRight ? 'Rechts' : 'Links';
        button.style.background = isRight ? '#27ae60' : '#3498db';
    }

    if (isRight) {
        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
        if (smooth) {
            container.scrollTo({ left: maxScrollLeft, top: container.scrollTop, behavior: 'smooth' });
        } else {
            container.scrollLeft = maxScrollLeft;
        }
    }
}

function toggleCenterAlign() {
    centerHorizontalAlign = centerHorizontalAlign === 'left' ? 'right' : 'left';
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

    const targetLeft = centerHorizontalAlign === 'right'
        ? Math.max(0, container.scrollWidth - container.clientWidth)
        : 0;

    if (smooth) {
        container.scrollTo({ top: 0, left: targetLeft, behavior: 'smooth' });
    } else {
        container.scrollTop = 0;
        container.scrollLeft = targetLeft;
    }
}

function queueZoomRender() {
    if (!currentPdfDoc) return;
    if (zoomRenderTimer) clearTimeout(zoomRenderTimer);

    nextRenderViewAnchor = captureViewAnchor(document.getElementById('center-content'));

    zoomRenderTimer = setTimeout(() => {
        renderPdfPages();
        setTimeout(() => updateScrollButtons(), 100);
        zoomRenderTimer = null;
    }, settings.centerZoomDebounceMs);
}

function setZoom(zoomLevel, allowBelowMin = false) {
    const minZoom = allowBelowMin ? 0.05 : settings.centerMinZoom;
    currentZoom = Math.min(settings.centerMaxZoom, Math.max(minZoom, zoomLevel));
    queueZoomRender();
}

function zoomIn() {
    const maxZoom = settings.centerMaxZoom;
    if (currentZoom < maxZoom) {
        currentZoom = Math.min(maxZoom, Math.round((currentZoom + settings.zoomStep) * 1000) / 1000);
        console.log('Zoom IN:', currentZoom);
        queueZoomRender();
    }
}

function zoomOut() {
    if (currentZoom > settings.centerMinZoom) {
        currentZoom = Math.max(settings.centerMinZoom, Math.round((currentZoom - settings.zoomStep) * 1000) / 1000);
        console.log('Zoom OUT:', currentZoom);
        queueZoomRender();
    }
}

function stopContinuousZoom() {
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
    const doZoom = direction === 'in' ? zoomIn : zoomOut;
    stopContinuousZoom();

    if (!settings.centerZoomHoldEnabled) {
        return;
    }

    zoomHoldDelayTimer = setTimeout(() => {
        doZoom();
        zoomHoldInterval = setInterval(doZoom, settings.centerZoomHoldIntervalMs);
    }, settings.centerZoomHoldDelayMs);
}

function bindContinuousZoomButtons() {
    const inBtn = document.getElementById('zoomInBtn');
    const outBtn = document.getElementById('zoomOutBtn');
    if (!inBtn || !outBtn) return;

    const bind = (btn, direction) => {
        if (btn.dataset.holdBound === 'true') return;

        btn.addEventListener('pointerdown', () => startContinuousZoom(direction));
        btn.addEventListener('pointerup', stopContinuousZoom);
        btn.addEventListener('pointerleave', stopContinuousZoom);
        btn.addEventListener('pointercancel', stopContinuousZoom);
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

        const availableForPdf = Math.max(1, maxWidth - (pages.length * settings.centerCanvasExtraWidth));
        const zoom = availableForPdf / totalUnitWidth;
        setZoom(zoom, true);
    });
}

function fitPdfHeight() {
    if (!currentPdfDoc) return;
    setZoom(1.0);
}

function updateScrollButtons() {
    const container = document.getElementById('center-content');
    const scrollButtons = document.getElementById('scroll-buttons');

    if (!container || !scrollButtons) return;

    if (container.scrollHeight > container.clientHeight) {
        scrollButtons.style.display = 'flex';
    } else {
        scrollButtons.style.display = 'none';
    }
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
        btn.style.background = '#3498db';
        btn.classList.remove('full-state');
    } else if (center.classList.contains('wide')) {
        center.classList.remove('wide');
        center.classList.add('full');
        btn.textContent = 'Full';
        btn.style.background = '#f39c12';
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
        btn.style.background = '#27ae60';
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
        btn.style.background = '#f39c12';
        btn.classList.add('full-state');
    } else if (center.classList.contains('wide')) {
        btn.textContent = 'Weit';
        btn.style.background = '#27ae60';
        btn.classList.remove('full-state');
    } else {
        btn.textContent = 'Norm';
        btn.style.background = '#3498db';
        btn.classList.remove('full-state');
    }
}

function showPdfPages(pdfPath) {
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
    currentPageOffset = 0;

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
            renderPdfPages();
        }).catch(() => {
            console.log('Fehler bei ' + serverPath);
            pathIndex++;
            tryLoadPdf();
        });
    }

    tryLoadPdf();
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

    centerContainer.innerHTML = '';

    let pageNum = currentPageOffset + 1;
    const renderedPages = [];

    function renderNextPage() {
        if (pageNum > totalPages) {
            updatePageInfo(renderedPages);
            setTimeout(() => {
                if (renderAnchor) {
                    applyViewAnchor(centerContainer, renderAnchor);
                } else {
                    alignCenterTopLeft(false);
                }
                applyCenterHorizontalAlign(false);
                updateScrollButtons();
            }, 100);
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
            canvas.style.border = '1px solid #555';
            canvas.style.borderRadius = '4px';
            canvas.style.margin = '2px';

            const renderContext = {
                canvasContext: context,
                viewport: scaledViewport,
                transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
            };

            page.render(renderContext).promise.then(() => {
                if (token === currentRenderToken) {
                    applyPaperTintOverlay(context, canvas);
                    centerContainer.appendChild(canvas);
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
            const occupiedWidth = scaledViewport.width + settings.centerCanvasExtraWidth;

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

function initializeCenterView() {
    const userConfig = loadUserConfig();
    setCenterHorizontalAlign(userConfig.centerAlign);
    currentZoom = userConfig.centerDefaultZoom;
    syncWideButtonState();
    applyCenterHorizontalAlign(false);
    bindContinuousZoomButtons();
}
