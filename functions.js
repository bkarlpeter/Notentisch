const USER_CONFIG_KEY = 'notentischUserConfig';
const BOARD_SESSION_STATE_KEY = 'notentischBoardSessionState';
const BOARD_SESSION_FALLBACK_KEY = 'notentischBoardSessionStateFallback';
const BOARD_CARD_LAYOUT_KEY = 'notentischBoardCardLayoutBuffer';
const BOARD_DOM_SNAPSHOT_KEY = 'notentischBoardDomSnapshot';
const BOARD_HISTORY_RETURN_KEY = 'notentischReturnToBoardViaHistory';
const BOARD_PENDING_CONFIG_RETURN_KEY = 'notentischPendingConfigReturn';
const BOARD_RETURN_FULLSCREEN_KEY = 'notentischReturnFullscreen';
let shutdownSessionToken = null;
const USER_CONFIG_DEFAULTS = window.NOTENTISCH_USER_CONFIG_DEFAULTS
    ? { ...window.NOTENTISCH_USER_CONFIG_DEFAULTS }
    : {
        configVersion: 1,
        pdfSharpness: 1.0,
        paperTintPercent: 3,
        paperTintColor: '#f5ebd2',
        tintMethod: 'paper-only',
        tintStrength: 1.0,
        zoomStep: 0.05,
        scrollStep: 180,
        pageInfoTone: 'normal',
        layoutPreset: 'standard',
        showFullscreenButton: true,
        autoFullscreenOnStart: true,
        centerAlign: 'left',
        centerZoomFocus: 'left-top',
        centerDefaultZoom: 1.0,
        centerMinZoom: 0.4,
        centerMaxZoom: 2.6,
        centerZoomDebounceMs: 90,
        centerZoomHoldEnabled: true,
        centerZoomHoldDelayMs: 320,
        centerZoomHoldIntervalMs: 90,
        centerCanvasExtraWidth: 6,
        centerFitMonitorPages: 3,
        centerCornerRadius: 20,
        centerSmoothScroll: true,
        useZoomSettingsOnDrop: true,
        dropGlowDurationMs: 1400,
        stackBatchOverlapCount: 2,
        audioReferenceTargetMs: 5000,
        replaceAudioByTitle: true,
        showAudioBadge: true
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

function normalizeZoomStep(value) {
    return clampNumber(value, 0.02, 0.5, USER_CONFIG_DEFAULTS.zoomStep);
}

function normalizeScrollStep(value) {
    return clampNumber(value, 60, 800, USER_CONFIG_DEFAULTS.scrollStep);
}

function captureBoardDomSnapshotForConfig() {
    const quadrants = {};
    let hasCards = false;

    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((quadrantId) => {
        const quadrant = document.getElementById(quadrantId);
        if (!quadrant) {
            quadrants[quadrantId] = [];
            return;
        }

        const cards = Array.from(quadrant.querySelectorAll('.card-container[data-cardid]'));
        quadrants[quadrantId] = cards.map((card) => card.outerHTML);
        if (cards.length > 0) {
            hasCards = true;
        }
    });

    if (!hasCards) {
        return null;
    }

    return {
        savedAt: Date.now(),
        quadrants,
        activeCenterCardId: (typeof activeCenterCardId !== 'undefined') ? activeCenterCardId : null,
        lastCardIdFromCenter: (typeof lastCardIdFromCenter !== 'undefined') ? lastCardIdFromCenter : null
    };
}

function restoreBoardDomSnapshotFromConfig(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;

    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((quadrantId) => {
        const quadrant = document.getElementById(quadrantId);
        if (!quadrant) return;

        quadrant.querySelectorAll('.card-container[data-cardid]').forEach((card) => card.remove());

        const htmlList = Array.isArray(snapshot.quadrants?.[quadrantId]) ? snapshot.quadrants[quadrantId] : [];
        htmlList.forEach((html) => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = String(html || '').trim();
            const card = wrapper.firstElementChild;
            if (!card) return;
            card.draggable = true;
            card.addEventListener('dragstart', drag);
            card.addEventListener('dblclick', handleCardDoubleClick);
            quadrant.appendChild(card);
        });
    });

    document.querySelectorAll('.card-container.in-center').forEach((card) => card.classList.remove('in-center'));

    if (snapshot.activeCenterCardId !== null && snapshot.activeCenterCardId !== undefined && snapshot.activeCenterCardId !== '') {
        const centerCard = document.querySelector('.card-container[data-cardid="' + String(snapshot.activeCenterCardId) + '"]');
        if (centerCard) {
            centerCard.classList.add('in-center');
            activeCenterCardId = String(snapshot.activeCenterCardId);
        }
    }

    if (typeof lastCardIdFromCenter !== 'undefined') {
        lastCardIdFromCenter = snapshot.lastCardIdFromCenter ?? lastCardIdFromCenter;
    }

    getRenderApi()?.updateStackLayout?.();
    return document.querySelectorAll('.card-container[data-cardid]').length > 0;
}

function normalizeCenterAlign(value) {
    const input = String(value || '').trim().toLowerCase();
    if (input === 'left' || input === 'right' || input === 'middle') return input;
    return USER_CONFIG_DEFAULTS.centerAlign;
}

function normalizeCenterZoomFocus(value) {
    return 'left-top';
}

function normalizePageInfoTone(value) {
    const input = String(value || '').trim().toLowerCase();
    if (input === 'dunkel' || input === 'normal' || input === 'hell') return input;
    return USER_CONFIG_DEFAULTS.pageInfoTone || 'normal';
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
        if (typeof window.notentischNormalizeUserConfig === 'function') {
            return window.notentischNormalizeUserConfig(parsed);
        }
        return {
            pdfSharpness: clampNumber(parsed.pdfSharpness, 0.8, 2.5, USER_CONFIG_DEFAULTS.pdfSharpness),
            paperTintPercent: clampNumber(parsed.paperTintPercent, 0, 25, USER_CONFIG_DEFAULTS.paperTintPercent),
            paperTintColor: normalizeHexColor(parsed.paperTintColor, USER_CONFIG_DEFAULTS.paperTintColor),
            tintMethod: normalizeTintMethod(parsed.tintMethod),
            tintStrength: normalizeTintStrength(parsed.tintStrength),
            zoomStep: normalizeZoomStep(parsed.zoomStep),
            scrollStep: normalizeScrollStep(parsed.scrollStep),
            pageInfoTone: normalizePageInfoTone(parsed.pageInfoTone),
            layoutPreset: normalizeLayoutPreset(parsed.layoutPreset),
            showFullscreenButton: normalizeBoolean(parsed.showFullscreenButton, USER_CONFIG_DEFAULTS.showFullscreenButton),
            autoFullscreenOnStart: normalizeBoolean(parsed.autoFullscreenOnStart, USER_CONFIG_DEFAULTS.autoFullscreenOnStart),
            centerAlign: normalizeCenterAlign(parsed.centerAlign),
            centerZoomFocus: normalizeCenterZoomFocus(parsed.centerZoomFocus),
            centerDefaultZoom: clampNumber(parsed.centerDefaultZoom, 0.05, 2.0, USER_CONFIG_DEFAULTS.centerDefaultZoom),
            centerMinZoom: clampNumber(parsed.centerMinZoom, 0.05, 2.0, USER_CONFIG_DEFAULTS.centerMinZoom),
            centerMaxZoom: clampNumber(parsed.centerMaxZoom, 0.2, 5.0, USER_CONFIG_DEFAULTS.centerMaxZoom),
            centerZoomDebounceMs: clampNumber(parsed.centerZoomDebounceMs, 20, 600, USER_CONFIG_DEFAULTS.centerZoomDebounceMs),
            centerZoomHoldEnabled: normalizeBoolean(parsed.centerZoomHoldEnabled, USER_CONFIG_DEFAULTS.centerZoomHoldEnabled),
            centerZoomHoldDelayMs: clampNumber(parsed.centerZoomHoldDelayMs, 80, 1000, USER_CONFIG_DEFAULTS.centerZoomHoldDelayMs),
            centerZoomHoldIntervalMs: clampNumber(parsed.centerZoomHoldIntervalMs, 30, 400, USER_CONFIG_DEFAULTS.centerZoomHoldIntervalMs),
            centerCanvasExtraWidth: clampNumber(parsed.centerCanvasExtraWidth, 0, 40, USER_CONFIG_DEFAULTS.centerCanvasExtraWidth),
            centerFitMonitorPages: clampNumber(parsed.centerFitMonitorPages, 1, 6, USER_CONFIG_DEFAULTS.centerFitMonitorPages),
            centerCornerRadius: clampNumber(parsed.centerCornerRadius, 0, 100, USER_CONFIG_DEFAULTS.centerCornerRadius),
            centerSmoothScroll: normalizeBoolean(parsed.centerSmoothScroll, USER_CONFIG_DEFAULTS.centerSmoothScroll),
            useZoomSettingsOnDrop: normalizeBoolean(parsed.useZoomSettingsOnDrop, USER_CONFIG_DEFAULTS.useZoomSettingsOnDrop),
            dropGlowDurationMs: clampNumber(parsed.dropGlowDurationMs, 0, 10000, USER_CONFIG_DEFAULTS.dropGlowDurationMs),
            stackBatchOverlapCount: clampNumber(parsed.stackBatchOverlapCount, 0, 9, USER_CONFIG_DEFAULTS.stackBatchOverlapCount),
            audioReferenceTargetMs: clampNumber(parsed.audioReferenceTargetMs, 1500, 12000, USER_CONFIG_DEFAULTS.audioReferenceTargetMs),
            audioRecordStartDelayMs: clampNumber(parsed.audioRecordStartDelayMs, 0, 3000, USER_CONFIG_DEFAULTS.audioRecordStartDelayMs || 0),
            audioWaitAfterMatchMs: clampNumber(parsed.audioWaitAfterMatchMs, 4000, 8000, USER_CONFIG_DEFAULTS.audioWaitAfterMatchMs || 4000),
            audioResetOnSilenceMs: (() => {
                const value = Number(parsed.audioResetOnSilenceMs);
                if (value === 800 || value === 1000 || value === 1500) return value;
                const fallback = Number(USER_CONFIG_DEFAULTS.audioResetOnSilenceMs);
                return (fallback === 800 || fallback === 1000 || fallback === 1500) ? fallback : 1500;
            })(),
            audioMatchStrictness: (() => {
                const value = String(parsed.audioMatchStrictness || '').trim().toLowerCase();
                if (value === 'locker' || value === 'normal' || value === 'streng') return value;
                return (String(USER_CONFIG_DEFAULTS.audioMatchStrictness || '').trim().toLowerCase() === 'locker' || String(USER_CONFIG_DEFAULTS.audioMatchStrictness || '').trim().toLowerCase() === 'normal' || String(USER_CONFIG_DEFAULTS.audioMatchStrictness || '').trim().toLowerCase() === 'streng')
                    ? String(USER_CONFIG_DEFAULTS.audioMatchStrictness).trim().toLowerCase()
                    : 'normal';
            })(),
            audioMatchExceptionalModesEnabled: normalizeBoolean(parsed.audioMatchExceptionalModesEnabled, USER_CONFIG_DEFAULTS.audioMatchExceptionalModesEnabled),
            audioReadyBlinkMs: clampNumber(parsed.audioReadyBlinkMs, 200, 3000, USER_CONFIG_DEFAULTS.audioReadyBlinkMs || 1000),
            replaceAudioByTitle: normalizeBoolean(parsed.replaceAudioByTitle, USER_CONFIG_DEFAULTS.replaceAudioByTitle),
            showAudioBadge: normalizeBoolean(parsed.showAudioBadge, USER_CONFIG_DEFAULTS.showAudioBadge),
            pdfBaseDir: (() => {
                const value = String(parsed.pdfBaseDir || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
                if (value === 'Blätter' || value === 'Noten/Blätter' || value === 'Noten') return value;
                const fallback = String(USER_CONFIG_DEFAULTS.pdfBaseDir || 'Blätter').trim();
                return fallback === 'Blätter' || fallback === 'Noten/Blätter' || fallback === 'Noten' ? fallback : 'Blätter';
            })(),
            cardSharpness: (() => {
                const value = String(parsed.cardSharpness || '').trim().toLowerCase();
                if (value === 'normal' || value === 'scharf1' || value === 'scharf2') return value;
                const fallback = String(USER_CONFIG_DEFAULTS.cardSharpness || 'normal').trim().toLowerCase();
                return fallback === 'normal' || fallback === 'scharf1' || fallback === 'scharf2' ? fallback : 'normal';
            })(),
            btnBaseColor: normalizeHexColor(parsed.btnBaseColor, USER_CONFIG_DEFAULTS.btnBaseColor),
            btnToggleColor1: normalizeHexColor(parsed.btnToggleColor1, USER_CONFIG_DEFAULTS.btnToggleColor1),
            btnToggleColor2: normalizeHexColor(parsed.btnToggleColor2, USER_CONFIG_DEFAULTS.btnToggleColor2)
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
    centerContainer.style.border = 'none';
    centerContainer.style.boxShadow = 'none';
}

function applyPageInfoTone(tone) {
    const root = document.documentElement;
    if (!root) return;

    const normalizedTone = normalizePageInfoTone(tone);
    if (normalizedTone === 'dunkel') {
        root.style.setProperty('--page-info-bg', '#1f1f1f');
        root.style.setProperty('--page-info-border', '#3c4d60');
        root.style.setProperty('--page-info-text', '#cbd8e6');
        return;
    }

    if (normalizedTone === 'hell') {
        root.style.setProperty('--page-info-bg', '#36414c');
        root.style.setProperty('--page-info-border', '#6f879d');
        root.style.setProperty('--page-info-text', '#edf5ff');
        return;
    }

    root.style.setProperty('--page-info-bg', '#2a2a2a');
    root.style.setProperty('--page-info-border', '#4b5f73');
    root.style.setProperty('--page-info-text', '#d8e6f3');
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
    settings.zoomStep = userConfig.zoomStep;
    settings.scrollStep = userConfig.scrollStep;
    settings.pageInfoTone = userConfig.pageInfoTone;
    settings.centerDefaultZoom = userConfig.centerDefaultZoom;
    settings.centerZoomFocus = userConfig.centerZoomFocus;
    settings.centerMinZoom = userConfig.centerMinZoom;
    settings.centerMaxZoom = userConfig.centerMaxZoom;
    settings.centerZoomDebounceMs = userConfig.centerZoomDebounceMs;
    settings.centerZoomHoldEnabled = userConfig.centerZoomHoldEnabled;
    settings.centerZoomHoldDelayMs = userConfig.centerZoomHoldDelayMs;
    settings.centerZoomHoldIntervalMs = userConfig.centerZoomHoldIntervalMs;
    settings.centerCanvasExtraWidth = userConfig.centerCanvasExtraWidth;
    document.documentElement.style.setProperty('--center-gap', userConfig.centerCanvasExtraWidth + 'px');
    document.documentElement.style.setProperty('--center-radius', userConfig.centerCornerRadius + 'px');
    settings.centerFitMonitorPages = userConfig.centerFitMonitorPages;
    settings.centerSmoothScroll = userConfig.centerSmoothScroll;
    settings.useZoomSettingsOnDrop = userConfig.useZoomSettingsOnDrop;
    settings.dropGlowDurationMs = userConfig.dropGlowDurationMs;
    settings.audioReferenceTargetMs = userConfig.audioReferenceTargetMs;
    settings.audioRecordStartDelayMs = userConfig.audioRecordStartDelayMs;
    settings.audioWaitAfterMatchMs = userConfig.audioWaitAfterMatchMs;
    settings.audioResetOnSilenceMs = userConfig.audioResetOnSilenceMs;
    settings.audioMatchStrictness = userConfig.audioMatchStrictness;
    settings.audioMatchExceptionalModesEnabled = userConfig.audioMatchExceptionalModesEnabled;
    settings.audioReadyBlinkMs = userConfig.audioReadyBlinkMs;
    settings.replaceAudioByTitle = userConfig.replaceAudioByTitle;
    settings.pdfBaseDir = userConfig.pdfBaseDir;
    settings.cardSharpness = userConfig.cardSharpness;
    settings.showAudioBadge = userConfig.showAudioBadge;
    settings.layoutPreset = userConfig.layoutPreset;
    settings.showFullscreenButton = userConfig.showFullscreenButton;
    settings.autoFullscreenOnStart = userConfig.autoFullscreenOnStart;
    settings.btnBaseColor = userConfig.btnBaseColor;
    settings.btnToggleColor1 = userConfig.btnToggleColor1;
    settings.btnToggleColor2 = userConfig.btnToggleColor2;
    applyBtnBaseColor(settings.btnBaseColor);
    if (typeof setCenterHorizontalAlign === 'function') {
        setCenterHorizontalAlign(userConfig.centerAlign);
    }
    applyLayoutPreset(settings.layoutPreset);
    if (typeof window.setBoardPreset === 'function') {
        window.setBoardPreset(userConfig.boardPreset);
    }
    applyPageInfoTone(settings.pageInfoTone);
    applyFullscreenButtonVisibility(settings.showFullscreenButton);
    applyCenterAppearance();
    if (typeof applyCenterHorizontalAlign === 'function') {
        applyCenterHorizontalAlign(false);
    }

    if (shouldRerender && typeof currentPdfDoc !== 'undefined' && currentPdfDoc && typeof renderPdfPages === 'function') {
        renderPdfPages();
    }

    const renderApi = window.NotentischRender;
    if (renderApi && typeof renderApi.syncVisibleCardAudioBadges === 'function') {
        renderApi.syncVisibleCardAudioBadges();
    }
}

function applyBtnBaseColor(color) {
    const valid = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#3498db';
    document.documentElement.style.setProperty('--btn-base', valid);
}

function getToggleStepColor(step) {
    const isSecondStep = Number(step) === 2;
    const fallback = isSecondStep ? '#52be80' : '#27ae60';
    const configured = isSecondStep ? settings.btnToggleColor2 : settings.btnToggleColor1;
    return /^#[0-9a-fA-F]{6}$/.test(String(configured || '')) ? configured : fallback;
}

function openConfigPage() {
    let state = null;
    let cardLayoutSnapshot = null;
    let domSnapshot = null;
    try {
        state = {
            savedAt: Date.now(),
            boardSnapshot: (typeof getBoardSnapshotForConfig === 'function')
                ? getBoardSnapshotForConfig()
                : null,
            center: (typeof getCurrentCenterRuntimeState === 'function')
                ? getCurrentCenterRuntimeState()
                : null
        };

        if (typeof getCardLayoutSnapshotForConfig === 'function') {
            cardLayoutSnapshot = getCardLayoutSnapshotForConfig();
            if (cardLayoutSnapshot) {
                state.cardLayout = cardLayoutSnapshot;
            }
        }

        domSnapshot = captureBoardDomSnapshotForConfig();
    } catch (err) {
    }

    if (cardLayoutSnapshot) {
        try {
            localStorage.setItem(BOARD_CARD_LAYOUT_KEY, JSON.stringify(cardLayoutSnapshot));
        } catch (err) {
        }
    }

    if (domSnapshot) {
        try {
            sessionStorage.setItem(BOARD_DOM_SNAPSHOT_KEY, JSON.stringify(domSnapshot));
        } catch (err) {
            try {
                localStorage.setItem(BOARD_DOM_SNAPSHOT_KEY, JSON.stringify(domSnapshot));
            } catch (fallbackErr) {
            }
        }
    }

    let savedToSession = false;
    if (state) {
        try {
            sessionStorage.setItem(BOARD_SESSION_STATE_KEY, JSON.stringify(state));
            savedToSession = true;
        } catch {
            // Quota überschritten – nochmal ohne centerVisual versuchen
            if (state.boardSnapshot) state.boardSnapshot.centerVisual = null;
            try {
                sessionStorage.setItem(BOARD_SESSION_STATE_KEY, JSON.stringify(state));
                savedToSession = true;
            } catch {
            }
        }
    }

    if (!savedToSession && state && state.boardSnapshot) {
        const fallbackState = {
            savedAt: Date.now(),
            boardSnapshot: {
                xmlText: state.boardSnapshot.xmlText || '',
                xmlFileName: state.boardSnapshot.xmlFileName || null,
                quadrantOffsets: state.boardSnapshot.quadrantOffsets || { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
                stackCount: Number.isFinite(Number(state.boardSnapshot.stackCount)) ? Number(state.boardSnapshot.stackCount) : 8,
                lastCardIdFromCenter: state.boardSnapshot.lastCardIdFromCenter ?? null,
                activeCenterCardId: state.boardSnapshot.activeCenterCardId ?? null,
                overviewModeActive: !!state.boardSnapshot.overviewModeActive,
                centerVisual: null
            },
            center: state.center || null
        };

        try {
            localStorage.setItem(BOARD_SESSION_FALLBACK_KEY, JSON.stringify(fallbackState));
        } catch (err) {
        }
    }

    try {
        sessionStorage.setItem(BOARD_HISTORY_RETURN_KEY, String(Date.now()));
        sessionStorage.setItem(BOARD_PENDING_CONFIG_RETURN_KEY, '1');
    } catch (err) {
    }

    try {
        sessionStorage.setItem(BOARD_RETURN_FULLSCREEN_KEY, document.fullscreenElement ? '1' : '0');
    } catch (err) {
    }

    window.location.assign('config.html?v=20260429c');
}

async function restoreBoardSessionState() {
    let parsed = null;
    let source = 'session';
    let cardLayoutSnapshot = null;
    let domSnapshot = null;
    try {
        const raw = sessionStorage.getItem(BOARD_SESSION_STATE_KEY);
        if (raw) {
            parsed = JSON.parse(raw);
        }
    } catch (err) {
        parsed = null;
    }

    if (!parsed) {
        try {
            const rawFallback = localStorage.getItem(BOARD_SESSION_FALLBACK_KEY);
            if (rawFallback) {
                parsed = JSON.parse(rawFallback);
                source = 'fallback';
            }
        } catch (err) {
            parsed = null;
        }
    }

    if (parsed && parsed.cardLayout && typeof parsed.cardLayout === 'object') {
        cardLayoutSnapshot = parsed.cardLayout;
    }

    if (!cardLayoutSnapshot) {
        try {
            const rawLayout = localStorage.getItem(BOARD_CARD_LAYOUT_KEY);
            if (rawLayout) {
                cardLayoutSnapshot = JSON.parse(rawLayout);
            }
        } catch (err) {
            cardLayoutSnapshot = null;
        }
    }

    try {
        const rawDom = sessionStorage.getItem(BOARD_DOM_SNAPSHOT_KEY) || localStorage.getItem(BOARD_DOM_SNAPSHOT_KEY);
        if (rawDom) {
            domSnapshot = JSON.parse(rawDom);
        }
    } catch (err) {
        domSnapshot = null;
    }

    if (!parsed && !cardLayoutSnapshot && !domSnapshot) {
        return;
    }

    const hasBoardSnapshot = !!(parsed && parsed.boardSnapshot);
    const hasCenterState = !!(parsed && parsed.center);
    const canRestoreBoard = !hasBoardSnapshot || typeof restoreBoardSnapshotFromConfig === 'function';
    const canRestoreCenter = !hasCenterState || typeof restoreCenterRuntimeState === 'function';
    const canRestoreCardLayout = !cardLayoutSnapshot || typeof applyCardLayoutSnapshotFromConfig === 'function';
    const canRestoreDomSnapshot = !domSnapshot || (typeof drag === 'function' && typeof handleCardDoubleClick === 'function');
    const needsXmlHydrationForLayout = !hasBoardSnapshot
        && !domSnapshot
        && !!cardLayoutSnapshot
        && document.querySelectorAll('.card-container[data-cardid]').length === 0;
    const canHydrateFromStoredXml = !needsXmlHydrationForLayout
        || (typeof loadXmlDirectFileHandle === 'function' && typeof openAndLoadXmlHandle === 'function');

    // Wird functions.js vor filehandling.js ausgeführt, fehlen Restore-Funktionen noch.
    // Snapshot bleibt dann liegen und wird später erneut versucht.
    if (!canRestoreBoard || !canRestoreCenter || !canRestoreCardLayout || !canHydrateFromStoredXml || !canRestoreDomSnapshot) {
        return;
    }

    if (parsed && !parsed.center && !parsed.boardSnapshot && !cardLayoutSnapshot && !domSnapshot) {
        sessionStorage.removeItem(BOARD_SESSION_STATE_KEY);
        localStorage.removeItem(BOARD_SESSION_FALLBACK_KEY);
        return;
    }

    try {
        // Nur ueberspringen, wenn wir bereits einen vollstaendigen Snapshot zum Wiederaufbau haben.
        if (hasBoardSnapshot || hasCenterState) {
            sessionStorage.setItem('notentischSkipAutoLoadSavedFolder', '1');
        } else {
            sessionStorage.removeItem('notentischSkipAutoLoadSavedFolder');
        }
    } catch (err) {
    }

    if (parsed && parsed.boardSnapshot && typeof restoreBoardSnapshotFromConfig === 'function') {
        restoreBoardSnapshotFromConfig(parsed.boardSnapshot, {
            preferDomRestore: true
        });
    }

    if (domSnapshot && document.querySelectorAll('.card-container[data-cardid]').length === 0) {
        const domRestored = restoreBoardDomSnapshotFromConfig(domSnapshot);
        if (!domRestored && !parsed && !cardLayoutSnapshot) {
            return;
        }
    }

    if (needsXmlHydrationForLayout) {
        let hydrated = false;
        try {
            const handle = await loadXmlDirectFileHandle();
            if (handle) {
                let permission = 'granted';
                if (typeof handle.queryPermission === 'function') {
                    permission = await handle.queryPermission({ mode: 'read' });
                }
                if (permission === 'prompt' && typeof handle.requestPermission === 'function') {
                    permission = await handle.requestPermission({ mode: 'read' });
                }
                if (permission === 'granted') {
                    await openAndLoadXmlHandle(handle);
                    hydrated = document.querySelectorAll('.card-container[data-cardid]').length > 0;
                }
            }
        } catch (err) {
            hydrated = false;
        }

        if (!hydrated && document.querySelectorAll('.card-container[data-cardid]').length === 0) {
            // Snapshot erhalten, damit filehandling.js oder ein spaeterer Retry erneut wiederherstellen kann.
            return;
        }
    }

    // restoreCenterRuntimeState wird immer aufgerufen, damit showPdfPages das PDF lädt
    // und currentPdfDoc gesetzt wird. Ohne dies bricht queueZoomRender() mit
    // "if (!currentPdfDoc) return" ab und Zoom funktioniert nicht.
    if (parsed && parsed.center && typeof restoreCenterRuntimeState === 'function') {
        restoreCenterRuntimeState(parsed.center, { preserveConfiguredFocus: true });
    }

    if (cardLayoutSnapshot && typeof applyCardLayoutSnapshotFromConfig === 'function') {
        applyCardLayoutSnapshotFromConfig(cardLayoutSnapshot, { attempts: 20, retryDelayMs: 80 });
    }

    if (source === 'session') {
        sessionStorage.removeItem(BOARD_SESSION_STATE_KEY);
    }
    localStorage.removeItem(BOARD_SESSION_FALLBACK_KEY);
    localStorage.removeItem(BOARD_CARD_LAYOUT_KEY);
    sessionStorage.removeItem(BOARD_DOM_SNAPSHOT_KEY);
    localStorage.removeItem(BOARD_DOM_SNAPSHOT_KEY);
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

async function applyDefaultFullscreenState() {
    if (document.fullscreenElement) {
        syncFullscreenButtonState();
        return true;
    }

    try {
        const root = document.documentElement;
        if (root && root.requestFullscreen) {
            await root.requestFullscreen();
            syncFullscreenButtonState();
            return !!document.fullscreenElement;
        }
    } catch (err) {
    }

    syncFullscreenButtonState();
    return false;
}

function showFullscreenRestoreHint() {
    const button = document.getElementById('fullscreenBtn');
    if (button) {
        button.title = 'Vollbild wiederherstellen (F11 / Klick)';
        button.dataset.restoreRequired = 'true';
    }
    if (typeof setStatusText === 'function') {
        setStatusText('Vollbild bitte mit F11 oder dem Vollbild-Button wiederherstellen.');
    }
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
    const button = document.getElementById('fullscreenBtn');
    if (button) {
        delete button.dataset.restoreRequired;
        button.title = 'Vollbild (F11 / Esc)';
    }
}

async function requestShutdownAndExit() {
    const endBtn = document.getElementById('endBtn');
    const previousText = endBtn ? endBtn.textContent : '';

    if (endBtn) {
        endBtn.disabled = true;
        endBtn.textContent = 'Ende...';
    }

    const shutdownUrl = window.location.origin + '/__shutdown__';
    let token = shutdownSessionToken;

    try {
        if (!token) {
            // Token lazy laden, damit die Seite auch ohne Server (z. B. statische Tests)
            // weiterhin startet und nur der Shutdown geschützt ist.
            const sessionResponse = await fetch(window.location.origin + '/__session__', {
                method: 'GET',
                cache: 'no-store'
            });
            if (sessionResponse.ok) {
                const sessionInfo = await sessionResponse.json();
                token = String(sessionInfo.shutdownToken || '').trim();
                shutdownSessionToken = token || null;
            }
        }

        if (!token) {
            throw new Error('Shutdown-Token fehlt');
        }

        // Nur Requests mit Session-Token akzeptiert der lokale Server.
        await fetch(shutdownUrl, {
            method: 'POST',
            cache: 'no-store',
            keepalive: true,
            headers: {
                'Content-Type': 'text/plain',
                'X-Notentisch-Token': token
            },
            body: 'shutdown'
        });
    } catch (err) {
        alert('Server konnte nicht sicher beendet werden. Bitte Fenster schließen oder Server manuell stoppen.');
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
    defaultZoom: initialUserConfig.centerDefaultZoom,
    scrollStep: initialUserConfig.scrollStep,
    pageLabelPrefix: 'Blatt',
    zoomStep: initialUserConfig.zoomStep,
    pageInfoTone: initialUserConfig.pageInfoTone,
    pdfSharpness: initialUserConfig.pdfSharpness,
    paperTintPercent: initialUserConfig.paperTintPercent,
    paperTintColor: initialUserConfig.paperTintColor,
    tintMethod: initialUserConfig.tintMethod,
    tintStrength: initialUserConfig.tintStrength,
    centerDefaultZoom: initialUserConfig.centerDefaultZoom,
    centerZoomFocus: initialUserConfig.centerZoomFocus,
    centerMinZoom: initialUserConfig.centerMinZoom,
    centerMaxZoom: initialUserConfig.centerMaxZoom,
    centerZoomDebounceMs: initialUserConfig.centerZoomDebounceMs,
    centerZoomHoldEnabled: initialUserConfig.centerZoomHoldEnabled,
    centerZoomHoldDelayMs: initialUserConfig.centerZoomHoldDelayMs,
    centerZoomHoldIntervalMs: initialUserConfig.centerZoomHoldIntervalMs,
    centerCanvasExtraWidth: initialUserConfig.centerCanvasExtraWidth,
    centerFitMonitorPages: initialUserConfig.centerFitMonitorPages,
    centerSmoothScroll: initialUserConfig.centerSmoothScroll,
    useZoomSettingsOnDrop: initialUserConfig.useZoomSettingsOnDrop,
    dropGlowDurationMs: initialUserConfig.dropGlowDurationMs,
    audioReferenceTargetMs: initialUserConfig.audioReferenceTargetMs,
    audioRecordStartDelayMs: initialUserConfig.audioRecordStartDelayMs,
    audioWaitAfterMatchMs: initialUserConfig.audioWaitAfterMatchMs,
    audioResetOnSilenceMs: initialUserConfig.audioResetOnSilenceMs,
    audioMatchStrictness: initialUserConfig.audioMatchStrictness,
    audioMatchExceptionalModesEnabled: initialUserConfig.audioMatchExceptionalModesEnabled,
    audioReadyBlinkMs: initialUserConfig.audioReadyBlinkMs,
    replaceAudioByTitle: initialUserConfig.replaceAudioByTitle,
    pdfBaseDir: initialUserConfig.pdfBaseDir,
    cardSharpness: initialUserConfig.cardSharpness,
    showAudioBadge: initialUserConfig.showAudioBadge,
    layoutPreset: initialUserConfig.layoutPreset,
    showFullscreenButton: initialUserConfig.showFullscreenButton,
    autoFullscreenOnStart: initialUserConfig.autoFullscreenOnStart,
    btnBaseColor: initialUserConfig.btnBaseColor,
    btnToggleColor1: initialUserConfig.btnToggleColor1,
    btnToggleColor2: initialUserConfig.btnToggleColor2
};

window.addEventListener('storage', (event) => {
    if (event.key !== USER_CONFIG_KEY) return;
    applyUserConfigAndRefresh(true);
});

function initializeBoardUi() {
    const safeRun = (fn) => {
        try { fn(); } catch (err) {}
    };

    safeRun(() => applyUserConfigAndRefresh(false));
    safeRun(() => syncFullscreenButtonState());
    safeRun(() => {
        if (typeof initializeCenterView === 'function') {
            initializeCenterView();
        }
    });
    safeRun(() => restoreBoardSessionState());
    const isConfigHistoryReturn = (() => {
        try {
            return !!sessionStorage.getItem(BOARD_HISTORY_RETURN_KEY);
        } catch (err) {
            return false;
        }
    })();

    const shouldRestoreFullscreenOnConfigReturn = (() => {
        if (!isConfigHistoryReturn) return false;
        try {
            return sessionStorage.getItem(BOARD_RETURN_FULLSCREEN_KEY) === '1';
        } catch (err) {
            return false;
        }
    })();

    if (shouldRestoreFullscreenOnConfigReturn) {
        setTimeout(() => {
            applyDefaultFullscreenState().then((restored) => {
                if (!restored) showFullscreenRestoreHint();
            }).catch(() => showFullscreenRestoreHint());
        }, 0);
    } else if (settings.autoFullscreenOnStart && !isConfigHistoryReturn) {
        setTimeout(() => {
            safeRun(() => applyDefaultFullscreenState());
        }, 0);
    }

    if (isConfigHistoryReturn) {
        try {
            sessionStorage.removeItem(BOARD_HISTORY_RETURN_KEY);
            sessionStorage.removeItem(BOARD_RETURN_FULLSCREEN_KEY);
        } catch (err) {
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeBoardUi();
    });
} else {
    initializeBoardUi();
}

document.addEventListener('fullscreenchange', syncFullscreenButtonState);
