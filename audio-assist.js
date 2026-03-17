let audioAssistMode = 0; // 0=aus, 1=hören/suchen, 2=aufnehmen+suchen
let audioAssistMonitorTimer = null;
let audioAssistBusy = false;

let audioRecordState = null;
let audioMatchState = null;
let audioLastDetectedCardId = null;
let audioConsecutiveDetections = 0;
let audioDiscardSuppressedCardId = null;

const AUDIO_FINGERPRINT_BANDS = 24;
const AUDIO_MATCH_THRESHOLD = 0.92;
const AUDIO_MATCH_REQUIRED_HITS = 3;
const AUDIO_MUSIC_MIN_ENERGY = 0.06;
const AUDIO_MUSIC_MAX_FLATNESS = 0.82;
const AUDIO_MUSIC_MIN_PEAKINESS = 1.55;
const AUDIO_SPEECH_MID_RATIO_LIMIT = 0.84;
const AUDIO_SPEECH_HIGH_RATIO_MIN = 0.12;
const AUDIO_RECORD_ACTIVE_SIGNAL_MS = 1100;
const AUDIO_FRAME_SAMPLE_MS = 180;

function getRenderApi() {
    return window.NotentischRender || null;
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
    const hasOpenPdf = (typeof currentPdfDoc !== 'undefined' && !!currentPdfDoc);
    if (!hasOpenPdf) return null;
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
    const discardBtn = document.getElementById('audioDiscardBtn');
    const centerCardId = getCurrentCenterCardId();
    const hasActiveRecordingSignal = !!(audioRecordState
        && audioRecordState.cardId !== null
        && audioRecordState.lastAcceptedAt
        && (Date.now() - audioRecordState.lastAcceptedAt) <= AUDIO_RECORD_ACTIVE_SIGNAL_MS);
    const canRestartRecording = !!(audioAssistMode === 2
        && !audioRecordState
        && centerCardId
        && audioDiscardSuppressedCardId === centerCardId);
    if (btn) {
        if (audioAssistMode === 2) {
            btn.textContent = 'Ton Rec';
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

        // Weißer Rahmen nur, wenn während der Aufnahme gerade musikalisches Signal erkannt wird.
        if (hasActiveRecordingSignal) {
            btn.style.border = '2px solid #ffffff';
            btn.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.45), 0 0 14px rgba(255,255,255,0.8)';
        } else {
            btn.style.border = '';
            btn.style.boxShadow = '';
        }
    }
    if (discardBtn) {
        discardBtn.style.display = audioAssistMode === 2 ? 'inline-flex' : 'none';
        if (audioRecordState && audioRecordState.cardId !== null) {
            discardBtn.textContent = 'Verw.';
            discardBtn.title = 'Laufende Aufnahme verwerfen';
            discardBtn.disabled = false;
        } else if (canRestartRecording) {
            discardBtn.textContent = 'Nochmal';
            discardBtn.title = 'Referenz für dieses Blatt sofort neu aufnehmen';
            discardBtn.disabled = false;
        } else {
            discardBtn.textContent = 'Verw.';
            discardBtn.title = 'Laufende Aufnahme verwerfen';
            discardBtn.disabled = true;
        }
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

function collectAudioPathsForTitle(title) {
    const cardNodes = getRenderApi()?.getCardNodes() || [];
    if (!xmlData || !cardNodes.length) return [];
    const titleKey = String(title || '').trim();
    if (!titleKey) return [];

    return cardNodes.map((cardNode, idx) => {
        const cardTitle = (cardNode.querySelector('Titel')?.textContent || '').trim();
        if (cardTitle !== titleKey) return null;
        const audioNode = cardNode.querySelector('AudioReferenz');
        if (!audioNode) return null;
        const filePath = (audioNode.querySelector('Datei')?.textContent || '').trim();
        return filePath || null;
    }).filter(Boolean);
}

function clearAudioReferenceForTitle(title) {
    const cardNodes = getRenderApi()?.getCardNodes() || [];
    if (!xmlData || !cardNodes.length) return;
    const titleKey = String(title || '').trim();
    if (!titleKey) return;

    cardNodes.forEach((cardNode, idx) => {
        const cardTitle = (cardNode.querySelector('Titel')?.textContent || '').trim();
        if (cardTitle !== titleKey) return;
        const audioNode = cardNode.querySelector('AudioReferenz');
        if (!audioNode) return;
        upsertXmlChild(audioNode, 'Datei', '');
        upsertXmlChild(audioNode, 'MimeType', '');
        upsertXmlChild(audioNode, 'Fingerprint', '');
        upsertXmlChild(audioNode, 'ErfasstAm', '');
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

function getCardAudioNode(cardId) {
    const cardNode = getRenderApi()?.getCardNodeById(cardId) || null;
    if (!cardNode || !xmlData) return null;
    let node = cardNode.querySelector('AudioReferenz');
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
    const audioNode = getCardAudioNode(cardId);
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
    const audioNode = cardNode?.querySelector('AudioReferenz');
    if (!audioNode) return null;
    const fingerprint = audioNode.querySelector('Fingerprint')?.textContent || '';
    const path = audioNode.querySelector('Datei')?.textContent || '';
    if (!fingerprint || !path) return null;
    return {
        path,
        fingerprint,
        mimeType: audioNode.querySelector('MimeType')?.textContent || ''
    };
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

    const chunkSize = Math.max(1, Math.floor(data.length / AUDIO_FINGERPRINT_BANDS));
    for (let bandIndex = 0; bandIndex < AUDIO_FINGERPRINT_BANDS; bandIndex++) {
        let sum = 0;
        let count = 0;
        const start = bandIndex * chunkSize;
        const end = Math.min(data.length, start + chunkSize);
        for (let i = start; i < end; i++) {
            sum += data[i];
            count++;
        }
        targetVector[bandIndex] += count > 0 ? (sum / count) : 0;
    }
    return true;
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

function collectAudioReferenceCandidates() {
    const cardNodes = getRenderApi()?.getCardNodes() || [];
    if (!xmlData || !cardNodes.length) return [];
    return cardNodes.map((cardNode, idx) => {
        const audio = readAudioMetadataFromCardNode(cardNode);
        if (!audio) return null;
        const parsedFingerprint = parseFingerprint(audio.fingerprint);
        if (!parsedFingerprint) return null;
        return {
            idx,
            titel: cardNode.querySelector('Titel')?.textContent || 'Unbekannt',
            status: cardNode.querySelector('Arbeitsstatus')?.textContent || '',
            speicherort: cardNode.querySelector('Speicherort')?.textContent || '',
            fingerprint: parsedFingerprint,
            path: audio.path
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

async function finalizeRecordedAudio(state) {
    if (!state || !state.cardId || !state.chunks.length) return;
    const blob = new Blob(state.chunks, { type: state.mimeType || 'audio/webm' });
    if (blob.size < 1024) {
        updateAudioAssistUi();
        return;
    }

    const extension = getAudioExtensionFromMime(state.mimeType);
    const safeTitle = sanitizeSoundFileBase(state.title || 'blatt');
    const timestamp = new Date().toISOString().replace(/[:\.]/g, '-');
    const fileName = 'sound_' + safeTitle + '_' + timestamp + '.' + extension;

    if (state.frameCount < 6) {
        alert('Zu wenig musikalisches Signal erkannt. Bitte lauter/sauberer einspielen.');
        return;
    }

    const fingerprint = normalizeBandVector(state.bandSums, state.frameCount);
    if (!fingerprint) return;

    let uploadResult = null;
    try {
        uploadResult = await uploadRecordedAudio(blob, fileName);
    } catch (err) {
        alert('Audio-Datei konnte nicht gespeichert werden.\n\n' + err.message);
        return;
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
        capturedAt: new Date().toISOString()
    });

    if (typeof saveXml === 'function') {
        try {
            await saveXml(true);
        } catch (err) {
            alert('Audio-Datei wurde hochgeladen, aber die XML konnte nicht gespeichert werden. Bitte erneut speichern oder Notentisch neu starten.');
        }
    }
}

async function startAudioRecordingForCenterCard(cardId) {
    const cardNode = getRenderApi()?.getCardNodeById(cardId) || null;
    if (!cardNode || typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

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
        state.finalizingPromise = finalizeRecordedAudio(state).catch((err) => {
            console.error('Audio-Referenz konnte nicht gespeichert werden:', err);
        }).finally(() => {
            if (typeof state.resolveStopPromise === 'function') {
                state.resolveStopPromise();
            }
        });
    });

    state.samplerTimer = setInterval(() => {
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

async function discardCurrentAudioRecording() {
    const centerCardId = getCurrentCenterCardId();
    if (audioRecordState && audioRecordState.cardId !== null) {
        audioDiscardSuppressedCardId = String(audioRecordState.cardId);
        await stopAudioRecording(false);
    } else if (audioAssistMode === 2 && centerCardId && audioDiscardSuppressedCardId === centerCardId) {
        audioDiscardSuppressedCardId = null;
        await startAudioRecordingForCenterCard(centerCardId);
    }
    updateAudioAssistUi();
}

async function startAudioMatching() {
    if (audioMatchState || !navigator.mediaDevices?.getUserMedia) return;
    const candidates = collectAudioReferenceCandidates();
    if (!candidates.length) {
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
    audioConsecutiveDetections = 0;
    audioLastDetectedCardId = null;
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

    const candidates = collectAudioReferenceCandidates();
    let best = null;
    for (const candidate of candidates) {
        const score = cosineSimilarity(liveFingerprint, candidate.fingerprint);
        if (!best || score > best.score) {
            best = { ...candidate, score };
        }
    }

    if (!best || best.score < AUDIO_MATCH_THRESHOLD) {
        audioConsecutiveDetections = 0;
        audioLastDetectedCardId = null;
        return;
    }

    if (audioLastDetectedCardId === String(best.idx)) {
        audioConsecutiveDetections += 1;
    } else {
        audioLastDetectedCardId = String(best.idx);
        audioConsecutiveDetections = 1;
    }

    if (audioConsecutiveDetections < AUDIO_MATCH_REQUIRED_HITS) {
        return;
    }

    const match = buildMatchObjectForCardId(best.idx);
    if (match && typeof executeSearchDrop === 'function' && !(typeof currentPdfDoc !== 'undefined' && currentPdfDoc)) {
        stopAudioMatching();
        executeSearchDrop(match);
    }
}

async function audioAssistTick() {
    if (!audioAssistMode || audioAssistBusy) return;
    audioAssistBusy = true;

    try {
        const hasOpenPdf = (typeof currentPdfDoc !== 'undefined' && !!currentPdfDoc);
        let centerCardId = getCurrentCenterCardId();

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
                    }
                } else if (!audioRecordState || audioRecordState.cardId !== centerCardId) {
                    await stopAudioRecording(true);
                    await startAudioRecordingForCenterCard(centerCardId);
                }
            } else {
                // Nur-Hören-Modus: nicht aufnehmen
                if (audioRecordState) {
                    await stopAudioRecording(true);
                }
            }
        } else if (hasOpenPdf) {
            // Bei offenem PDF ohne auflösbare Karten-ID wird kein Matching gestartet,
            // um falsche Auto-Treffer zu vermeiden.
            if (audioMatchState) {
                stopAudioMatching();
            }
            if (audioRecordState) {
                await stopAudioRecording(true);
            }
        } else {
            if (audioRecordState) {
                await stopAudioRecording(true);
            }
            if (!audioMatchState) {
                await startAudioMatching();
            }
            await evaluateAudioMatching();
        }
    } catch (err) {
        console.error('Audio-Automatik Fehler:', err);
        alert('Audio-Automatik konnte nicht gestartet werden. Bitte Mikrofonfreigabe prüfen.');
        disableAudioAssistMode();
    } finally {
        audioAssistBusy = false;
    }
}

function disableAudioAssistMode() {
    audioAssistMode = 0;
    audioDiscardSuppressedCardId = null;
    if (audioAssistMonitorTimer) {
        clearInterval(audioAssistMonitorTimer);
        audioAssistMonitorTimer = null;
    }
    stopAudioMatching();
    stopAudioRecording(true).catch(() => {});
    updateAudioAssistUi();
}

function toggleAudioAssistMode() {
    const nextMode = (audioAssistMode + 1) % 3;

    if (nextMode === 0) {
        disableAudioAssistMode();
        return;
    }

    if (audioAssistMode === 0 && (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')) {
        alert('Dieser Browser unterstützt die Audio-Funktion nicht vollständig.');
        return;
    }

    audioAssistMode = nextMode;
    updateAudioAssistUi();

    if (!audioAssistMonitorTimer) {
        audioAssistTick();
        audioAssistMonitorTimer = setInterval(audioAssistTick, 1200);
    }
}

window.toggleAudioAssistMode = toggleAudioAssistMode;
window.discardCurrentAudioRecording = discardCurrentAudioRecording;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateAudioAssistUi);
} else {
    updateAudioAssistUi();
}