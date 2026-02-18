const settings = {
    defaultZoom: 1.0,
    scrollStep: 180,
    pageLabelPrefix: 'Blatt',
    zoomStep: 0.2  // 20% pro Stufe - hier anpassen!
};
let currentPdfDoc = null;
let currentPdfPath = "";
let currentPageOffset = 0;
let totalPages = 0;
let currentZoom = settings.defaultZoom;
let currentRenderToken = 0;  // Track render operations

function zoomIn() {
    const maxZoom = 1.0 + (settings.zoomStep * 4); // 1.8 (4x 20% = 80% größer)
    if (currentZoom < maxZoom) {
        currentZoom = Math.round((currentZoom + settings.zoomStep) * 10) / 10;
        console.log('Zoom IN:', currentZoom);
        if (currentPdfDoc) {
            renderPdfPages();
            setTimeout(() => updateScrollButtons(), 100);
        }
    }
}

function zoomOut() {
    const minZoom = 1.0;
    if (currentZoom > minZoom) {
        currentZoom = Math.round((currentZoom - settings.zoomStep) * 10) / 10;
        console.log('Zoom OUT:', currentZoom);
        if (currentPdfDoc) {
            renderPdfPages();
            setTimeout(() => updateScrollButtons(), 100);
        }
    }
}


function updateScrollButtons() {
    const container = document.getElementById('center-content');
    const scrollButtons = document.getElementById('scroll-buttons');
    
    if (!container || !scrollButtons) return;
    
    // Zeige Buttons nur wenn Inhalt größer als Container
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

    if (direction === 'up') {
        container.scrollTop = Math.max(0, container.scrollTop - step);
    } else {
        container.scrollTop = Math.min(maxScroll, container.scrollTop + step);
    }
}

function toggleWide() {
    const center = document.getElementById('CENTER');
    const btn = document.getElementById('wideBtn');
    
    if (center.classList.contains('wide')) {
        center.classList.remove('wide');
        btn.textContent = 'WIDE';
    } else {
        center.classList.add('wide');
        btn.textContent = 'NORMAL';
    }
    
    if (currentPdfDoc) renderPdfPages();
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

    const normalizedActual = normalizePdfServerPath(actualPath);
    const baseCandidates = [normalizedActual, ...pdfParts.map(normalizePdfServerPath)]
        .filter(Boolean)
        .map(p => p.split('/').pop())
        .filter(Boolean);

    const uniqueFileNames = [...new Set(baseCandidates)];

    currentPdfPath = normalizedActual;
    currentPageOffset = 0;

    const paths = [
        normalizedActual,
        ...uniqueFileNames.flatMap(name => [
            'myMusic/Noten/Blätter/' + name,
            'myMusic/Noten/' + name,
            '../myMusic/Noten/Blätter/' + name,
            '../myMusic/Noten/' + name
        ])
    ].filter(Boolean);
    
    let pathIndex = 0;
    
    function tryLoadPdf() {
        if (pathIndex >= paths.length) {
            console.error("PDF nicht erreichbar");
            const centerContainer = document.getElementById('center-content');
            centerContainer.innerHTML = '<div style="text-align:center; padding:20px;"><p>PDF nicht erreichbar</p><p style="font-size:10px; color:#999;">Pfad: ' + actualPath + '</p><button onclick="selectPdfManually()" style="padding:10px 20px; background:#3498db; color:white; border:none; border-radius:4px; cursor:pointer;">PDF öffnen</button></div>';
            return;
        }
        
        const serverPath = paths[pathIndex];
        console.log('Versuch ' + (pathIndex + 1) + ':', serverPath);
        
        pdfjsLib.getDocument(serverPath).promise.then(pdf => {
            console.log('PDF geladen von:', serverPath);
            currentPdfDoc = pdf;
            totalPages = pdf.numPages;
            renderPdfPages();
        }).catch(err => {
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
        centerContainer.innerHTML = '<div style="color:#ccc;">Lade PDF...</div>';
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            currentPdfDoc = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
            totalPages = currentPdfDoc.numPages;
            currentPageOffset = 0;
            renderPdfPages();
        } catch (err) {
            centerContainer.innerHTML = '<div style="color:#f00;">Fehler</div>';
        }
    };
    input.click();
}

function renderPdfPages() {
    let centerContainer = document.getElementById('center-content');
    
    if (!centerContainer || !currentPdfDoc) return;
    
    currentRenderToken++;  // Invalidate old render operations
    const token = currentRenderToken;
    centerContainer.innerHTML = '';
    
    const page1 = currentPageOffset + 1;
    const page2 = currentPageOffset + 2;
    
    if (page1 <= totalPages) renderOnePage(page1, centerContainer, token);
    if (page2 <= totalPages) renderOnePage(page2, centerContainer, token);
    
    updatePageInfo();
    // Beim Zoomen oben ausrichten
    centerContainer.scrollTop = 0;
    
    // Warte bis Canvas gerendert sind, dann Scroll-Buttons aktualisieren
    setTimeout(() => updateScrollButtons(), 100);
}

function renderOnePage(pageNum, container, token) {
    currentPdfDoc.getPage(pageNum).then(page => {
        if (token !== currentRenderToken) return;  // Ignore old render operations
        // Berechne Scale basierend auf Center-Höhe
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

function updatePageInfo() {
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
        pageInfo.textContent = currentPdfDoc ? 
            (currentPageOffset + 1) + ' - ' + Math.min(currentPageOffset + 2, totalPages) + ' / ' + totalPages :
            '- / -';
    }
}

function previousPage() {
    if (currentPageOffset > 0) {
        currentPageOffset -= 2;
        currentZoom = settings.defaultZoom;
        renderPdfPages();
    }
}

function nextPage() {
    if (currentPageOffset + 2 < totalPages) {
        currentPageOffset += 2;
        currentZoom = settings.defaultZoom;
        renderPdfPages();
    }
}
