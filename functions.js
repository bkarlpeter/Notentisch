const USER_CONFIG_KEY = 'notentischUserConfig';
const USER_CONFIG_DEFAULTS = {
    pdfSharpness: 1.0,
    paperTintPercent: 3,
    paperTintColor: '#f5ebd2'
};

function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function normalizeHexColor(value, fallback) {
    const input = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(input)) return input.toLowerCase();
    return fallback;
}

function hexToRgb(hexColor) {
    const hex = normalizeHexColor(hexColor, USER_CONFIG_DEFAULTS.paperTintColor).slice(1);
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
    };
}

function loadUserConfig() {
    try {
        const raw = localStorage.getItem(USER_CONFIG_KEY);
        if (!raw) return { ...USER_CONFIG_DEFAULTS };
        const parsed = JSON.parse(raw);
        return {
            pdfSharpness: clampNumber(parsed.pdfSharpness, 0.8, 2.5, USER_CONFIG_DEFAULTS.pdfSharpness),
            paperTintPercent: clampNumber(parsed.paperTintPercent, 0, 5, USER_CONFIG_DEFAULTS.paperTintPercent),
            paperTintColor: normalizeHexColor(parsed.paperTintColor, USER_CONFIG_DEFAULTS.paperTintColor)
        };
    } catch (err) {
        return { ...USER_CONFIG_DEFAULTS };
    }
}

function applyCenterAppearance() {
    const centerContainer = document.getElementById('center-content');
    if (!centerContainer) return;

    const opacity = clampNumber(settings.paperTintPercent / 100, 0, 1, USER_CONFIG_DEFAULTS.paperTintPercent / 100);
    const tintRgb = hexToRgb(settings.paperTintColor);
    centerContainer.style.background = 'rgba(' + tintRgb.r + ', ' + tintRgb.g + ', ' + tintRgb.b + ', ' + opacity + ')';
}

function applyPaperTintOverlay(context, canvas) {
    const opacity = clampNumber(settings.paperTintPercent / 100, 0, 1, USER_CONFIG_DEFAULTS.paperTintPercent / 100);
    if (opacity <= 0) return;

    const tintRgb = hexToRgb(settings.paperTintColor);
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = 'rgba(' + tintRgb.r + ', ' + tintRgb.g + ', ' + tintRgb.b + ', ' + opacity + ')';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
}

function applyUserConfigAndRefresh(shouldRerender = true) {
    const userConfig = loadUserConfig();
    settings.pdfSharpness = userConfig.pdfSharpness;
    settings.paperTintPercent = userConfig.paperTintPercent;
    settings.paperTintColor = userConfig.paperTintColor;
    applyCenterAppearance();

    if (shouldRerender && currentPdfDoc) {
        renderPdfPages();
    }
}

function openConfigPage() {
    window.open('config.html', '_blank');
}

const initialUserConfig = loadUserConfig();

const settings = {
    defaultZoom: 1.0,
    scrollStep: 180,
    pageLabelPrefix: 'Blatt',
    zoomStep: 0.2,
    pdfSharpness: initialUserConfig.pdfSharpness,
    paperTintPercent: initialUserConfig.paperTintPercent,
    paperTintColor: initialUserConfig.paperTintColor
};

window.addEventListener('storage', (event) => {
    if (event.key !== USER_CONFIG_KEY) return;
    applyUserConfigAndRefresh(true);
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyUserConfigAndRefresh(false));
} else {
    applyUserConfigAndRefresh(false);
}

const CANVAS_EXTRA_WIDTH = 6;
const MIN_ZOOM = 0.4;

let currentPdfDoc = null;
let currentPdfPath = "";
let currentPageOffset = 0;
let totalPages = 0;
let currentZoom = settings.defaultZoom;
let currentRenderToken = 0;
let zoomRenderTimer = null;

function alignCenterTopLeft(smooth = false) {
    const container = document.getElementById('center-content');
    if (!container) return;

    if (smooth) {
        container.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } else {
        container.scrollTop = 0;
        container.scrollLeft = 0;
    }
}

function queueZoomRender() {
    if (!currentPdfDoc) return;
    if (zoomRenderTimer) clearTimeout(zoomRenderTimer);

    zoomRenderTimer = setTimeout(() => {
        renderPdfPages();
        setTimeout(() => updateScrollButtons(), 100);
        zoomRenderTimer = null;
    }, 90);
}

function setZoom(zoomLevel, allowBelowMin = false) {
    currentZoom = allowBelowMin ? Math.max(0.05, zoomLevel) : Math.max(MIN_ZOOM, zoomLevel);
    queueZoomRender();
}

function zoomIn() {
    const maxZoom = 1.0 + (settings.zoomStep * 4);
    if (currentZoom < maxZoom) {
        currentZoom = Math.min(maxZoom, Math.round((currentZoom + settings.zoomStep) * 10) / 10);
        console.log('Zoom IN:', currentZoom);
        queueZoomRender();
    }
}

function zoomOut() {
    if (currentZoom > MIN_ZOOM) {
        currentZoom = Math.max(MIN_ZOOM, Math.round((currentZoom - settings.zoomStep) * 10) / 10);
        console.log('Zoom OUT:', currentZoom);
        queueZoomRender();
    }
}

function fitPdfWidth() {
    if (!currentPdfDoc) return;

    const centerContainer = document.getElementById('center-content');
    if (!centerContainer) return;

    const maxWidth = centerContainer.clientWidth;
    const centerHeight = centerContainer.clientHeight;

    const pagePromises = [];
    for (let pageNum = currentPageOffset + 1; pageNum <= totalPages; pageNum++) {
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

        const availableForPdf = Math.max(1, maxWidth - (pages.length * CANVAS_EXTRA_WIDTH));
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

    const step = Math.max(100, Math.floor(container.clientHeight * 0.8));
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const targetTop = direction === 'up'
        ? Math.max(0, container.scrollTop - step)
        : Math.min(maxScroll, container.scrollTop + step);

    container.scrollTo({ top: targetTop, left: container.scrollLeft, behavior: 'smooth' });
}

function toggleWide() {
    const center = document.getElementById('CENTER');
    const btn = document.getElementById('wideBtn');
    if (!center || !btn) return;

    if (center.classList.contains('wide')) {
        center.classList.remove('wide');
        btn.textContent = 'WIDE';
        center.style.right = '';
        center.style.left = '';
        center.style.width = '';
        center.style.maxWidth = '';
        center.style.minWidth = '';
        center.style.transform = '';
    } else {
        const rect = center.getBoundingClientRect();
        const leftTarget = 30;
        const fixedWidth = Math.max(680, Math.floor(rect.right - leftTarget));
        center.classList.add('wide');
        btn.textContent = 'NORMAL';
        center.style.right = 'auto';
        center.style.left = leftTarget + 'px';
        center.style.width = fixedWidth + 'px';
        center.style.maxWidth = 'none';
        center.style.minWidth = '0';
        center.style.transform = 'translateY(-50%)';
    }

    if (currentPdfDoc) {
        renderPdfPages();
    }
}

function normalizePdfServerPath(pdfPath) {
    if (!pdfPath) return '';
    let path = pdfPath.trim();
    while (path.includes('\\')) path = path.replace('\\', '/');
    while (path.startsWith('../')) path = path.substring(3);
    console.log('PDF-Pfad normalisiert:', path);
    return path;
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
        const parts = p.split('/');
        if (parts.length === 1) return encodeURIComponent(parts[0]);
        const last = encodeURIComponent(parts.pop());
        return parts.join('/') + '/' + last;
    }

    const paths = [
        encodePath(normalizedActual),
        ...uniqueFileNames.flatMap(name => [
            encodePath('Blätter/' + name),
            encodePath('Noten/Blätter/' + name),
            encodePath('Noten/' + name),
            encodePath('board_files/' + name),
            encodePath('Cards_Export/' + name),
            encodePath('History/' + name)
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

    centerContainer.innerHTML = '';
    alignCenterTopLeft(false);

    let pageNum = currentPageOffset + 1;
    const renderedPages = [];

    function renderNextPage() {
        if (pageNum > totalPages) {
            updatePageInfo(renderedPages);
            setTimeout(() => {
                alignCenterTopLeft(false);
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

function renderOnePage(pageNum, container, token) {
    currentPdfDoc.getPage(pageNum).then(page => {
        if (token !== currentRenderToken) return;

        const containerHeight = container.clientHeight;
        const viewport = page.getViewport({ scale: 1.0 });
        const baseScale = containerHeight / viewport.height;
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
                container.appendChild(canvas);
            }
        });
    });
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
            const occupiedWidth = scaledViewport.width + CANVAS_EXTRA_WIDTH;

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
