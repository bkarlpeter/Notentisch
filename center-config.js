// Zentrale User-/Center-Konfiguration für Notentisch.
//
// Ziel:
// - Alle relevanten Center-Parameter an einer Stelle dokumentieren.
// - Einheitliche Defaults + Grenzen für Board und Config-Seite.
// - Werte dauerhaft in localStorage (Key: notentischUserConfig) speichern.

(function initializeNotentischConfig() {
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

    function normalizeTintMethod(value, fallback) {
        const input = String(value || '').trim();
        if (input === 'paper-only' || input === 'paper-strong') return input;
        return fallback;
    }

    function normalizeLayoutPreset(value, fallback) {
        const input = String(value || '').trim();
        if (input === 'monitor-2x3' || input === 'standard') return input;
        return fallback;
    }

    function normalizeCenterAlign(value, fallback) {
        const input = String(value || '').trim().toLowerCase();
        if (input === 'left' || input === 'right' || input === 'middle') return input;
        return fallback;
    }

    function normalizeCenterZoomFocus(value, fallback) {
        return 'left-top';
    }

    function normalizePageInfoTone(value, fallback) {
        const input = String(value || '').trim().toLowerCase();
        if (input === 'dunkel' || input === 'normal' || input === 'hell') return input;
        return fallback;
    }

    function normalizeAudioMatchStrictness(value, fallback) {
        const input = String(value || '').trim().toLowerCase();
        if (input === 'locker' || input === 'normal' || input === 'streng') return input;
        return fallback;
    }

    function normalizeBoolean(value, fallback) {
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === '1' || value === 1 || value === 'show') return true;
        if (value === 'false' || value === '0' || value === 0 || value === 'hide') return false;
        return fallback;
    }

    window.NOTENTISCH_USER_CONFIG_DEFAULTS = {
        // Versionsnummer für spätere Migrationen des Config-Formats.
        configVersion: 1,

        // Qualitätsschärfe der PDF-Canvas-Ausgabe (1.0 = normal).
        pdfSharpness: 1.0,

        // Papierfärbung in Prozent (0..25) für besseres Notenblatt-Feeling.
        paperTintPercent: 3,

        // Grundfarbe des Papier-Tints als Hex-Farbwert.
        paperTintColor: '#f5ebd2',

        // Tinting-Modus: "paper-only" (dezent) oder "paper-strong" (kräftiger).
        tintMethod: 'paper-only',

        // Zusätzliche Intensität des Tints (Multiplikator).
        tintStrength: 1.0,

        // Zoom-Schritt pro Klick auf +/-.
        zoomStep: 0.05,

        // Vertikaler Scroll-Schritt im Center in Pixeln.
        scrollStep: 180,

        // Helligkeitsstufe der Seitenanzeige (dunkel/normal/hell).
        pageInfoTone: 'normal',

        // Layout-Preset für die Gesamtansicht.
        layoutPreset: 'standard',

        // Sichtbarkeit des Fullscreen-Buttons in der Leiste.
        showFullscreenButton: true,

        // Vollbild beim Start automatisch anfordern.
        autoFullscreenOnStart: true,

        // Horizontale Grundausrichtung der Seiten im Center.
        centerAlign: 'left',

        // Zoom-Fokuspunkt: links/oben, rechts/oben oder Center-Mitte.
        centerZoomFocus: 'left-top',

        // Startzoom beim Reset/Fit-Höhe.
        centerDefaultZoom: 1.0,

        // Untere Zoomgrenze im Center.
        centerMinZoom: 0.4,

        // Obere Zoomgrenze im Center.
        centerMaxZoom: 2.6,

        // Debounce-Zeit (ms) bis ein neuer Render nach Zoom ausgelöst wird.
        centerZoomDebounceMs: 90,

        // Aktiviert kontinuierlichen Zoom bei langem Drücken.
        centerZoomHoldEnabled: true,

        // Verzögerung (ms), bevor Dauerzoom startet.
        centerZoomHoldDelayMs: 320,

        // Intervall (ms) für Dauerzoom-Wiederholung.
        centerZoomHoldIntervalMs: 90,

        // Zusätzlicher horizontaler Platzbedarf je gerenderter Seite (Rahmen/Margin).
        centerCanvasExtraWidth: 6,

        // Anzahl Seiten für Fit-Breite im 2:3-Preset (wenn nicht wide/full).
        centerFitMonitorPages: 3,

        // Smooth-Scroll im Center aktivieren/deaktivieren.
        centerSmoothScroll: true,

        // Beim Drop ins Center gespeicherte Zoom-/Ausrichtungswerte aus XML automatisch anwenden.
        useZoomSettingsOnDrop: true,

        // Nachglühen-Rahmen beim Ablegen in Quadranten (Millisekunden).
        dropGlowDurationMs: 1400,

        // Überlappung zwischen zwei Stapel-Batches (Anzahl Karten).
        stackBatchOverlapCount: 2,

        // Ziel-Dauer einer Audio-Referenzaufnahme in Millisekunden.
        audioReferenceTargetMs: 5000,

        // Verzögerung (ms) bis eine neue Aufnahme im Ton-Rec-Modus startet.
        audioRecordStartDelayMs: 0,

        // Wartezeit (ms) nach einem erfolgreichen Tontreffer, bevor erneut gematcht wird.
        audioWaitAfterMatchMs: 4000,

        // Erkennungs-Strenge der Tonzuordnung: locker/normal/streng.
        audioMatchStrictness: 'normal',

        // Dauer (ms) des weißen Aufleuchten an BTN2 wenn die Wartezeit abgelaufen ist.
        audioReadyBlinkMs: 1000,

        // Alte Audio-Sequenzen pro Titel beim Neuaufnehmen entfernen.
        replaceAudioByTitle: true,

        // Marker in der Karten-Ecke anzeigen, wenn eine Audio-Referenz existiert.
        showAudioBadge: true,

        // Grundfarbe der Steuerleisten-Buttons im Ausgangszustand (Hex).
        btnBaseColor: '#3498db',

        // Farbe fuer den ersten Toggle-Schritt.
        btnToggleColor1: '#27ae60',

        // Farbe fuer den zweiten Toggle-Schritt.
        btnToggleColor2: '#52be80'
    };

    window.notentischNormalizeUserConfig = function notentischNormalizeUserConfig(rawConfig) {
        const defaults = window.NOTENTISCH_USER_CONFIG_DEFAULTS;
        const parsed = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};

        return {
            ...defaults,
            ...parsed,
            configVersion: clampNumber(parsed.configVersion, 1, 999, defaults.configVersion),
            pdfSharpness: clampNumber(parsed.pdfSharpness, 0.8, 2.5, defaults.pdfSharpness),
            paperTintPercent: clampNumber(parsed.paperTintPercent, 0, 25, defaults.paperTintPercent),
            paperTintColor: normalizeHexColor(parsed.paperTintColor, defaults.paperTintColor),
            tintMethod: normalizeTintMethod(parsed.tintMethod, defaults.tintMethod),
            tintStrength: clampNumber(parsed.tintStrength, 0.5, 2.0, defaults.tintStrength),
            zoomStep: clampNumber(parsed.zoomStep, 0.02, 0.5, defaults.zoomStep),
            scrollStep: clampNumber(parsed.scrollStep, 60, 800, defaults.scrollStep),
            pageInfoTone: normalizePageInfoTone(parsed.pageInfoTone, defaults.pageInfoTone),
            layoutPreset: normalizeLayoutPreset(parsed.layoutPreset, defaults.layoutPreset),
            showFullscreenButton: normalizeBoolean(parsed.showFullscreenButton, defaults.showFullscreenButton),
            autoFullscreenOnStart: normalizeBoolean(parsed.autoFullscreenOnStart, defaults.autoFullscreenOnStart),
            centerAlign: normalizeCenterAlign(parsed.centerAlign, defaults.centerAlign),
            centerZoomFocus: normalizeCenterZoomFocus(parsed.centerZoomFocus, defaults.centerZoomFocus),
            centerDefaultZoom: clampNumber(parsed.centerDefaultZoom, 0.05, 2.0, defaults.centerDefaultZoom),
            centerMinZoom: clampNumber(parsed.centerMinZoom, 0.05, 2.0, defaults.centerMinZoom),
            centerMaxZoom: clampNumber(parsed.centerMaxZoom, 0.2, 5.0, defaults.centerMaxZoom),
            centerZoomDebounceMs: clampNumber(parsed.centerZoomDebounceMs, 20, 600, defaults.centerZoomDebounceMs),
            centerZoomHoldEnabled: normalizeBoolean(parsed.centerZoomHoldEnabled, defaults.centerZoomHoldEnabled),
            centerZoomHoldDelayMs: clampNumber(parsed.centerZoomHoldDelayMs, 80, 1000, defaults.centerZoomHoldDelayMs),
            centerZoomHoldIntervalMs: clampNumber(parsed.centerZoomHoldIntervalMs, 30, 400, defaults.centerZoomHoldIntervalMs),
            centerCanvasExtraWidth: clampNumber(parsed.centerCanvasExtraWidth, 0, 40, defaults.centerCanvasExtraWidth),
            centerFitMonitorPages: clampNumber(parsed.centerFitMonitorPages, 1, 6, defaults.centerFitMonitorPages),
            centerSmoothScroll: normalizeBoolean(parsed.centerSmoothScroll, defaults.centerSmoothScroll),
            useZoomSettingsOnDrop: normalizeBoolean(parsed.useZoomSettingsOnDrop, defaults.useZoomSettingsOnDrop),
            dropGlowDurationMs: clampNumber(parsed.dropGlowDurationMs, 0, 10000, defaults.dropGlowDurationMs),
            stackBatchOverlapCount: clampNumber(parsed.stackBatchOverlapCount, 0, 9, defaults.stackBatchOverlapCount),
            audioReferenceTargetMs: clampNumber(parsed.audioReferenceTargetMs, 1500, 12000, defaults.audioReferenceTargetMs),
            audioRecordStartDelayMs: clampNumber(parsed.audioRecordStartDelayMs, 0, 3000, defaults.audioRecordStartDelayMs),
            audioWaitAfterMatchMs: clampNumber(parsed.audioWaitAfterMatchMs, 4000, 8000, defaults.audioWaitAfterMatchMs),
            audioMatchStrictness: normalizeAudioMatchStrictness(parsed.audioMatchStrictness, defaults.audioMatchStrictness),
            audioReadyBlinkMs: clampNumber(parsed.audioReadyBlinkMs, 200, 3000, defaults.audioReadyBlinkMs),
            replaceAudioByTitle: normalizeBoolean(parsed.replaceAudioByTitle, defaults.replaceAudioByTitle),
            showAudioBadge: normalizeBoolean(parsed.showAudioBadge, defaults.showAudioBadge),
            btnBaseColor: normalizeHexColor(parsed.btnBaseColor, defaults.btnBaseColor),
            btnToggleColor1: normalizeHexColor(parsed.btnToggleColor1, defaults.btnToggleColor1),
            btnToggleColor2: normalizeHexColor(parsed.btnToggleColor2, defaults.btnToggleColor2)
        };
    };
})();
