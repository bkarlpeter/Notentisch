const settings = {
    defaultZoom: 1.0,
    scrollStep: 180,
    pageLabelPrefix: 'Blatt',
    zoomStep: 0.2
};

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
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            canvas.style.border = '1px solid #555';
            canvas.style.borderRadius = '4px';
            canvas.style.margin = '2px';

            page.render({ canvasContext: context, viewport: scaledViewport }).promise.then(() => {
                if (token === currentRenderToken) {
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
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.border = '1px solid #555';
        canvas.style.borderRadius = '4px';
        canvas.style.margin = '2px';

        page.render({ canvasContext: context, viewport: scaledViewport }).promise.then(() => {
            if (token === currentRenderToken) {
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
