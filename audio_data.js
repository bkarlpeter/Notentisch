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
    const audioList = readAudioMetadataListFromCardNode(cardNode);
    const hasAudioReference = audioList.length > 0;
    const bestQuality = audioList.reduce((best, audio) => Math.max(best, getAudioReferenceQuality(audio)), 0);
    const badgeTone = bestQuality >= 0.85 ? 'good' : 'weak';
    const shouldShowBadge = hasAudioReference && isAudioBadgeVisibleInUi();
    const existingBadge = cardElement.querySelector('.card-audio-badge');

    if (shouldShowBadge) {
        if (!existingBadge) {
            const badge = document.createElement('span');
            badge.className = 'card-audio-badge ' + badgeTone;
            badge.title = badgeTone === 'good' ? 'Tonprint gut' : 'Tonprint prÃ¼fen';
            const titleNode = cardElement.querySelector('.card-title');
            if (titleNode) {
                cardElement.insertBefore(badge, titleNode);
            } else {
                cardElement.appendChild(badge);
            }
        } else {
            existingBadge.className = 'card-audio-badge ' + badgeTone;
            existingBadge.title = badgeTone === 'good' ? 'Tonprint gut' : 'Tonprint prÃ¼fen';
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
        console.warn('Audio-Datei konnte nicht gelÃ¶scht werden:', raw, response.status);
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
    if (Number.isFinite(Number(data?.frameCount))) {
        upsertXmlChild(audioNode, 'FrameCount', Math.max(0, Number(data.frameCount)));
    }
    if (Number.isFinite(Number(data?.targetFrameCount))) {
        upsertXmlChild(audioNode, 'TargetFrameCount', Math.max(0, Number(data.targetFrameCount)));
    }
    if (typeof markUnsavedChange === 'function') {
        markUnsavedChange();
    }
    invalidateAudioReferenceCandidateCache();
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
            mimeType: (audioNode.querySelector('MimeType')?.textContent || '').trim(),
            frameCount: Number(audioNode.querySelector('FrameCount')?.textContent || 0) || 0,
            targetFrameCount: Number(audioNode.querySelector('TargetFrameCount')?.textContent || 0) || 0
        };
    }).filter(Boolean);
}

function invalidateAudioReferenceCandidateCache() {
    audioReferenceCandidateCacheVersion += 1;
    audioReferenceCandidateCache = null;
}

function getAudioReferenceQuality(audio) {
    const frameCount = Number(audio?.frameCount) || 0;
    const targetFrameCount = Number(audio?.targetFrameCount) || 0;

    if (frameCount <= 0) {
        return 1.0;
    }

    const normalizedTarget = Math.max(targetFrameCount || frameCount, AUDIO_REFERENCE_MIN_FRAMES);
    const ratio = frameCount / normalizedTarget;
    return Math.min(1, Math.max(0.55, ratio));
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

    // Sprache ist oft stark im Mittenband konzentriert und hat wenig HÃ¶henanteil.
    if (profile.midRatio > AUDIO_SPEECH_MID_RATIO_LIMIT && profile.highRatio < AUDIO_SPEECH_HIGH_RATIO_MIN) {
        return false;
    }

    return true;
}

// -- Mel-Band-Helper (gecacht) -----------------------------------------------
// Liefert fÃ¼r jeden der bandCount Mel-BÃ¤nder den [lo, hi]-Bin-Index im FFT-Array.
// Mel-Skalierung konzentriert die BÃ¤nder auf den melodisch relevanten Bereich
// (80â€“3500 Hz) statt gleichmÃ¤ÃŸig Ã¼ber 0â€“24 kHz â€“ dadurch werden Volksmusik-
// stÃ¼cke mit Ã¤hnlicher Gesamt-Klangfarbe viel besser unterscheidbar.
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

    // Mel-skalierte BÃ¤nder statt linearer Aufteilung: feinere AuflÃ¶sung im
    // melodisch relevanten Bereich (80-3500 Hz), dadurch bessere Unterscheidung
    // von StÃ¼cken mit Ã¤hnlicher Gesamt-Klangfarbe.
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
    // Tiefe BÃ¤nder leicht hÃ¶her gewichten, hohe BÃ¤nder etwas reduzieren.
    return 1.2 - (0.35 * t);
}

function buildMatchingVector(fingerprint) {
    if (!Array.isArray(fingerprint) || !fingerprint.length) return null;
    const gamma = AUDIO_MATCH_FINGERPRINT_GAMMA;
    const n = fingerprint.length;

    // Teil 1: gamma-kontrastierte, bandgewichtete Spektral-HÃ¼llkurve.
    const base = new Array(n);
    for (let i = 0; i < n; i++) {
        const raw = Number.isFinite(fingerprint[i]) ? Math.max(0, fingerprint[i]) : 0;
        base[i] = Math.pow(raw, gamma) * getMatchBandWeight(i, n);
    }

    // Teil 2: Delta-Features (erste Ableitung der HÃ¼llkurve).
    // StÃ¼cke mit Ã¤hnlicher Gesamt-Klangfarbe aber unterschiedlichen lokalen
    // Spektrum-Spitzen/TÃ¤lern werden hier sicherer unterschieden.
    const deltas = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
        deltas[i] = (base[i + 1] - base[i]) * 1.5;
    }

    return [...base, ...deltas];
}

function collectAudioReferenceCandidates() {
    const cardNodes = getRenderApi()?.getCardNodes() || [];
    if (!xmlData || !cardNodes.length) return [];

    const cached = audioReferenceCandidateCache;
    if (
        cached &&
        cached.xmlData === xmlData &&
        cached.cardCount === cardNodes.length &&
        cached.version === audioReferenceCandidateCacheVersion
    ) {
        return cached.candidates;
    }

    const candidates = cardNodes.map((cardNode, idx) => {
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
                matchingFingerprint,
                frameCount: Number(audio.frameCount) || 0,
                targetFrameCount: Number(audio.targetFrameCount) || 0,
                quality: getAudioReferenceQuality(audio)
            };
        }).filter(Boolean);
        if (!references.length) return null;
        return {
            idx,
            titel: cardNode.querySelector('Titel')?.textContent || 'Unbekannt',
            status: cardNode.querySelector('Arbeitsstatus')?.textContent || '',
            speicherort: cardNode.querySelector('Speicherort')?.textContent || '',
            references,
            referenceCount: references.length,
            referenceQuality: references.reduce((best, ref) => Math.max(best, Number(ref.quality) || 0), 0)
        };
    }).filter(Boolean);

    audioReferenceCandidateCache = {
        xmlData,
        cardCount: cardNodes.length,
        version: audioReferenceCandidateCacheVersion,
        candidates
    };

    return candidates;
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

