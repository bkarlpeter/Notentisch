// Neue Version: PDF-Pfad immer relativ zum Projekt-Root
// Original bleibt erhalten

function normalizePdfServerPathV2(pdfPath) {
    if (!pdfPath) return '';
    let path = pdfPath.trim();
    // Ersetze Backslashes durch Slashes
    path = path.replace(/\\/g, '/');
    // Entferne alle '../' am Anfang
    while (path.startsWith('../')) path = path.substring(3);
    // Entferne Laufwerksbuchstaben und absolute Windows-Pfade
    path = path.replace(/^([a-zA-Z]:)?\/?/, '');
    // Entferne führende und doppelte Slashes
    path = path.replace(/^\/+/, '').replace(/\/+/, '/');
    // Robust: Suche nach beliebigem Blätter/ oder Noten/ im Pfad und mappe immer auf Blätter/Dateiname.pdf
    const pdfNameMatch = path.match(/(?:Blätter|Noten)[\/]+([^\/]+\.pdf)$/i);
    if (pdfNameMatch) {
        return 'Blätter/' + pdfNameMatch[1].trim();
    }
    // Optional: Nur erlaubte Ordner
    const allowedRoots = ['Noten', 'Blätter', 'board_files', 'Cards_Export', 'History'];
    const parts = path.split('/');
    if (allowedRoots.includes(parts[0])) {
        // Entferne führende/nachfolgende Leerzeichen aus allen Teilen
        return parts.map(p => p.trim()).join('/');
    }
    // Fallback: Immer Blätter/ vor den Dateinamen setzen, Dateiname getrimmt
    return 'Blätter/' + parts[parts.length - 1].trim();
}

// Anwendung: showPdfPages() oder PDF-Ladefunktionen können diese Version nutzen
// Beispiel:
// const normalizedPath = normalizePdfServerPathV2(pdfPath);
// pdfjsLib.getDocument(normalizedPath).promise.then(...);
