let audioAssistMode = 0; // 0=aus, 1=hören/suchen, 2=aufnehmen+suchen
let audioAssistDirection = 1; // 1=aufwärts (0→1→2), -1=abwärts (2→1→0)
let audioAssistMonitorTimer = null;
let audioAssistBusy = false;
let audioAssistPressStartedAt = 0;

let audioRecordState = null;
let audioMatchState = null;
let audioHitHistory = []; // Voting-Fenster: letzte N bestCardId-Ergebnisse (over threshold)
let audioDiscardSuppressedCardId = null;
let audioWaitAfterMatchUntil = 0;
let audioWaitAfterMatchBlinkUntil = 0;
let audioReadyToSaveState = null;
let audioSaveWasConfirmed = false;
let audioDiagQueue = [];
let audioDiagFlushTimer = null;

const AUDIO_FINGERPRINT_BANDS = 24;
const AUDIO_MATCH_THRESHOLD = 0.88;
const AUDIO_MATCH_REQUIRED_HITS = 5;      // Min-Votes im Fenster zum Auslösen
const AUDIO_MATCH_VOTE_WINDOW = 15;       // Fenster-Größe: 15 × 180ms ≈ 2.7s
// Trigger-Grenzen nach Mel+Delta-Umstellung: vorherige Werte (0.994/0.993)
// waren für reale Aufnahmen zu streng und blockierten valide Treffer.
const AUDIO_MATCH_TRIGGER_MIN_SCORE = 0.975;
const AUDIO_MATCH_TRIGGER_MIN_GAP = 0.008;
const AUDIO_MATCH_TRIGGER_RELAXED_MIN_SCORE = 0.955;
const AUDIO_MATCH_TRIGGER_RELAXED_MIN_GAP = 0.003;
const AUDIO_MATCH_TRIGGER_RELAXED_MIN_HITS = 5;
const AUDIO_MATCH_TRIGGER_RELAXED_MIN_VOTE_LEAD = 2;
const AUDIO_MATCH_FINGERPRINT_GAMMA = 1.35;
const AUDIO_MUSIC_MIN_ENERGY = 0.06;
const AUDIO_MUSIC_MAX_FLATNESS = 0.82;
const AUDIO_MUSIC_MIN_PEAKINESS = 1.55;
const AUDIO_SPEECH_MID_RATIO_LIMIT = 0.84;
const AUDIO_SPEECH_HIGH_RATIO_MIN = 0.12;
const AUDIO_RECORD_ACTIVE_SIGNAL_MS = 1100;
const AUDIO_UI_SIGNAL_MIN_RMS = 0.018;
const AUDIO_FRAME_SAMPLE_MS = 180;
const AUDIO_DIAG_BATCH_SIZE = 12;
const AUDIO_DIAG_FLUSH_MS = 3000;
const AUDIO_DIAG_MAX_QUEUE = 80;
const AUDIO_ASSIST_LONG_PRESS_MS = 650;

function getAudioMatchStrictnessProfile() {
    const fallback = (window.NOTENTISCH_USER_CONFIG_DEFAULTS && window.NOTENTISCH_USER_CONFIG_DEFAULTS.audioMatchStrictness) || 'normal';
    let strictness = String(fallback).toLowerCase();
    try {
        if (typeof loadUserConfig === 'function') {
            const config = loadUserConfig();
            if (config && config.audioMatchStrictness) {
                strictness = String(config.audioMatchStrictness).toLowerCase();
            }
        }
    } catch {}

    if (strictness === 'locker') {
        return {
            strictness,
            strictMinScore: 0.95,
            strictMinGap: 0.005,
            relaxedMinScore: 0.93,
            relaxedMinGap: 0.001,
            relaxedMinHits: 4,
            relaxedMinVoteLead: 1
        };
    }
    if (strictness === 'streng') {
        return {
            strictness,
            strictMinScore: 0.985,
            strictMinGap: 0.010,
            relaxedMinScore: 0.965,
            relaxedMinGap: 0.004,
            relaxedMinHits: 6,
            relaxedMinVoteLead: 3
        };
    }

    return {
        strictness: 'normal',
        strictMinScore: 0.96,
        strictMinGap: 0.006,
        relaxedMinScore: 0.94,
        relaxedMinGap: 0.002,
        relaxedMinHits: 5,
        relaxedMinVoteLead: 1
    };
}

// ── Nicht-blockierender Toast (ersetzt native alert) ─────────────────────────
// Zeigt eine Nachricht als schwebendes Overlay an, das fullscreen nicht beendet
// und nach durationMs automatisch verschwindet (Standard: 4000 ms).
function showAudioToast(message, durationMs) {
    const dur = (durationMs != null && Number.isFinite(Number(durationMs))) ? Number(durationMs) : 4000;
    let container = document.getElementById('audioToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'audioToastContainer';
        container.style.cssText =
            'position:fixed;bottom:24px;right:24px;z-index:2147483647;' +
            'display:flex;flex-direction:column;gap:8px;pointer-events:none;' +
            'font-family:sans-serif;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText =
        'background:rgba(28,28,28,0.94);color:#fff;padding:12px 18px;' +
        'border-radius:8px;font-size:14px;line-height:1.45;max-width:360px;' +
        'box-shadow:0 4px 20px rgba(0,0,0,0.55);pointer-events:auto;cursor:pointer;' +
        'opacity:1;transition:opacity 0.35s;';
    toast.textContent = message;
    toast.title = 'Klicken zum Schließen';
    const dismiss = () => {
        if (toast._dismissed) return;
        toast._dismissed = true;
        clearTimeout(toast._timer);
        toast.style.opacity = '0';
        setTimeout(() => toast.parentNode?.removeChild(toast), 380);
    };
    toast.addEventListener('click', dismiss);
    toast._timer = setTimeout(dismiss, dur);
    container.appendChild(toast);
}
// ─────────────────────────────────────────────────────────────────────────────

function getRenderApi() {
    return window.NotentischRender || null;
}

function queueAudioDiagEvent(eventName, payload) {
    try {
        const entry = {
            ts: new Date().toISOString(),
            event: String(eventName || 'unknown'),
            mode: audioAssistMode,
            ...payload
        };
        audioDiagQueue.push(entry);
        if (audioDiagQueue.length > AUDIO_DIAG_MAX_QUEUE) {
            audioDiagQueue = audioDiagQueue.slice(-AUDIO_DIAG_MAX_QUEUE);
        }
        scheduleAudioDiagFlush();
    } catch {
        // Diagnose darf den Hauptablauf nie blockieren.
    }
}

function scheduleAudioDiagFlush() {
    if (audioDiagFlushTimer || !audioDiagQueue.length) return;
    audioDiagFlushTimer = setTimeout(() => {
        audioDiagFlushTimer = null;
        flushAudioDiagQueue();
    }, AUDIO_DIAG_FLUSH_MS);
}

async function flushAudioDiagQueue() {
    if (!audioDiagQueue.length) return;
    const batch = audioDiagQueue.slice(0, AUDIO_DIAG_BATCH_SIZE);
    try {
        const response = await fetch('/__audio_diag__', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ events: batch }),
            keepalive: true
        });
        if (response.ok) {
            audioDiagQueue.splice(0, batch.length);
        }
    } catch {
        // Bei Netzwerkfehler wird beim nächsten Tick erneut versucht.
    }

    if (audioDiagQueue.length) {
        scheduleAudioDiagFlush();
    }
}

function getAudioWaitAfterMatchMs() {
    const fallback = (window.NOTENTISCH_USER_CONFIG_DEFAULTS && window.NOTENTISCH_USER_CONFIG_DEFAULTS.audioWaitAfterMatchMs) || 4000;
    let waitMs = fallback;
    try {
        if (typeof loadUserConfig === 'function') {
            const config = loadUserConfig();
            if (config && Number.isFinite(Number(config.audioWaitAfterMatchMs))) {
                waitMs = Number(config.audioWaitAfterMatchMs);
            }
        }
    } catch {}
    return Math.min(8000, Math.max(4000, waitMs));
}

function getAudioReadyBlinkMs() {
    const fallback = (window.NOTENTISCH_USER_CONFIG_DEFAULTS && window.NOTENTISCH_USER_CONFIG_DEFAULTS.audioReadyBlinkMs) || 1000;
    try {
        if (typeof loadUserConfig === 'function') {
            const config = loadUserConfig();
            if (config && Number.isFinite(Number(config.audioReadyBlinkMs))) {
                return Math.min(3000, Math.max(200, Number(config.audioReadyBlinkMs)));
            }
        }
    } catch {}
    return fallback;
}

function getAudioReferenceTargetFrames() {
    const fallbackMs = (window.NOTENTISCH_USER_CONFIG_DEFAULTS && window.NOTENTISCH_USER_CONFIG_DEFAULTS.audioReferenceTargetMs) || 5000;
    let targetMs = fallbackMs;
    try {
        if (typeof loadUserConfig === 'function') {
            const config = loadUserConfig();
            if (config && Number.isFinite(Number(config.audioReferenceTargetMs))) {
                targetMs = Number(config.audioReferenceTargetMs);
            }
        }
    } catch {}
    const normalizedMs = Math.min(12000, Math.max(1500, targetMs));
    return Math.max(6, Math.ceil(normalizedMs / AUDIO_FRAME_SAMPLE_MS));
}

function getCurrentCenterCardId() {
    // Aufnahme soll auch ohne geoeffnetes PDF moeglich sein, solange eine CENTER-Karte bekannt ist.
    if (typeof activeCenterCardId !== 'undefined' && activeCenterCardId !== null && activeCenterCardId !== undefined) {
        return String(activeCenterCardId);
    }
    if (typeof lastCardIdFromCenter !== 'undefined' && lastCardIdFromCenter !== null && lastCardIdFromCenter !== undefined) {
        return String(lastCardIdFromCenter);
    }
    return null;
}

function updateAudioAssistUi() {
    const btn = document.getElementById('audioAssistBtn');
    const hasRecentMusicSignal = !!(audioAssistMode === 2
        && audioRecordState
        && audioRecordState.cardId !== null
        && audioRecordState.lastAcceptedAt
        && (Date.now() - audioRecordState.lastAcceptedAt) <= AUDIO_RECORD_ACTIVE_SIGNAL_MS);
    if (btn) {
        if (audioAssistMode === 2) {
            // In Ton-Rec: vor fertigem Print "Aufnahme", danach "Fertig"
            btn.textContent = audioReadyToSaveState ? 'Fertig' : 'Aufnahme';
            btn.style.background = '#c56a1b';
            btn.style.color = '#fff';
        } else if (audioAssistMode === 1) {
            btn.textContent = 'Ton An';
            btn.style.background = '#27ae60';
            btn.style.color = '#fff';
        } else {
            btn.textContent = 'Tonsuche';
            btn.style.background = '';
            btn.style.color = '';
        }

        // Weißer Rahmen nur, wenn waehrend der Aufnahme gerade musikalisches Signal erkannt wird.
        if (hasRecentMusicSignal) {
            btn.style.border = '2px solid #ffffff';
            btn.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.45), 0 0 14px rgba(255,255,255,0.8)';
        } else {
            btn.style.border = '';
            btn.style.boxShadow = '';
        }
    }

    const saveBtn = document.getElementById('audioSaveBtn');
    if (saveBtn) {
        const saveTargetCardId = audioReadyToSaveState?.state?.cardId ? String(audioReadyToSaveState.state.cardId) : null;
        // BTN2 im Modus 2 immer sichtbar
        saveBtn.style.visibility = audioAssistMode === 2 ? 'visible' : 'hidden';
        // Grün: nach Auto-Speichern, solange Wartezeit läuft. Blau: wenn Wartezeit vorbei.
        const inWaitTime = audioWaitAfterMatchUntil > 0 && Date.now() < audioWaitAfterMatchUntil;
        if (audioSaveWasConfirmed && inWaitTime) {
            saveBtn.textContent = 'Gespeichert';
            saveBtn.title = 'MusicPrint gespeichert – Wartezeit läuft';
            saveBtn.style.background = '#27ae60';
            saveBtn.style.color = '#fff';
        } else if (audioSaveWasConfirmed && !inWaitTime) {
            saveBtn.textContent = 'Bereit';
            saveBtn.title = 'MusicPrint gespeichert – bereit für neue Aufnahme';
            saveBtn.style.background = '#3498db';
            saveBtn.style.color = '#fff';
        } else {
            saveBtn.textContent = saveTargetCardId ? `Speichern (${saveTargetCardId})` : 'Speichern';
            saveBtn.title = saveTargetCardId
                ? `Aufnahme fuer Karte ${saveTargetCardId} speichern`
                : 'Warte auf Aufnahme...';
            saveBtn.style.background = '#3498db';
            saveBtn.style.color = '#fff';
        }
        saveBtn.style.opacity = '';
    }
}

function sanitizeSoundFileBase(value) {
    const renderApi = getRenderApi();
    if (renderApi && typeof renderApi.sanitizeTitle === 'function') {
        return renderApi.sanitizeTitle(value || '').replace(/^card_/i, '').replace(/\.png$/i, '');
    }
    return String(value || 'blatt').trim().toLowerCase().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'blatt';
}

function getPreferredAudioMimeType() {
    const options = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
    ];
    if (typeof MediaRecorder === 'undefined') return '';
    for (const mime of options) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) {
            return mime;
        }
    }
    return '';
}

function getAudioExtensionFromMime(mime) {
    if (String(mime).includes('mp4')) return 'm4a';
    if (String(mime).includes('ogg')) return 'ogg';
    return 'webm';
}

function isReplaceAudioByTitleEnabled() {
    const fallback = (window.NOTENTISCH_USER_CONFIG_DEFAULTS && typeof window.NOTENTISCH_USER_CONFIG_DEFAULTS.replaceAudioByTitle === 'boolean')
        ? window.NOTENTISCH_USER_CONFIG_DEFAULTS.replaceAudioByTitle
        : true;
    try {
        if (typeof loadUserConfig === 'function') {
            const config = loadUserConfig();
            if (typeof config?.replaceAudioByTitle === 'boolean') {
                return config.replaceAudioByTitle;
            }
        }
    } catch {}
    return fallback;
}

function getCardTitleById(cardId) {
    const cardNode = getRenderApi()?.getCardNodeById(cardId) || null;
    return (cardNode?.querySelector('Titel')?.textContent || '').trim();
}

function isAudioBadgeVisibleInUi() {
    if (typeof settings !== 'undefined' && typeof settings?.showAudioBadge === 'boolean') {
        return settings.showAudioBadge;
    }
    try {
        if (typeof loadUserConfig === 'function') {
            return loadUserConfig()?.showAudioBadge !== false;
        }
    } catch {}
    return true;
}

function syncRenderedAudioBadge(cardId) {
    const cardElement = document.querySelector('.card-container[data-cardid="' + String(cardId) + '"]');
    if (!cardElement) return;

    const cardNode = getRenderApi()?.getCardNodeById(cardId) || null;
    const hasAudioReference = !!readAudioMetadataFromCardNode(cardNode);
    const shouldShowBadge = hasAudioReference && isAudioBadgeVisibleInUi();
    const existingBadge = cardElement.querySelector('.card-audio-badge');

    if (shouldShowBadge) {
        if (!existingBadge) {
            const badge = document.createElement('span');
            badge.className = 'card-audio-badge';
            badge.title = 'Spielton vorhanden';
            const titleNode = cardElement.querySelector('.card-title');
            if (titleNode) {
                cardElement.insertBefore(badge, titleNode);
            } else {
                cardElement.appendChild(badge);
            }
        }
    } else if (existingBadge) {
        existingBadge.remove();
    }
}

function collectAudioPathsForTitle(title) {
    const cardNodes = getRenderApi()?.getCardNodes() || [];
    if (!xmlData || !cardNodes.length) return [];
    const titleKey = String(title || '').trim();
    if (!titleKey) return [];

    return cardNodes.map((cardNode, idx) => {
        const cardTitle = (cardNode.querySelector('Titel')?.textContent || '').trim();
        if (cardTitle !== titleKey) return null;
        const audioNodes = Array.from(cardNode.querySelectorAll('AudioReferenz'));
        if (!audioNodes.length) return null;
        return audioNodes
            .map((audioNode) => (audioNode.querySelector('Datei')?.textContent || '').trim())
            .filter(Boolean);
    }).flat().filter(Boolean);
}

function clearAudioReferenceForTitle(title) {
    const cardNodes = getRenderApi()?.getCardNodes() || [];
    if (!xmlData || !cardNodes.length) return;
    const titleKey = String(title || '').trim();
    if (!titleKey) return;

    cardNodes.forEach((cardNode, idx) => {
        const cardTitle = (cardNode.querySelector('Titel')?.textContent || '').trim();
        if (cardTitle !== titleKey) return;
        const audioNodes = Array.from(cardNode.querySelectorAll('AudioReferenz'));
        for (const audioNode of audioNodes) {
            audioNode.remove();
        }
    });
}

async function deleteAudioFileByPath(pathValue) {
    const raw = String(pathValue || '').trim().replace(/\\/g, '/');
    if (!raw || !raw.startsWith('mysounds/')) return;

    let response;
    try {
        response = await fetch('/__audio_delete__?path=' + encodeURIComponent(raw), {
            method: 'POST'
        });
    } catch {
        return;
    }

    if (!response.ok) {
        console.warn('Audio-Datei konnte nicht gelöscht werden:', raw, response.status);
    }
}

function getCardAudioNode(cardId, options) {
    const cardNode = getRenderApi()?.getCardNodeById(cardId) || null;
    if (!cardNode || !xmlData) return null;
    const forceNew = !!options?.forceNew;
    let node = forceNew ? null : cardNode.querySelector('AudioReferenz');
    if (!node) {
        node = xmlData.createElement('AudioReferenz');
        cardNode.appendChild(node);
    }
    return node;
}

function upsertXmlChild(parent, tagName, value) {
    if (!parent || !xmlData) return;
    let child = parent.querySelector(tagName);
    if (!child) {
        child = xmlData.createElement(tagName);
        parent.appendChild(child);
    }
    child.textContent = String(value ?? '');
}

function writeAudioMetadataToCard(cardId, data) {
    const audioNode = getCardAudioNode(cardId, {
        forceNew: data?.appendReference === true
    });
    if (!audioNode) return false;

    // Die Audio-Referenz wird bewusst separat in AudioReferenz gehalten,
    // damit bestehende Center-/Status-Felder nicht vermischt werden.
    upsertXmlChild(audioNode, 'Datei', data.path || '');
    upsertXmlChild(audioNode, 'MimeType', data.mimeType || '');
    upsertXmlChild(audioNode, 'Fingerprint', data.fingerprint || '');
    upsertXmlChild(audioNode, 'ErfasstAm', data.capturedAt || '');
    if (typeof markUnsavedChange === 'function') {
        markUnsavedChange();
    }
    return true;
}

function readAudioMetadataFromCardNode(cardNode) {
    const list = readAudioMetadataListFromCardNode(cardNode);
    return list.length ? list[0] : null;
}

function readAudioMetadataListFromCardNode(cardNode) {
    const audioNodes = Array.from(cardNode?.querySelectorAll('AudioReferenz') || []);
    if (!audioNodes.length) return [];
    return audioNodes.map((audioNode) => {
        const fingerprint = (audioNode.querySelector('Fingerprint')?.textContent || '').trim();
        const path = (audioNode.querySelector('Datei')?.textContent || '').trim();
        if (!fingerprint || !path) return null;
        return {
            path,
            fingerprint,
            mimeType: (audioNode.querySelector('MimeType')?.textContent || '').trim()
        };
    }).filter(Boolean);
}

function createEmptyBandVector() {
    return new Array(AUDIO_FINGERPRINT_BANDS).fill(0);
}

function buildMusicFrameProfile(data) {
    if (!data || !data.length) {
        return null;
    }

    let sum = 0;
    let maxValue = 0;
    let logSum = 0;
    const eps = 1e-6;
    let low = 0;
    let mid = 0;
    let high = 0;
    const oneThird = Math.floor(data.length / 3);
    const twoThirds = oneThird * 2;

    for (let i = 0; i < data.length; i++) {
        const value = data[i] / 255;
        sum += value;
        if (value > maxValue) {
            maxValue = value;
        }
        logSum += Math.log(value + eps);

        if (i < oneThird) {
            low += value;
        } else if (i < twoThirds) {
            mid += value;
        } else {
            high += value;
        }
    }

    const mean = sum / data.length;
    const geometricMean = Math.exp(logSum / data.length);
    const flatness = geometricMean / Math.max(mean, eps);
    const peakiness = maxValue / Math.max(mean, eps);
    const totalBands = Math.max(low + mid + high, eps);

    return {
        energy: mean,
        flatness,
        peakiness,
        lowRatio: low / totalBands,
        midRatio: mid / totalBands,
        highRatio: high / totalBands
    };
}

function isMusicLikeFrame(profile) {
    if (!profile) return false;
    if (profile.energy < AUDIO_MUSIC_MIN_ENERGY) return false;
    if (profile.flatness > AUDIO_MUSIC_MAX_FLATNESS) return false;
    if (profile.peakiness < AUDIO_MUSIC_MIN_PEAKINESS) return false;

    // Sprache ist oft stark im Mittenband konzentriert und hat wenig Höhenanteil.
    if (profile.midRatio > AUDIO_SPEECH_MID_RATIO_LIMIT && profile.highRatio < AUDIO_SPEECH_HIGH_RATIO_MIN) {
        return false;
    }

    return true;
}

// -- Mel-Band-Helper (gecacht) -----------------------------------------------
// Liefert für jeden der bandCount Mel-Bänder den [lo, hi]-Bin-Index im FFT-Array.
// Mel-Skalierung konzentriert die Bänder auf den melodisch relevanten Bereich
// (80–3500 Hz) statt gleichmäßig über 0–24 kHz – dadurch werden Volksmusik-
// stücke mit ähnlicher Gesamt-Klangfarbe viel besser unterscheidbar.
const _melBandRangesCache = Object.create(null);

function getMelBandBinRanges(binCount, bandCount, sampleRate) {
    const key = `${binCount}_${bandCount}_${Math.round(sampleRate)}`;
    if (_melBandRangesCache[key]) return _melBandRangesCache[key];
    const fMin = 80;
    const fMax = Math.min(sampleRate / 2 - 1, 3500);
    const melMin = 2595 * Math.log10(1 + fMin / 700);
    const melMax = 2595 * Math.log10(1 + fMax / 700);
    const hzPerBin = (sampleRate / 2) / binCount;
    const ranges = [];
    for (let b = 0; b < bandCount; b++) {
        const melLo = melMin + (melMax - melMin) * b / bandCount;
        const melHi = melMin + (melMax - melMin) * (b + 1) / bandCount;
        const fLo = 700 * (Math.pow(10, melLo / 2595) - 1);
        const fHi = 700 * (Math.pow(10, melHi / 2595) - 1);
        const lo = Math.max(0, Math.floor(fLo / hzPerBin));
        const hi = Math.min(binCount - 1, Math.ceil(fHi / hzPerBin));
        ranges.push([lo, Math.max(lo, hi)]);
    }
    _melBandRangesCache[key] = ranges;
    return ranges;
}
// ---------------------------------------------------------------------------

function sampleAnalyserIntoBandVector(analyser, targetVector, frameFilter) {
    if (!analyser || !targetVector) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    if (typeof frameFilter === 'function') {
        const profile = buildMusicFrameProfile(data);
        if (!frameFilter(profile)) {
            return false;
        }
    }

    // Mel-skalierte Bänder statt linearer Aufteilung: feinere Auflösung im
    // melodisch relevanten Bereich (80-3500 Hz), dadurch bessere Unterscheidung
    // von Stücken mit ähnlicher Gesamt-Klangfarbe.
    const sampleRate = (analyser.context && analyser.context.sampleRate) || 48000;
    const melRanges = getMelBandBinRanges(data.length, AUDIO_FINGERPRINT_BANDS, sampleRate);
    for (let bandIndex = 0; bandIndex < AUDIO_FINGERPRINT_BANDS; bandIndex++) {
        const [lo, hi] = melRanges[bandIndex];
        let sum = 0, count = 0;
        for (let i = lo; i <= hi; i++) {
            sum += data[i];
            count++;
        }
        targetVector[bandIndex] += count > 0 ? (sum / count) : 0;
    }
    return true;
}

function hasAudibleSignalForUi(analyser) {
    if (!analyser) return false;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
        const centered = (data[i] - 128) / 128;
        sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, data.length));
    return rms >= AUDIO_UI_SIGNAL_MIN_RMS;
}

function normalizeBandVector(vector, frameCount) {
    if (!Array.isArray(vector) || frameCount <= 0) return '';
    const averaged = vector.map((value) => Number((value / frameCount).toFixed(4)));
    const maxValue = Math.max(...averaged, 1);
    return averaged.map((value) => Number((value / maxValue).toFixed(4))).join(',');
}

function parseFingerprint(text) {
    if (!text) return null;
    const parts = String(text).split(',').map((entry) => Number(entry));
    if (!parts.length || parts.some((entry) => !Number.isFinite(entry))) return null;
    return parts;
}

function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
    let dot = 0;
    let lenA = 0;
    let lenB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        lenA += a[i] * a[i];
        lenB += b[i] * b[i];
    }
    if (lenA <= 0 || lenB <= 0) return 0;
    return dot / (Math.sqrt(lenA) * Math.sqrt(lenB));
}

function getMatchBandWeight(bandIndex, bandCount) {
    const safeCount = Math.max(2, Number(bandCount) || 2);
    const t = Math.min(1, Math.max(0, bandIndex / (safeCount - 1)));
    // Tiefe Bänder leicht höher gewichten, hohe Bänder etwas reduzieren.
    return 1.2 - (0.35 * t);
}

function buildMatchingVector(fingerprint) {
    if (!Array.isArray(fingerprint) || !fingerprint.length) return null;
    const gamma = AUDIO_MATCH_FINGERPRINT_GAMMA;
    const n = fingerprint.length;

    // Teil 1: gamma-kontrastierte, bandgewichtete Spektral-Hüllkurve.
    const base = new Array(n);
    for (let i = 0; i < n; i++) {
        const raw = Number.isFinite(fingerprint[i]) ? Math.max(0, fingerprint[i]) : 0;
        base[i] = Math.pow(raw, gamma) * getMatchBandWeight(i, n);
    }

    // Teil 2: Delta-Features (erste Ableitung der Hüllkurve).
    // Stücke mit ähnlicher Gesamt-Klangfarbe aber unterschiedlichen lokalen
    // Spektrum-Spitzen/Tälern werden hier sicherer unterschieden.
    const deltas = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
        deltas[i] = (base[i + 1] - base[i]) * 1.5;
    }

    return [...base, ...deltas];
}

function collectAudioReferenceCandidates() {
    const cardNodes = getRenderApi()?.getCardNodes() || [];
    if (!xmlData || !cardNodes.length) return [];
    return cardNodes.map((cardNode, idx) => {
        const audioList = readAudioMetadataListFromCardNode(cardNode);
        if (!audioList.length) return null;
        const references = audioList.map((audio) => {
            const parsedFingerprint = parseFingerprint(audio.fingerprint);
            if (!parsedFingerprint) return null;
            const matchingFingerprint = buildMatchingVector(parsedFingerprint);
            if (!matchingFingerprint) return null;
            return {
                path: audio.path,
                fingerprint: parsedFingerprint,
                matchingFingerprint
            };
        }).filter(Boolean);
        if (!references.length) return null;
        return {
            idx,
            titel: cardNode.querySelector('Titel')?.textContent || 'Unbekannt',
            status: cardNode.querySelector('Arbeitsstatus')?.textContent || '',
            speicherort: cardNode.querySelector('Speicherort')?.textContent || '',
            references,
            referenceCount: references.length
        };
    }).filter(Boolean);
}

function buildMatchObjectForCardId(cardId) {
    const cardNode = getRenderApi()?.getCardNodeById(cardId) || null;
    if (!cardNode) return null;
    const idx = Number(cardId);
    if (!Number.isFinite(idx)) return null;
    return {
        idx,
        titel: cardNode.querySelector('Titel')?.textContent || 'Unbekannt',
        status: cardNode.querySelector('Arbeitsstatus')?.textContent || '',
        speicherort: cardNode.querySelector('Speicherort')?.textContent || ''
    };
}

async function uploadRecordedAudio(blob, filename) {
    let response;
    try {
        response = await fetch('/__audio_upload__?filename=' + encodeURIComponent(filename), {
            method: 'POST',
            headers: {
                'Content-Type': blob.type || 'application/octet-stream'
            },
            body: blob
        });
    } catch (err) {
        throw new Error('Lokaler Server nicht erreichbar. Bitte Notentisch neu starten bzw. local_server.py neu starten.');
    }

    if (!response.ok) {
        if (response.status === 404 || response.status === 405 || response.status === 501) {
            throw new Error('Audio-Upload-Endpunkt fehlt. Bitte Notentisch bzw. den lokalen Server neu starten.');
        }
        let detail = '';
        try {
            detail = (await response.text()).trim();
        } catch {}
        throw new Error('Audio-Upload fehlgeschlagen (' + response.status + ')' + (detail ? ': ' + detail : '') + '. Bitte lokalen Server neu starten.');
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        throw new Error('Ungültige Serverantwort beim Audio-Upload.');
    }
    if (!payload || !payload.path) {
        throw new Error('Serverantwort ohne Speicherpfad.');
    }
    return payload;
}

function stopMediaStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
}

function prepareAudioFingerprint(state) {
    if (!state || !state.cardId) return null;
    if (state.frameCount < 6) {
        queueAudioDiagEvent('recording_too_short', {
            cardId: String(state.cardId || ''),
            frameCount: Number(state.frameCount || 0)
        });
        showAudioToast('Zu wenig musikalisches Signal erkannt. Bitte lauter/sauberer einspielen.');
        return null;
    }
    const fingerprint = normalizeBandVector(state.bandSums, state.frameCount);
    if (!fingerprint) return null;
    queueAudioDiagEvent('fingerprint_prepared', {
        cardId: String(state.cardId || ''),
        frameCount: Number(state.frameCount || 0),
        targetFrameCount: Number(state.targetFrameCount || 0)
    });
    return fingerprint;
}

async function finalizeRecordedAudio(state, fingerprint) {
    if (!state || !state.cardId || !state.chunks.length) return false;
    const blob = new Blob(state.chunks, { type: state.mimeType || 'audio/webm' });
    if (blob.size < 1024) {
        updateAudioAssistUi();
        return false;
    }

    if (!fingerprint) {
        queueAudioDiagEvent('fingerprint_missing_on_save', {
            cardId: String(state.cardId || '')
        });
        showAudioToast('Fingerprint verloren. Bitte erneut aufnehmen.');
        return false;
    }

    const extension = getAudioExtensionFromMime(state.mimeType);
    const safeTitle = sanitizeSoundFileBase(state.title || 'blatt');
    const timestamp = new Date().toISOString().replace(/[:\.]/g, '-');
    const fileName = 'sound_' + safeTitle + '_' + timestamp + '.' + extension;

    let uploadResult = null;
    try {
        uploadResult = await uploadRecordedAudio(blob, fileName);
    } catch (err) {
        queueAudioDiagEvent('audio_upload_failed', {
            cardId: String(state.cardId || ''),
            message: String(err?.message || err || '')
        });
        showAudioToast('Audio-Datei konnte nicht gespeichert werden: ' + err.message);
        return false;
    }

    if (isReplaceAudioByTitleEnabled()) {
        const title = getCardTitleById(state.cardId) || state.title || '';
        const oldPaths = collectAudioPathsForTitle(title);
        clearAudioReferenceForTitle(title);
        for (const oldPath of new Set(oldPaths)) {
            if (String(oldPath).trim() !== String(uploadResult.path).trim()) {
                await deleteAudioFileByPath(oldPath);
            }
        }
    }

    writeAudioMetadataToCard(state.cardId, {
        path: uploadResult.path,
        mimeType: state.mimeType,
        fingerprint,
        capturedAt: new Date().toISOString(),
        appendReference: true
    });
    getRenderApi()?.resetCardRenderCache();
    syncRenderedAudioBadge(state.cardId);

    if (typeof saveXml === 'function') {
        try {
            await saveXml(true);
        } catch (err) {
            queueAudioDiagEvent('xml_save_failed_after_upload', {
                cardId: String(state.cardId || ''),
                path: String(uploadResult.path || '')
            });
            showAudioToast('Audio-Datei wurde hochgeladen, aber die XML konnte nicht gespeichert werden. Bitte erneut speichern oder Notentisch neu starten.');
        }
    }

    queueAudioDiagEvent('fingerprint_saved', {
        cardId: String(state.cardId || ''),
        path: String(uploadResult.path || '')
    });
    flushAudioDiagQueue();
    return true;
}

async function saveAudioFingerprint() {
    if (!audioReadyToSaveState) return false;
    const pendingSave = audioReadyToSaveState;
    const { state, fingerprint } = pendingSave;
    audioReadyToSaveState = null;
    updateAudioAssistUi();
    
    try {
        const saved = await finalizeRecordedAudio(state, fingerprint);
        if (saved) {
            audioSaveWasConfirmed = true;
            updateAudioAssistUi();
            return true;
        }
        // Bei Fehlschlag erneuten Speichern ermoeglichen.
        audioReadyToSaveState = pendingSave;
        updateAudioAssistUi();
        return false;
    } catch (err) {
        console.error('Audio-Fingerprint konnte nicht gespeichert werden:', err);
        showAudioToast('Audio konnte nicht gespeichert werden: ' + (err.message || err));
        audioReadyToSaveState = pendingSave;
        updateAudioAssistUi();
        return false;
    }
}

async function startAudioRecordingForCenterCard(cardId) {
    const cardNode = getRenderApi()?.getCardNodeById(cardId) || null;
    if (!cardNode || typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    // Bei neuer Aufnahme den gespeicherten Bestätigungsstatus zurücksetzen.
    audioReadyToSaveState = null;
    audioSaveWasConfirmed = false;

    const mimeType = getPreferredAudioMimeType();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const state = {
        cardId: String(cardId),
        title: cardNode.querySelector('Titel')?.textContent || 'Blatt',
        stream,
        audioContext,
        analyser,
        recorder,
        mimeType: recorder.mimeType || mimeType || 'audio/webm',
        chunks: [],
        bandSums: createEmptyBandVector(),
        frameCount: 0,
        targetFrameCount: getAudioReferenceTargetFrames(),
        lastAcceptedAt: 0,
        autoStopRequested: false,
        discardOnStop: false,
        samplerTimer: null,
        finalizingPromise: null,
        stopPromise: null,
        resolveStopPromise: null
    };

    state.stopPromise = new Promise((resolve) => {
        state.resolveStopPromise = resolve;
    });

    recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
            state.chunks.push(event.data);
        }
    });

    recorder.addEventListener('stop', () => {
        if (state.samplerTimer) {
            clearInterval(state.samplerTimer);
            state.samplerTimer = null;
        }
        stopMediaStream(stream);
        audioContext.close().catch(() => {});
        
        // Fingerprint berechnen und für Speicherung bereitstellen.
        // Bei externem Abbruch (discardOnStop) Aufnahme lautlos verwerfen.
        if (!state.discardOnStop) {
            const fingerprint = prepareAudioFingerprint(state);
            if (fingerprint) {
                audioReadyToSaveState = { state, fingerprint };
                // Wartezeit startet ab "MusicPrint erstellt".
                audioWaitAfterMatchUntil = Date.now() + getAudioWaitAfterMatchMs();
                updateAudioAssistUi();

                // Direkt automatisch speichern, ohne manuellen Klick auf den Speichern-Button.
                saveAudioFingerprint().catch((err) => {
                    console.error('Audio-Auto-Speichern fehlgeschlagen:', err);
                });
            }
        }
        
        if (typeof state.resolveStopPromise === 'function') {
            state.resolveStopPromise();
        }
    });

    state.samplerTimer = setInterval(() => {
        // UI-Signal: weisser Rahmen bei hoerbarem Ton, auch wenn der Frame
        // fuer den Fingerprint-Filter (Musik-Charakter) nicht akzeptiert wird.
        if (hasAudibleSignalForUi(analyser)) {
            state.lastAcceptedAt = Date.now();
        }

        const accepted = sampleAnalyserIntoBandVector(analyser, state.bandSums, isMusicLikeFrame);
        if (accepted) {
            state.frameCount += 1;
            state.lastAcceptedAt = Date.now();
            if (!state.autoStopRequested && state.frameCount >= state.targetFrameCount) {
                state.autoStopRequested = true;
                audioDiscardSuppressedCardId = String(state.cardId);
                stopAudioRecording(true).catch((err) => {
                    console.error('Audio-Autostopp fehlgeschlagen:', err);
                });
                return;
            }
        }
        updateAudioAssistUi();
    }, 180);

    recorder.start(1000);
    audioRecordState = state;
    updateAudioAssistUi();
}

async function stopAudioRecording(saveRecording) {
    if (!audioRecordState) return;
    const state = audioRecordState;
    audioRecordState = null;

    // Bei saveRecording=false: Aufnahme verwerfen, kein Fingerprint, kein Alert.
    if (!saveRecording) {
        state.discardOnStop = true;
    }

    if (state.recorder && state.recorder.state !== 'inactive') {
        state.recorder.stop();
    } else {
        if (state.samplerTimer) clearInterval(state.samplerTimer);
        stopMediaStream(state.stream);
        state.audioContext?.close().catch(() => {});
        if (typeof state.resolveStopPromise === 'function') {
            state.resolveStopPromise();
        }
    }

    if (saveRecording && state.stopPromise) {
        await state.stopPromise;
    }
    updateAudioAssistUi();
}

async function startAudioMatching() {
    if (audioMatchState || !navigator.mediaDevices?.getUserMedia) return;
    const candidates = collectAudioReferenceCandidates();
    if (!candidates.length) {
        queueAudioDiagEvent('matching_start_skipped_no_candidates', {
            mode: audioAssistMode
        });
        updateAudioAssistUi();
        return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const matchState = {
        running: true,
        stream,
        audioContext,
        analyser,
        bandSums: createEmptyBandVector(),
        frameCount: 0,
        samplerTimer: setInterval(() => {
            if (!matchState.running) return;
            const accepted = sampleAnalyserIntoBandVector(analyser, matchState.bandSums, isMusicLikeFrame);
            if (accepted) {
                matchState.frameCount += 1;
            }
        }, 180)
    };
    audioMatchState = matchState;
    queueAudioDiagEvent('matching_started', {
        mode: audioAssistMode,
        candidateCount: candidates.length
    });
    updateAudioAssistUi();
}

function stopAudioMatching() {
    if (!audioMatchState) return;
    audioMatchState.running = false;
    if (audioMatchState.samplerTimer) {
        clearInterval(audioMatchState.samplerTimer);
    }
    stopMediaStream(audioMatchState.stream);
    audioMatchState.audioContext?.close().catch(() => {});
    audioMatchState = null;
    audioHitHistory = [];
    queueAudioDiagEvent('matching_stopped', {
        mode: audioAssistMode
    });
    updateAudioAssistUi();
}

async function evaluateAudioMatching() {
    if (!audioMatchState || !audioMatchState.running || !xmlData) return;
    if (typeof currentPdfDoc !== 'undefined' && currentPdfDoc) return;
    if (audioMatchState.frameCount < 4) return;

    const liveFingerprint = parseFingerprint(normalizeBandVector(audioMatchState.bandSums, audioMatchState.frameCount));
    audioMatchState.bandSums = createEmptyBandVector();
    audioMatchState.frameCount = 0;
    if (!liveFingerprint) return;
    const liveMatchingFingerprint = buildMatchingVector(liveFingerprint);
    if (!liveMatchingFingerprint) return;

    const candidates = collectAudioReferenceCandidates();
    if (!candidates.length) {
        queueAudioDiagEvent('matching_no_candidates', {
            liveFrameCount: 0
        });
        return;
    }
    let best = null;
    let secondBest = null;
    for (const candidate of candidates) {
        let score = 0;
        if (Array.isArray(candidate.references) && candidate.references.length) {
            for (const ref of candidate.references) {
                const refScore = cosineSimilarity(liveMatchingFingerprint, ref.matchingFingerprint || ref.fingerprint);
                if (refScore > score) {
                    score = refScore;
                }
            }
        }
        if (!best || score > best.score) {
            secondBest = best;
            best = { ...candidate, score };
        } else if (!secondBest || score > secondBest.score) {
            secondBest = { ...candidate, score };
        }
    }

    const scoreGap = best && secondBest ? (best.score - secondBest.score) : Number.POSITIVE_INFINITY;

    if (!best || best.score < AUDIO_MATCH_THRESHOLD) {
        // Kein ausreichendes Signal: Votingfenster zurücksetzen
        audioHitHistory = [];
        return;
    }

    // Voting-Fenster aktualisieren
    audioHitHistory.push(String(best.idx));
    if (audioHitHistory.length > AUDIO_MATCH_VOTE_WINDOW) audioHitHistory.shift();
    const votesForBest = audioHitHistory.filter(id => id === String(best.idx)).length;
    const votesByCardId = Object.create(null);
    for (const cardId of audioHitHistory) {
        votesByCardId[cardId] = (votesByCardId[cardId] || 0) + 1;
    }
    let runnerUpVotes = 0;
    for (const [cardId, voteCount] of Object.entries(votesByCardId)) {
        if (cardId !== String(best.idx) && voteCount > runnerUpVotes) {
            runnerUpVotes = voteCount;
        }
    }
    const voteLead = votesForBest - runnerUpVotes;

    queueAudioDiagEvent('matching_scored', {
        candidateCount: candidates.length,
        totalReferenceCount: candidates.reduce((sum, c) => sum + (Number(c.referenceCount) || 0), 0),
        bestCardId: String(best.idx),
        bestScore: Number(best.score.toFixed(4)),
        secondBestScore: secondBest ? Number(secondBest.score.toFixed(4)) : null,
        scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null,
        votes: votesForBest,
        runnerUpVotes,
        voteLead,
        window: audioHitHistory.length,
        threshold: AUDIO_MATCH_THRESHOLD,
        requiredHits: AUDIO_MATCH_REQUIRED_HITS
    });

    if (votesForBest < AUDIO_MATCH_REQUIRED_HITS) {
        queueAudioDiagEvent('matching_pending_votes', {
            bestCardId: String(best.idx),
            votes: votesForBest,
            required: AUDIO_MATCH_REQUIRED_HITS,
            window: audioHitHistory.length,
            scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null
        });
        return;
    }

    // Sicherheitscheck: Strict (hoher Score + klarer Gap) oder Relaxed (moderater Score + viele Votes).
    // Die Grenzwerte sind über Advanced "Erkennungs-Strenge" konfigurierbar.
    const strictnessProfile = getAudioMatchStrictnessProfile();
    const isStrictTrigger = (best.score >= strictnessProfile.strictMinScore && scoreGap >= strictnessProfile.strictMinGap);
    const isRelaxedStableTrigger = (
        best.score >= strictnessProfile.relaxedMinScore &&
        scoreGap >= strictnessProfile.relaxedMinGap &&
        votesForBest >= strictnessProfile.relaxedMinHits &&
        voteLead >= strictnessProfile.relaxedMinVoteLead
    );
    if (!isStrictTrigger && !isRelaxedStableTrigger) {
        // Voting-History leeren damit der nächste Anlauf sauber beginnt
        audioHitHistory = [];
        queueAudioDiagEvent('matching_blocked_low_confidence', {
            bestCardId: String(best.idx),
            bestScore: Number(best.score.toFixed(4)),
            scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null,
            votes: votesForBest,
            voteLead,
            strictness: strictnessProfile.strictness,
            strictMinScore: strictnessProfile.strictMinScore,
            strictMinGap: strictnessProfile.strictMinGap,
            relaxedMinScore: strictnessProfile.relaxedMinScore,
            relaxedMinGap: strictnessProfile.relaxedMinGap,
            relaxedMinHits: strictnessProfile.relaxedMinHits,
            relaxedMinVoteLead: strictnessProfile.relaxedMinVoteLead
        });
        return;
    }

    const match = buildMatchObjectForCardId(best.idx);
    const hasOpenPdfNow = (typeof currentPdfDoc !== 'undefined' && !!currentPdfDoc);
    const canExecuteDrop = typeof executeSearchDrop === 'function';
    if (!match || !canExecuteDrop || hasOpenPdfNow) {
        queueAudioDiagEvent('matching_drop_blocked', {
            bestCardId: String(best.idx),
            bestScore: Number(best.score.toFixed(4)),
            votes: votesForBest,
            hasMatchObject: !!match,
            canExecuteDrop,
            hasOpenPdfNow
        });
        return;
    }

    audioHitHistory = [];
    queueAudioDiagEvent('matching_triggered_drop', {
        matchedCardId: String(best.idx),
        matchedScore: Number(best.score.toFixed(4)),
        votes: votesForBest,
        scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null,
        triggerPath: isStrictTrigger ? 'strict' : 'relaxed-stable'
    });
    audioWaitAfterMatchUntil = Date.now() + getAudioWaitAfterMatchMs();
    stopAudioMatching();
    executeSearchDrop(match);
    flushAudioDiagQueue();
}

async function audioAssistTick() {
    if (!audioAssistMode || audioAssistBusy) return;
    audioAssistBusy = true;

    try {
        const hasOpenPdf = (typeof currentPdfDoc !== 'undefined' && !!currentPdfDoc);
        // Nur activeCenterCardId (nicht lastCardIdFromCenter) nutzen: wenn keine Karte aktiv im Center,
        // soll Matching starten. lastCardIdFromCenter würde matching dauerhaft blockieren.
        const centerCardId = (typeof activeCenterCardId !== 'undefined' && activeCenterCardId !== null)
            ? String(activeCenterCardId) : null;

        if (!centerCardId) {
            audioDiscardSuppressedCardId = null;
        } else if (audioDiscardSuppressedCardId && audioDiscardSuppressedCardId !== centerCardId) {
            audioDiscardSuppressedCardId = null;
        }

        if (centerCardId) {
            if (audioMatchState) {
                stopAudioMatching();
            }
            if (audioAssistMode === 2) {
                // Aufnahme-Modus: Referenzton aufnehmen
                if (audioDiscardSuppressedCardId === centerCardId) {
                    if (audioRecordState) {
                        await stopAudioRecording(false);
                    } else {
                        const now = Date.now();
                        if (now >= audioWaitAfterMatchUntil) {
                            if (audioWaitAfterMatchUntil > 0 && audioWaitAfterMatchBlinkUntil === 0) {
                                audioWaitAfterMatchBlinkUntil = now + getAudioReadyBlinkMs();
                                updateAudioAssistUi();
                                setTimeout(() => {
                                    audioWaitAfterMatchBlinkUntil = 0;
                                    updateAudioAssistUi();
                                }, getAudioReadyBlinkMs() + 50);
                            }
                            audioDiscardSuppressedCardId = null;
                            await startAudioRecordingForCenterCard(centerCardId);
                        }
                    }
                } else if (!audioRecordState || audioRecordState.cardId !== centerCardId) {
                    // Wartezeit nach Aufnahme-Speicherung beachten
                    const now = Date.now();
                    if (now >= audioWaitAfterMatchUntil) {
                        // Wartezeit gerade abgelaufen → Blink starten
                        if (audioWaitAfterMatchUntil > 0 && audioWaitAfterMatchBlinkUntil === 0) {
                            audioWaitAfterMatchBlinkUntil = now + getAudioReadyBlinkMs();
                            updateAudioAssistUi();
                            setTimeout(() => {
                                audioWaitAfterMatchBlinkUntil = 0;
                                updateAudioAssistUi();
                            }, getAudioReadyBlinkMs() + 50);
                        }
                        await stopAudioRecording(false);
                        await startAudioRecordingForCenterCard(centerCardId);
                    }
                }
            } else {
                // Nur-Hören-Modus: nicht aufnehmen
                if (audioRecordState) {
                    await stopAudioRecording(false);
                }
            }
        } else if (hasOpenPdf) {
            // Bei offenem PDF ohne auflösbare Karten-ID wird kein Matching gestartet,
            // um falsche Auto-Treffer zu vermeiden.
            if (audioMatchState) {
                stopAudioMatching();
            }
            if (audioRecordState) {
                await stopAudioRecording(false);
            }
        } else {
            if (audioRecordState) {
                await stopAudioRecording(false);
            }
            if (audioAssistMode !== 2) {
                // Nur im Hör-Modus (1) Matching starten; im Aufnahme-Modus (2) warten
                // wir auf eine neue Karte im CENTER.
                if (!audioMatchState) {
                    if (Date.now() >= audioWaitAfterMatchUntil) {
                        await startAudioMatching();
                    }
                }
                await evaluateAudioMatching();
            } else if (audioMatchState) {
                stopAudioMatching();
            }
        }
    } catch (err) {
        console.error('Audio-Automatik Fehler:', err);
        showAudioToast('Audio-Automatik konnte nicht gestartet werden. Bitte Mikrofonfreigabe prüfen.');
        disableAudioAssistMode();
    } finally {
        audioAssistBusy = false;
    }
}

function disableAudioAssistMode() {
    const previousMode = audioAssistMode;
    audioAssistMode = 0;
    audioAssistDirection = 1;
    audioDiscardSuppressedCardId = null;
    audioWaitAfterMatchUntil = 0;
    audioWaitAfterMatchBlinkUntil = 0;
    audioReadyToSaveState = null;
    audioSaveWasConfirmed = false;
    if (audioAssistMonitorTimer) {
        clearInterval(audioAssistMonitorTimer);
        audioAssistMonitorTimer = null;
    }
    stopAudioMatching();
    stopAudioRecording(false).catch(() => {});
    queueAudioDiagEvent('audio_mode_changed', {
        fromMode: previousMode,
        toMode: 0,
        direction: audioAssistDirection
    });
    updateAudioAssistUi();
}

function installAudioAssistButtonPressHandler() {
    const btn = document.getElementById('audioAssistBtn');
    if (!btn || btn.dataset.pressBound === 'true') return;

    btn.addEventListener('pointerdown', () => {
        audioAssistPressStartedAt = Date.now();
    });
    btn.addEventListener('pointercancel', () => {
        audioAssistPressStartedAt = 0;
    });
    btn.dataset.pressBound = 'true';
}

function toggleAudioAssistMode() {
    // Wenn Fingerprint bereit zur Speicherung, wird es verworfen beim Mode-Wechsel
    audioReadyToSaveState = null;
    audioSaveWasConfirmed = false;

    const isLongPress = audioAssistPressStartedAt > 0
        && (Date.now() - audioAssistPressStartedAt) >= AUDIO_ASSIST_LONG_PRESS_MS;
    audioAssistPressStartedAt = 0;

    let nextMode;
    if (audioAssistMode === 0) {
        nextMode = 1;
        audioAssistDirection = 1;
    } else if (audioAssistMode === 2) {
        // In Aufnahme: Kurzdruck zurück zu Ton An.
        nextMode = 1;
        audioAssistDirection = -1;
    } else {
        // mode === 1: Kurzdruck auf Aufnahme, Langdruck auf Aus.
        if (isLongPress) {
            nextMode = 0;
            audioAssistDirection = -1;
        } else {
            nextMode = 2;
            audioAssistDirection = 1;
        }
    }

    if (nextMode === 0) {
        disableAudioAssistMode();
        return;
    }

    if (audioAssistMode === 0 && (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')) {
        showAudioToast('Dieser Browser unterstützt die Audio-Funktion nicht vollständig.');
        return;
    }

    const previousMode = audioAssistMode;
    audioAssistMode = nextMode;

    // Weiße Bereitschaftssignale nur im Aufnahme-Modus anzeigen.
    if (audioAssistMode !== 2) {
        audioWaitAfterMatchBlinkUntil = 0;
    }

    queueAudioDiagEvent('audio_mode_changed', {
        fromMode: previousMode,
        toMode: audioAssistMode,
        direction: audioAssistDirection
    });

    updateAudioAssistUi();

    if (!audioAssistMonitorTimer) {
        audioAssistTick();
        audioAssistMonitorTimer = setInterval(audioAssistTick, 1200);
    }
}

window.toggleAudioAssistMode = toggleAudioAssistMode;
window.saveAudioFingerprint = saveAudioFingerprint;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        installAudioAssistButtonPressHandler();
        updateAudioAssistUi();
    });
} else {
    installAudioAssistButtonPressHandler();
    updateAudioAssistUi();
}