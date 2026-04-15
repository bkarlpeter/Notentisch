let audioAssistMode = 0; // 0=aus, 1=hÃ¶ren/suchen, 2=aufnehmen+suchen
let audioAssistDirection = 1; // 1=aufwÃ¤rts (0â†’1â†’2), -1=abwÃ¤rts (2â†’1â†’0)
let audioAssistMonitorTimer = null;
let audioAssistBusy = false;
let audioAssistPressStartedAt = 0;
let audioAssistLastToggleAt = 0;

let audioRecordState = null;
let audioMatchState = null;
let audioRecordStartDelayState = null;
let audioHitHistory = []; // Voting-Fenster: letzte N bestCardId-Ergebnisse (over threshold)
let audioLastBestCardId = null;
let audioBestCardStreak = 0;
let audioDiscardSuppressedCardId = null;
let audioWaitAfterMatchUntil = 0;
let audioWaitAfterMatchBlinkUntil = 0;
let audioSearchDifficultSince = 0;
let audioSearchDifficultCount = 0;
let audioSearchLastHintAt = 0;
let audioMatchStartedAt = 0;
let audioMatchCandidateStartedAt = 0;
let audioMatchCandidateCardId = null;
let audioReadyToSaveState = null;
let audioSaveWasConfirmed = false;
let audioDiagQueue = [];
let audioDiagFlushTimer = null;
let audioReferenceCandidateCache = null;
let audioReferenceCandidateCacheVersion = 0;

const AUDIO_FINGERPRINT_BANDS = 24;
const AUDIO_MATCH_THRESHOLD = 0.86;       // + robust: 0.88 â†’ 0.86
const AUDIO_MATCH_REQUIRED_HITS = 5;      // Min-Votes im Fenster zum AuslÃ¶sen
const AUDIO_MATCH_VOTE_WINDOW = 10;       // + stabil: 15 â†’ 10 (â‰ˆ 1.8s Fenster)
const AUDIO_MATCH_EVAL_INTERVAL_MS = 450;
const AUDIO_MATCH_MIN_LIVE_FRAMES = 5;
const AUDIO_MATCH_RESET_ON_SILENCE_DEFAULT_MS = 1000;
const AUDIO_MATCH_ENABLE_FAST_TRIGGER = true;
const AUDIO_MATCH_TRIGGER_MIN_LIVE_FRAMES = 5;
const AUDIO_MATCH_TRIGGER_FLOOR_MIN_GAP = 0.006;
const AUDIO_MATCH_EARLY_HITS = 3;
const AUDIO_MATCH_EARLY_MIN_SCORE = 0.992;
const AUDIO_MATCH_EARLY_MIN_GAP = 0.028;
const AUDIO_MATCH_EARLY_MIN_VOTE_LEAD = 2;
const AUDIO_REFERENCE_MIN_FRAMES = 6;
// Trigger-Grenzen nach Mel+Delta-Umstellung: vorherige Werte (0.994/0.993)
// waren fÃ¼r reale Aufnahmen zu streng und blockierten valide Treffer.
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
const AUDIO_MATCH_AUTO_RESTART_MS = 22000;
const AUDIO_MATCH_AUTO_RESTART_MIN_CYCLES = 20;

// â”€â”€ Beat Finder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getAudioMatchStrictnessProfile() {
    const fallback = (window.NOTENTISCH_USER_CONFIG_DEFAULTS && window.NOTENTISCH_USER_CONFIG_DEFAULTS.audioMatchStrictness) || 'normal';
    let strictness = String(fallback).toLowerCase();
    let exceptionalModesEnabled = false;
    try {
        if (typeof loadUserConfig === 'function') {
            const config = loadUserConfig();
            if (config && config.audioMatchStrictness) {
                strictness = String(config.audioMatchStrictness).toLowerCase();
            }
            exceptionalModesEnabled = !!config?.audioMatchExceptionalModesEnabled;
        }
    } catch {}

    if (!exceptionalModesEnabled && strictness !== 'normal') {
        strictness = 'normal';
    }

    if (strictness === 'locker') {
        return {
            strictness,
            strictMinScore: 0.95,
            strictMinGap: 0.005,
            relaxedMinScore: 0.93,
            relaxedMinGap: 0.001,
            relaxedMinHits: 4,
            relaxedMinVoteLead: 1,
            requiredHits: 4
        };
    }
    if (strictness === 'streng') {
        return {
            strictness,
            strictMinScore: 0.98,
            strictMinGap: 0.010,
            relaxedMinScore: 0.96,
            relaxedMinGap: 0.004,
            relaxedMinHits: 5,
            relaxedMinVoteLead: 2,
            requiredHits: 6
        };
    }

    return {
        strictness: 'normal',
        strictMinScore: 0.96,
        strictMinGap: 0.006,
        relaxedMinScore: 0.94,
        relaxedMinGap: 0.002,
        relaxedMinHits: 5,
        relaxedMinVoteLead: 1,
        requiredHits: 5
    };
}

// â”€â”€ Nicht-blockierender Toast (ersetzt native alert) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    toast.title = 'Klicken zum SchlieÃŸen';
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
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        // Bei Netzwerkfehler wird beim nÃ¤chsten Tick erneut versucht.
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

function getAudioResetOnSilenceMs() {
    const fallback = (window.NOTENTISCH_USER_CONFIG_DEFAULTS && window.NOTENTISCH_USER_CONFIG_DEFAULTS.audioResetOnSilenceMs)
        || AUDIO_MATCH_RESET_ON_SILENCE_DEFAULT_MS;
    try {
        if (typeof loadUserConfig === 'function') {
            const config = loadUserConfig();
            const value = Number(config?.audioResetOnSilenceMs);
            if (value === 800 || value === 1000 || value === 1500) {
                return value;
            }
        }
    } catch {}
    return (fallback === 800 || fallback === 1000 || fallback === 1500)
        ? fallback
        : AUDIO_MATCH_RESET_ON_SILENCE_DEFAULT_MS;
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

function resetAudioSearchDifficultyState() {
    audioSearchDifficultSince = 0;
    audioSearchDifficultCount = 0;
    updateAudioAssistUi();
}

function resetAudioMatchCandidateProgress() {
    audioMatchCandidateStartedAt = 0;
    audioMatchCandidateCardId = null;
}

function markAudioSearchDifficulty(reason, context = {}) {
    const now = Date.now();
    if (!audioSearchDifficultSince) {
        audioSearchDifficultSince = now;
    }
    audioSearchDifficultCount += 1;
    if (audioSearchDifficultCount === 4) {
        updateAudioAssistUi();
    }

    const elapsedMs = now - audioSearchDifficultSince;
    const shouldHint = (
        audioSearchDifficultCount >= 8 &&
        elapsedMs >= 12000 &&
        (now - audioSearchLastHintAt) >= 12000
    );

    if (shouldHint) {
        audioSearchLastHintAt = now;
        queueAudioDiagEvent('matching_user_hint_difficult', {
            reason,
            difficultCount: audioSearchDifficultCount,
            elapsedMs,
            ...context
        });
        updateAudioAssistUi();
    }

    // Nach lÃ¤ngerem Kampf (>15s, >15 blockierte Zyklen) Suche automatisch neu starten.
    const requiredHits = Number(context?.requiredHits) || AUDIO_MATCH_REQUIRED_HITS;
    const votes = Number(context?.votes) || 0;
    const bestStreak = Number(context?.bestStreak) || 0;
    const closeToTrigger = votes >= Math.max(1, requiredHits - 1) || bestStreak >= 3;

    const shouldAutoRestart = (
        audioSearchDifficultCount >= AUDIO_MATCH_AUTO_RESTART_MIN_CYCLES &&
        elapsedMs >= AUDIO_MATCH_AUTO_RESTART_MS &&
        audioAssistMode === 1 &&
        !!audioMatchState &&
        !closeToTrigger
    );
    if (shouldAutoRestart) {
        const difficultCountSnapshot = audioSearchDifficultCount;
        queueAudioDiagEvent('matching_auto_restart', {
            reason,
            difficultCount: difficultCountSnapshot,
            elapsedMs,
            ...context
        });
        resetAudioSearchDifficultyState();
        stopAudioMatching();
        showAudioToast('Tonsuche startet neu.');
        setTimeout(() => {
            if (audioAssistMode === 1 && !audioMatchState) {
                startAudioMatching().catch(() => {});
            }
        }, 700);
    }
}

function getAudioReferenceTargetFrames() {
    const fallbackMs = (window.NOTENTISCH_USER_CONFIG_DEFAULTS && window.NOTENTISCH_USER_CONFIG_DEFAULTS.audioReferenceTargetMs) || 7000;  // + mehr Material: 5s â†’ 7s
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

function getAudioRecordStartDelayMs() {
    const fallback = (window.NOTENTISCH_USER_CONFIG_DEFAULTS && window.NOTENTISCH_USER_CONFIG_DEFAULTS.audioRecordStartDelayMs) || 0;
    try {
        if (typeof loadUserConfig === 'function') {
            const config = loadUserConfig();
            if (config && Number.isFinite(Number(config.audioRecordStartDelayMs))) {
                return Math.min(3000, Math.max(0, Number(config.audioRecordStartDelayMs)));
            }
        }
    } catch {}
    return fallback;
}

function clearPendingAudioRecordStart() {
    if (!audioRecordStartDelayState) return;
    if (audioRecordStartDelayState.timerId) {
        clearTimeout(audioRecordStartDelayState.timerId);
    }
    audioRecordStartDelayState = null;
    updateAudioAssistUi();
}

function scheduleAudioRecordingStart(cardId) {
    const normalizedCardId = String(cardId || '');
    if (!normalizedCardId) return;

    const delayMs = getAudioRecordStartDelayMs();
    if (delayMs <= 0) {
        clearPendingAudioRecordStart();
        startAudioRecordingForCenterCard(normalizedCardId).catch((err) => {
            console.error('Audio-Aufnahme konnte nicht gestartet werden:', err);
        });
        return;
    }

    if (audioRecordStartDelayState && audioRecordStartDelayState.cardId === normalizedCardId) {
        return;
    }

    clearPendingAudioRecordStart();
    audioRecordStartDelayState = {
        cardId: normalizedCardId,
        timerId: setTimeout(() => {
            const pending = audioRecordStartDelayState;
            audioRecordStartDelayState = null;
            if (!pending || audioAssistMode !== 2) return;
            const activeCenterId = (typeof activeCenterCardId !== 'undefined' && activeCenterCardId !== null)
                ? String(activeCenterCardId) : null;
            if (activeCenterId !== normalizedCardId || audioRecordState) return;
            startAudioRecordingForCenterCard(normalizedCardId).catch((err) => {
                console.error('Audio-Aufnahme konnte nicht verzÃ¶gert gestartet werden:', err);
            });
        }, delayMs)
    };
    updateAudioAssistUi();
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

function updateAudioRecordProgress() {
    const progressEl = document.getElementById('audio-record-progress');
    if (!progressEl) return;
    const labelEl = document.getElementById('audio-progress-label');
    const dotsContainer = document.getElementById('audio-progress-dots');
    if (!dotsContainer) return;

    progressEl.classList.remove('search-difficult');
    progressEl.classList.remove('search-collecting');

    // Aufnahme-Modus: Fortschritt bis Ziel-FrameCount.
    if (audioAssistMode === 2 && audioRecordState) {
        progressEl.style.display = 'block';
        if (labelEl) labelEl.textContent = 'Searching';

        const targetFrames = audioRecordState.targetFrameCount || 1;
        const currentFrames = audioRecordState.frameCount || 0;
        const targetSecs = Math.ceil((targetFrames * AUDIO_FRAME_SAMPLE_MS) / 1000);
        const currentSecs = Math.ceil((currentFrames * AUDIO_FRAME_SAMPLE_MS) / 1000);

        let html = '';
        for (let i = 1; i <= targetSecs; i++) {
            const cls = i <= currentSecs ? ' class="filled"' : '';
            html += `<span${cls}></span>`;
        }
        html += '<span id="audio-record-progress-end"></span>';
        dotsContainer.innerHTML = html;
        return;
    }

    // Such-Modus: Sammeln (grau) bis erster Kandidat erkannt, danach Warten (gruen).
    if (audioAssistMode === 1 && audioMatchState && audioMatchStartedAt > 0) {
        progressEl.style.display = 'block';
        const hasCandidate = audioMatchCandidateStartedAt > 0;
        if (labelEl) {
            labelEl.textContent = hasCandidate ? 'Warten' : 'Sammeln';
        }

        const targetSecs = Math.ceil(AUDIO_MATCH_AUTO_RESTART_MS / 1000);
        const progressStartTs = hasCandidate ? audioMatchCandidateStartedAt : audioMatchStartedAt;
        const elapsedMs = Math.max(0, Date.now() - progressStartTs);
        const elapsedSecs = Math.ceil(elapsedMs / 1000);
        const currentSecs = Math.min(targetSecs, Math.max(1, elapsedSecs));
        const difficultSearch = (
            audioSearchDifficultCount >= 8 &&
            audioSearchDifficultSince > 0 &&
            (Date.now() - audioSearchDifficultSince) >= 12000
        );
        if (!hasCandidate && !difficultSearch) {
            progressEl.classList.add('search-collecting');
        }
        if (difficultSearch) {
            progressEl.classList.add('search-difficult');
        }

        let html = '';
        for (let i = 1; i <= targetSecs; i++) {
            const cls = i <= currentSecs ? ' class="filled"' : '';
            html += `<span${cls}></span>`;
        }
        html += '<span id="audio-record-progress-end"></span>';
        dotsContainer.innerHTML = html;
        return;
    }

    progressEl.style.display = 'none';
}

function updateAudioAssistUi() {
    const btn = document.getElementById('audioAssistBtn');
    const hasPendingRecordStart = !!(audioAssistMode === 2 && audioRecordStartDelayState && !audioRecordState);
    const hasRecentMusicSignal = !!(audioAssistMode === 2
        && audioRecordState
        && audioRecordState.cardId !== null
        && audioRecordState.lastAcceptedAt
        && (Date.now() - audioRecordState.lastAcceptedAt) <= AUDIO_RECORD_ACTIVE_SIGNAL_MS);
    if (btn) {
        if (audioAssistMode === 2) {
            // In Ton-Rec: bei StartverzÃ¶gerung "Startet...", danach "Aufnahme" oder "Bereit".
            btn.textContent = audioReadyToSaveState ? 'Bereit' : (hasPendingRecordStart ? 'Startet...' : 'Aufnahme');
            btn.style.background = hasPendingRecordStart ? '#3498db' : '#c56a1b';
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

        // WeiÃŸer Rahmen nur, wenn waehrend der Aufnahme gerade musikalisches Signal erkannt wird.
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
        // GrÃ¼n: nach Auto-Speichern, solange Wartezeit lÃ¤uft. Blau: wenn Wartezeit vorbei.
        const inWaitTime = audioWaitAfterMatchUntil > 0 && Date.now() < audioWaitAfterMatchUntil;
        if (audioSaveWasConfirmed && inWaitTime) {
            saveBtn.textContent = 'Gespeichert';
            saveBtn.title = 'MusicPrint gespeichert â€“ Wartezeit lÃ¤uft';
            saveBtn.style.background = '#27ae60';
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

    updateAudioRecordProgress();
}

