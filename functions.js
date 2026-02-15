const settings = {
    defaultZoom: 0.8,
    scrollStep: 180,
    pageLabelPrefix: 'Blatt'
};
let currentPdfDoc = null;
let currentPdfPath = "";
let currentPageOffset = 0;
let totalPages = 0;
let currentZoom = settings.defaultZoom;

function setZoom(zoomLevel) {
    currentZoom = zoomLevel;
    document.getElementById('zoom-100').style.background = zoomLevel === 1.0 ? '#3498db' : '#555';
    document.getElementById('zoom-90').style.background = zoomLevel === 0.9 ? '#3498db' : '#555';
    document.getElementById('zoom-80').style.background = zoomLevel === 0.8 ? '#3498db' : '#555';
    if (currentPdfDoc) renderPdfPages();
}

function isLayout1() {
    const layout2x2 = document.getElementById('layout-2x2');
    return !layout2x2.classList.contains('hidden');
}

function normalizePdfServerPath(pdfPath) {
    if (!pdfPath) return '';
    let path = pdfPath.trim();
    while (path.includes('\\')) path = path.replace('\\', '/');
    while (path.startsWith('../')) path = path.substring(3);
    console.log('PDF-Pfad normalisiert:', path);
    return path;
}

function toggleLayout() {
    const layout1 = document.getElementById('layout-2x2');
    const layout2 = document.getElementById('layout-80-20');
    layout1.classList.toggle('hidden');
    layout2.classList.toggle('hidden');
    if (currentPdfDoc) renderPdfPages();
}

function showPdfPages(pdfPath) {
    let actualPath = pdfPath;
    if (pdfPath.includes('#')) {
        const parts = pdfPath.split('#');
        actualPath = parts[1] || pdfPath;
    }
    
    currentPdfPath = actualPath;
    currentPageOffset = 0;
    
    const paths = [
        normalizePdfServerPath(actualPath),
        '../myMusic/Noten/' + actualPath.split('/').pop(),
        'myMusic/Noten/Blätter/' + actualPath.split('/').pop()
    ];
    
    let pathIndex = 0;
    
    function tryLoadPdf() {
        if (pathIndex >= paths.length) {
            console.error("PDF nicht erreichbar");
            const centerContainer = isLayout1() ? 
                document.getElementById('center-content') : 
                document.getElementById('center-content2');
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
        
        const centerContainer = isLayout1() ? 
            document.getElementById('center-content') : 
            document.getElementById('center-content2');
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
    let centerContainer = isLayout1() ? 
        document.getElementById('center-content') : 
        document.getElementById('center-content2');
    
    if (!centerContainer || !currentPdfDoc) return;
    
    centerContainer.innerHTML = '';
    
    const page1 = currentPageOffset + 1;
    const page2 = currentPageOffset + 2;
    
    if (page1 <= totalPages) renderOnePage(page1, centerContainer);
    if (page2 <= totalPages) renderOnePage(page2, centerContainer);
    
    updatePageInfo();
}

function renderOnePage(pageNum, container) {
    currentPdfDoc.getPage(pageNum).then(page => {
        const scale = 1.0 * currentZoom;
        const viewport = page.getViewport({ scale: scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.border = '1px solid #555';
        canvas.style.borderRadius = '4px';
        canvas.style.margin = '2px';
        
        page.render({ canvasContext: context, viewport: viewport }).promise.then(() => {
            container.appendChild(canvas);
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
        renderPdfPages();
    }
}

function nextPage() {
    if (currentPageOffset + 2 < totalPages) {
        currentPageOffset += 2;
        renderPdfPages();
    }
}
