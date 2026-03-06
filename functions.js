const USER_CONFIG_KEY = 'notentischUserConfig';
const USER_CONFIG_DEFAULTS = {
    pdfSharpness: 1.0,
    paperTintPercent: 3,
    paperTintColor: '#f5ebd2',
    tintMethod: 'paper-only',
    tintStrength: 1.0,
    layoutPreset: 'standard',
    showFullscreenButton: true
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

function normalizeTintMethod(value) {
    const input = String(value || '').trim();
    if (input === 'paper-only' || input === 'paper-strong') return input;
    return USER_CONFIG_DEFAULTS.tintMethod;
}

function normalizeTintStrength(value) {
    return clampNumber(value, 0.5, 2.0, USER_CONFIG_DEFAULTS.tintStrength);
}

function normalizeLayoutPreset(value) {
    const input = String(value || '').trim();
    if (input === 'monitor-2x3' || input === 'standard') return input;
    return USER_CONFIG_DEFAULTS.layoutPreset;
}

function normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1 || value === 'show') return true;
    if (value === 'false' || value === '0' || value === 0 || value === 'hide') return false;
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

function getTintOpacityFromPercent(percent) {
    const normalized = clampNumber(percent / 25, 0, 1, USER_CONFIG_DEFAULTS.paperTintPercent / 25);
    return clampNumber(normalized * 0.6, 0, 0.6, 0.08);
}

function getEffectiveTintOpacity(percent, strength) {
    const baseOpacity = getTintOpacityFromPercent(percent);
    const normalizedStrength = normalizeTintStrength(strength);
    return clampNumber(baseOpacity * normalizedStrength, 0, 0.85, 0.08);
}

function getTintProfile(method) {
    switch (method) {
        case 'paper-strong':
            return { minLum: 140, maxSat: 95, lumSpan: 110 };
        case 'paper-only':
        default:
            return { minLum: 155, maxSat: 72, lumSpan: 100 };
    }
}

function loadUserConfig() {
    try {
        const raw = localStorage.getItem(USER_CONFIG_KEY);
        if (!raw) return { ...USER_CONFIG_DEFAULTS };
        const parsed = JSON.parse(raw);
        return {
            pdfSharpness: clampNumber(parsed.pdfSharpness, 0.8, 2.5, USER_CONFIG_DEFAULTS.pdfSharpness),
            paperTintPercent: clampNumber(parsed.paperTintPercent, 0, 25, USER_CONFIG_DEFAULTS.paperTintPercent),
            paperTintColor: normalizeHexColor(parsed.paperTintColor, USER_CONFIG_DEFAULTS.paperTintColor),
            tintMethod: normalizeTintMethod(parsed.tintMethod),
            tintStrength: normalizeTintStrength(parsed.tintStrength),
            layoutPreset: normalizeLayoutPreset(parsed.layoutPreset),
            showFullscreenButton: normalizeBoolean(parsed.showFullscreenButton, USER_CONFIG_DEFAULTS.showFullscreenButton)
        };
    } catch (err) {
        return { ...USER_CONFIG_DEFAULTS };
    }
}

function applyLayoutPreset(preset) {
    const root = document.documentElement;
    if (!root) return;

    if (preset === 'monitor-2x3') {
        root.style.setProperty('--card-stack-width', '210px');
        root.style.setProperty('--center-bottom-gap', '46px');
        root.style.setProperty('--center-min-width', '760px');
        root.style.setProperty('--center-max-width', '1700px');
        return;
    }

    root.style.setProperty('--card-stack-width', '260px');
    root.style.setProperty('--center-bottom-gap', '80px');
    root.style.setProperty('--center-min-width', '680px');
    root.style.setProperty('--center-max-width', '1400px');
}

function applyCenterAppearance() {
    const centerContainer = document.getElementById('center-content');
    if (!centerContainer) return;
    centerContainer.style.background = 'rgba(52, 152, 219, 0.12)';
}

function applyPaperTintOverlay(context, canvas) {
    const opacity = getEffectiveTintOpacity(settings.paperTintPercent, settings.tintStrength);
    if (opacity <= 0) return;

    const tintRgb = hexToRgb(settings.paperTintColor);
    const profile = getTintProfile(settings.tintMethod);
    try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        for (let i = 0; i < pixels.length; i += 4) {
            const alpha = pixels[i + 3];
            if (alpha === 0) continue;

            const red = pixels[i];
            const green = pixels[i + 1];
            const blue = pixels[i + 2];

            const maxChannel = Math.max(red, green, blue);
            const minChannel = Math.min(red, green, blue);
            const saturation = maxChannel - minChannel;
            const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

            if (luminance < profile.minLum || saturation > profile.maxSat) continue;

            const paperStrength = clampNumber((luminance - profile.minLum) / profile.lumSpan, 0, 1, 0);
            const blend = opacity * paperStrength;
            if (blend <= 0) continue;

            pixels[i] = Math.round((red * (1 - blend)) + (tintRgb.r * blend));
            pixels[i + 1] = Math.round((green * (1 - blend)) + (tintRgb.g * blend));
            pixels[i + 2] = Math.round((blue * (1 - blend)) + (tintRgb.b * blend));
        }

        context.putImageData(imageData, 0, 0);
    } catch (err) {
        context.save();
        context.globalCompositeOperation = 'multiply';
        context.fillStyle = 'rgba(' + tintRgb.r + ', ' + tintRgb.g + ', ' + tintRgb.b + ', ' + opacity + ')';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
    }
}

function applyUserConfigAndRefresh(shouldRerender = true) {
    const userConfig = loadUserConfig();
    settings.pdfSharpness = userConfig.pdfSharpness;
    settings.paperTintPercent = userConfig.paperTintPercent;
    settings.paperTintColor = userConfig.paperTintColor;
    settings.tintMethod = userConfig.tintMethod;
    settings.tintStrength = userConfig.tintStrength;
    settings.layoutPreset = userConfig.layoutPreset;
    settings.showFullscreenButton = userConfig.showFullscreenButton;
    applyLayoutPreset(settings.layoutPreset);
    applyFullscreenButtonVisibility(settings.showFullscreenButton);
    applyCenterAppearance();

    if (shouldRerender && currentPdfDoc) {
        renderPdfPages();
    }
}

function openConfigPage() {
    window.open('config.html', '_blank');
}

function syncFullscreenButtonState() {
    const btn = document.getElementById('fullscreenBtn');
    if (!btn) return;

    const inFullscreen = !!document.fullscreenElement;
    btn.textContent = inFullscreen ? 'ESC' : 'F11';
    btn.style.background = inFullscreen ? '#27ae60' : '#1a1a1a';
    btn.style.borderColor = inFullscreen ? '#2f8f55' : '#4d4d4d';
    btn.style.color = '#c6d0da';
}

function applyFullscreenButtonVisibility(visible) {
    const btn = document.getElementById('fullscreenBtn');
    if (!btn) return;
    btn.style.display = visible ? '' : 'none';
}

async function toggleFullscreenMode() {
    try {
        if (!document.fullscreenElement) {
            const root = document.documentElement;
            if (root && root.requestFullscreen) {
                await root.requestFullscreen();
            }
        } else if (document.exitFullscreen) {
            await document.exitFullscreen();
        }
    } catch (err) {
    }

    syncFullscreenButtonState();
}

async function requestShutdownAndExit() {
    const endBtn = document.getElementById('endBtn');
    const previousText = endBtn ? endBtn.textContent : '';

    if (endBtn) {
        endBtn.disabled = true;
        endBtn.textContent = 'Ende...';
    }

    const shutdownUrl = window.location.origin + '/__shutdown__';
    let sent = false;

    try {
        if (navigator.sendBeacon) {
            const payload = new Blob(['shutdown'], { type: 'text/plain' });
            sent = navigator.sendBeacon(shutdownUrl, payload);
        }

        if (!sent) {
            await fetch(shutdownUrl, {
                method: 'POST',
                cache: 'no-store',
                keepalive: true,
                headers: { 'Content-Type': 'text/plain' },
                body: 'shutdown'
            });
        }
    } catch (err) {
    }

    try {
        window.close();
    } catch (err) {
    }

    setTimeout(() => {
        window.location.href = 'about:blank';
    }, 180);

    if (endBtn) {
        setTimeout(() => {
            endBtn.disabled = false;
            endBtn.textContent = previousText || 'Ende';
        }, 700);
    }
}

const initialUserConfig = loadUserConfig();

const settings = {
    defaultZoom: 1.0,
    scrollStep: 180,
    pageLabelPrefix: 'Blatt',
    zoomStep: 0.2,
    pdfSharpness: initialUserConfig.pdfSharpness,
    paperTintPercent: initialUserConfig.paperTintPercent,
    paperTintColor: initialUserConfig.paperTintColor,
    tintMethod: initialUserConfig.tintMethod,
    tintStrength: initialUserConfig.tintStrength,
    layoutPreset: initialUserConfig.layoutPreset,
    showFullscreenButton: initialUserConfig.showFullscreenButton
};

window.addEventListener('storage', (event) => {
    if (event.key !== USER_CONFIG_KEY) return;
    applyUserConfigAndRefresh(true);
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        applyUserConfigAndRefresh(false);
        syncWideButtonState();
        syncFullscreenButtonState();
    });
} else {
    applyUserConfigAndRefresh(false);
    syncWideButtonState();
    syncFullscreenButtonState();
}

document.addEventListener('fullscreenchange', syncFullscreenButtonState);

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
    const center = document.getElementById('CENTER');
    if (!centerContainer) return;

    const maxWidth = centerContainer.clientWidth;
    const centerHeight = centerContainer.clientHeight;
    const isExpanded = !!(center && (center.classList.contains('wide') || center.classList.contains('full')));
    const useThreePages = settings.layoutPreset === 'monitor-2x3' && !isExpanded;
    const lastPageToFit = useThreePages
        ? Math.min(totalPages, currentPageOffset + 3)
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
