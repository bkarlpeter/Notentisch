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
        throw new Error('Lokaler Server nicht erreichbar. Bitte Notentisch neu starten bzw. python/local_server.py neu starten.');
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
        throw new Error('UngÃ¼ltige Serverantwort beim Audio-Upload.');
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

    let targetCardIds = [String(state.cardId)];
    if (isReplaceAudioByTitleEnabled()) {
        const title = getCardTitleById(state.cardId) || state.title || '';
        const oldPaths = collectAudioPathsForTitle(title);
        clearAudioReferenceForTitle(title);
        targetCardIds = collectCardIdsForTitle(title, state.cardId);
        if (!targetCardIds.length) targetCardIds = [String(state.cardId)];
        for (const oldPath of new Set(oldPaths)) {
            if (String(oldPath).trim() !== String(uploadResult.path).trim()) {
                await deleteAudioFileByPath(oldPath);
            }
        }
    }

    const capturedAt = new Date().toISOString();
    for (const targetCardId of targetCardIds) {
        writeAudioMetadataToCard(targetCardId, {
            path: uploadResult.path,
            mimeType: state.mimeType,
            fingerprint,
            capturedAt,
            frameCount: Number(state.frameCount || 0),
            targetFrameCount: Number(state.targetFrameCount || 0),
            appendReference: true
        });
    }
    getRenderApi()?.resetCardRenderCache();
    for (const targetCardId of targetCardIds) {
        syncRenderedAudioBadge(targetCardId);
    }

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

    clearPendingAudioRecordStart();

    // Bei neuer Aufnahme den gespeicherten BestÃ¤tigungsstatus zurÃ¼cksetzen.
    audioReadyToSaveState = null;
    audioSaveWasConfirmed = false;

    // Wenn bereits ein Print vorhanden: mehr Material sammeln fÃ¼r bessere Erkennung.
    const existingPrint = (cardNode.querySelector('AudioReferenz Fingerprint')?.textContent || '').trim();
    const baseTargetFrames = getAudioReferenceTargetFrames();
    const computedTargetFrameCount = existingPrint ? Math.round(baseTargetFrames * 1.5) : baseTargetFrames;
    if (existingPrint) {
        showAudioToast('Neuaufnahme, etwas lÃ¤nger einspielen.');
    }

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
        targetFrameCount: computedTargetFrameCount,
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
        
        // Fingerprint berechnen und fÃ¼r Speicherung bereitstellen.
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
        const nowTs = Date.now();
        if ((nowTs - audioNoCandidatesLastHintAt) >= AUDIO_NO_CANDIDATES_HINT_COOLDOWN_MS) {
            audioNoCandidatesLastHintAt = nowTs;
            showAudioToast('Keine Audio-Referenzen gefunden. Bitte XML laden und mindestens eine Referenz aufnehmen.');
        }
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
        lastAcceptedAt: 0,
        samplerTimer: setInterval(() => {
            if (!matchState.running) return;
            const accepted = sampleAnalyserIntoBandVector(analyser, matchState.bandSums, isMusicLikeFrame);
            if (accepted) {
                matchState.frameCount += 1;
                matchState.lastAcceptedAt = Date.now();
            }
        }, 180)
    };
    audioMatchState = matchState;
    audioMatchStartedAt = Date.now();
    resetAudioMatchCandidateProgress();
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
    audioMatchStartedAt = 0;
    resetAudioMatchCandidateProgress();
    audioHitHistory = [];
    audioLastBestCardId = null;
    audioBestCardStreak = 0;
    queueAudioDiagEvent('matching_stopped', {
        mode: audioAssistMode
    });
    updateAudioAssistUi();
}

async function evaluateAudioMatching() {
    if (!audioMatchState || !audioMatchState.running || !xmlData) return;
    if (typeof currentPdfDoc !== 'undefined' && currentPdfDoc) return;
    const nowTs = Date.now();

    const noSignalDurationMs = audioMatchState.lastAcceptedAt > 0
        ? (nowTs - audioMatchState.lastAcceptedAt)
        : (audioMatchStartedAt > 0 ? (nowTs - audioMatchStartedAt) : 0);
    if (noSignalDurationMs >= AUDIO_MATCH_NO_SIGNAL_ABORT_MS) {
        queueAudioDiagEvent('matching_stopped_no_signal', {
            mode: audioAssistMode,
            noSignalDurationMs: Math.round(noSignalDurationMs)
        });
        showAudioToast('Keine Tonsignale mehr erkannt. Tonsuche wurde beendet.');
        disableAudioAssistMode();
        return;
    }

    // Nach kurzer Spielpause (z. B. Verspieler) Suchlauf weich zuruecksetzen,
    // damit ein neuer Ansatz nicht an alten Votes haengen bleibt.
    const silenceGapMs = audioMatchState.lastAcceptedAt > 0
        ? (nowTs - audioMatchState.lastAcceptedAt)
        : 0;
    if (
        silenceGapMs >= getAudioResetOnSilenceMs() &&
        (audioHitHistory.length > 0 || audioMatchCandidateStartedAt > 0)
    ) {
        audioHitHistory = [];
        audioLastBestCardId = null;
        audioBestCardStreak = 0;
        resetAudioMatchCandidateProgress();
        resetAudioSearchDifficultyState();
        audioMatchStartedAt = nowTs;
        queueAudioDiagEvent('matching_reset_silence_gap', {
            silenceGapMs: Math.round(silenceGapMs)
        });
        updateAudioAssistUi();
    }

    if (audioMatchState.frameCount < AUDIO_MATCH_MIN_LIVE_FRAMES) return;

    const liveFrameCount = audioMatchState.frameCount;
    const liveFingerprint = parseFingerprint(normalizeBandVector(audioMatchState.bandSums, liveFrameCount));
    audioMatchState.bandSums = createEmptyBandVector();
    audioMatchState.frameCount = 0;
    if (!liveFingerprint) return;
    const liveMatchingFingerprint = buildMatchingVector(liveFingerprint);
    if (!liveMatchingFingerprint) return;

    const candidates = collectAudioReferenceCandidates();
    if (!candidates.length) {
        queueAudioDiagEvent('matching_no_candidates', {
            liveFrameCount
        });
        const nowTsNoCandidates = Date.now();
        if ((nowTsNoCandidates - audioNoCandidatesLastHintAt) >= AUDIO_NO_CANDIDATES_HINT_COOLDOWN_MS) {
            audioNoCandidatesLastHintAt = nowTsNoCandidates;
            showAudioToast('Tonsuche gestoppt: Keine Audio-Referenzen verfuegbar.');
        }
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
            best = { ...candidate, score, liveFrameCount };
        } else if (!secondBest || score > secondBest.score) {
            secondBest = { ...candidate, score, liveFrameCount };
        }
    }

    const scoreGap = best && secondBest ? (best.score - secondBest.score) : Number.POSITIVE_INFINITY;

    if (!best || best.score < AUDIO_MATCH_THRESHOLD) {
        // Kein ausreichendes Signal: Verlauf nur sanft abbauen, nicht hart abbrechen.
        if (audioHitHistory.length > 0) {
            audioHitHistory.shift();
        }
        if (audioBestCardStreak > 0) {
            audioBestCardStreak = Math.max(0, audioBestCardStreak - 1);
        }
        if (!audioHitHistory.length) {
            audioLastBestCardId = null;
            audioBestCardStreak = 0;
            resetAudioMatchCandidateProgress();
            resetAudioSearchDifficultyState();
        } else {
            markAudioSearchDifficulty('low_signal', {
                bestScore: best ? Number(best.score.toFixed(4)) : null,
                historySize: audioHitHistory.length
            });
        }
        return;
    }

    const strictnessProfile = getAudioMatchStrictnessProfile();
    const bestCardId = String(best.idx);
    if (audioMatchCandidateCardId !== bestCardId) {
        audioMatchCandidateCardId = bestCardId;
        audioMatchCandidateStartedAt = Date.now();
    }
    if (audioLastBestCardId !== bestCardId) {
        const decisiveSwitch = (
            audioLastBestCardId !== null &&
            best.score >= Math.max(strictnessProfile.relaxedMinScore, 0.975) &&
            scoreGap >= Math.max(strictnessProfile.relaxedMinGap, 0.025)
        );
        if (decisiveSwitch) {
            audioHitHistory = [];
            queueAudioDiagEvent('matching_vote_reset_piece_change', {
                fromCardId: audioLastBestCardId,
                toCardId: bestCardId,
                bestScore: Number(best.score.toFixed(4)),
                scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null
            });
        }
        audioLastBestCardId = bestCardId;
        audioBestCardStreak = 1;
    } else {
        audioBestCardStreak += 1;
    }

    // Voting-Fenster aktualisieren
    audioHitHistory.push(bestCardId);
    if (audioHitHistory.length > AUDIO_MATCH_VOTE_WINDOW) audioHitHistory.shift();

    // Wenn ein neuer Kandidat kurz nacheinander stabil vorne liegt,
    // alten Suchlauf aktiv abbrechen (nur neue Kandidaten-Stimmen behalten).
    if (
        audioBestCardStreak >= 3 &&
        best.score >= Math.max(strictnessProfile.relaxedMinScore - 0.01, 0.93) &&
        scoreGap >= Math.max(strictnessProfile.relaxedMinGap, 0.010)
    ) {
        const beforeLen = audioHitHistory.length;
        audioHitHistory = audioHitHistory.filter((id) => id === bestCardId);
        if (audioHitHistory.length !== beforeLen) {
            queueAudioDiagEvent('matching_retry_takeover', {
                bestCardId,
                bestScore: Number(best.score.toFixed(4)),
                scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null,
                bestStreak: audioBestCardStreak,
                droppedVotes: beforeLen - audioHitHistory.length
            });
        }
    }

    const votesForBest = audioHitHistory.filter(id => id === bestCardId).length;
    const votesByCardId = Object.create(null);
    for (const cardId of audioHitHistory) {
        votesByCardId[cardId] = (votesByCardId[cardId] || 0) + 1;
    }
    let runnerUpVotes = 0;
    for (const [cardId, voteCount] of Object.entries(votesByCardId)) {
        if (cardId !== bestCardId && voteCount > runnerUpVotes) {
            runnerUpVotes = voteCount;
        }
    }
    const voteLead = votesForBest - runnerUpVotes;
    const requiredHits = Number.isFinite(Number(strictnessProfile.requiredHits))
        ? Math.max(2, Math.floor(Number(strictnessProfile.requiredHits)))
        : AUDIO_MATCH_REQUIRED_HITS;
    const requiredStreak = strictnessProfile.strictness === 'streng'
        ? 4
        : (strictnessProfile.strictness === 'locker' ? 2 : 3);
    const hasStrongRepeatBaseline = (
        audioLastMatchedScore >= AUDIO_MATCH_REPEAT_BASELINE_MIN_SCORE &&
        audioLastMatchedGap >= AUDIO_MATCH_REPEAT_BASELINE_MIN_GAP &&
        audioLastMatchedVoteLead >= AUDIO_MATCH_REPEAT_BASELINE_MIN_VOTE_LEAD
    );
    const repeatReacquireActive = (
        !!audioLastMatchedCardId &&
        bestCardId === String(audioLastMatchedCardId) &&
        audioLastMatchedAt > 0 &&
        (Date.now() - audioLastMatchedAt) <= AUDIO_MATCH_REPEAT_REACQUIRE_WINDOW_MS &&
        hasStrongRepeatBaseline &&
        best.score >= Math.max(strictnessProfile.relaxedMinScore, AUDIO_MATCH_REPEAT_REACQUIRE_MIN_SCORE) &&
        scoreGap >= Math.max(strictnessProfile.relaxedMinGap, AUDIO_MATCH_REPEAT_REACQUIRE_MIN_GAP)
    );
    const effectiveRequiredHits = repeatReacquireActive
        ? Math.max(2, requiredHits - AUDIO_MATCH_REPEAT_REACQUIRE_HITS_REDUCTION)
        : requiredHits;
    const effectiveRequiredStreak = repeatReacquireActive
        ? Math.max(2, requiredStreak - AUDIO_MATCH_REPEAT_REACQUIRE_STREAK_REDUCTION)
        : requiredStreak;
    const allowVotesDominantPath = (
        votesForBest >= effectiveRequiredHits &&
        voteLead >= 2 &&
        best.score >= strictnessProfile.relaxedMinScore &&
        scoreGap >= Math.max(strictnessProfile.relaxedMinGap, 0.008)
    );

    queueAudioDiagEvent('matching_scored', {
        candidateCount: candidates.length,
        totalReferenceCount: candidates.reduce((sum, c) => sum + (Number(c.referenceCount) || 0), 0),
        bestCardId,
        bestScore: Number(best.score.toFixed(4)),
        secondBestScore: secondBest ? Number(secondBest.score.toFixed(4)) : null,
        scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null,
        liveFrameCount,
        referenceQuality: Number((best.referenceQuality || 0).toFixed(3)),
        votes: votesForBest,
        runnerUpVotes,
        voteLead,
        bestStreak: audioBestCardStreak,
        window: audioHitHistory.length,
        threshold: AUDIO_MATCH_THRESHOLD,
        requiredHits,
        requiredStreak,
        effectiveRequiredHits,
        effectiveRequiredStreak,
        repeatReacquireActive,
        hasStrongRepeatBaseline,
        lastMatchedCardId: audioLastMatchedCardId,
        lastMatchedAgeMs: audioLastMatchedAt > 0 ? Math.max(0, Date.now() - audioLastMatchedAt) : null,
        lastMatchedScore: Number.isFinite(audioLastMatchedScore) ? Number(audioLastMatchedScore.toFixed(4)) : null,
        lastMatchedGap: Number.isFinite(audioLastMatchedGap) ? Number(audioLastMatchedGap.toFixed(4)) : null,
        lastMatchedVoteLead: Number.isFinite(audioLastMatchedVoteLead) ? audioLastMatchedVoteLead : null
    });

    const earlyQualityPenalty = Math.max(0, 0.85 - (best.referenceQuality || 0)) * 0.05;
    const earlyLivePenalty = liveFrameCount <= AUDIO_MATCH_MIN_LIVE_FRAMES ? 0.006 : 0;
    const earlyTriggerMinScore = AUDIO_MATCH_EARLY_MIN_SCORE + earlyQualityPenalty + earlyLivePenalty;
    const earlyTriggerMinGap = AUDIO_MATCH_EARLY_MIN_GAP + (earlyQualityPenalty * 0.8);
    const isEarlyTrigger = AUDIO_MATCH_ENABLE_FAST_TRIGGER && (
        votesForBest >= AUDIO_MATCH_EARLY_HITS &&
        best.score >= earlyTriggerMinScore &&
        scoreGap >= earlyTriggerMinGap &&
        voteLead >= AUDIO_MATCH_EARLY_MIN_VOTE_LEAD
    );

    if (isEarlyTrigger) {
        queueAudioDiagEvent('matching_fast_trigger', {
            bestCardId,
            bestScore: Number(best.score.toFixed(4)),
            scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null,
            votes: votesForBest,
            voteLead,
            liveFrameCount,
            referenceQuality: Number((best.referenceQuality || 0).toFixed(3)),
            earlyTriggerMinScore: Number(earlyTriggerMinScore.toFixed(4)),
            earlyTriggerMinGap: Number(earlyTriggerMinGap.toFixed(4))
        });
    }

    if (!isEarlyTrigger && (votesForBest < effectiveRequiredHits || (audioBestCardStreak < effectiveRequiredStreak && !allowVotesDominantPath))) {
        queueAudioDiagEvent('matching_pending_votes', {
            bestCardId,
            votes: votesForBest,
            required: effectiveRequiredHits,
            bestStreak: audioBestCardStreak,
            requiredStreak: effectiveRequiredStreak,
            baseRequiredHits: requiredHits,
            baseRequiredStreak: requiredStreak,
            repeatReacquireActive,
            allowVotesDominantPath,
            window: audioHitHistory.length,
            scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null
        });
        markAudioSearchDifficulty('pending_votes', {
            bestCardId,
            votes: votesForBest,
            requiredHits: effectiveRequiredHits,
            bestStreak: audioBestCardStreak,
            requiredStreak: effectiveRequiredStreak,
            repeatReacquireActive,
            scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null
        });
        return;
    }

    // Sicherheitscheck: Strict (hoher Score + klarer Gap) oder Relaxed (moderater Score + viele Votes).
    // Die Grenzwerte sind Ã¼ber Advanced "Erkennungs-Strenge" konfigurierbar.
    const hasSecondBest = !!secondBest;
    const meetsTriggerLiveFrames = liveFrameCount >= AUDIO_MATCH_TRIGGER_MIN_LIVE_FRAMES;
    const highConfidenceContinuation = (
        votesForBest >= effectiveRequiredHits &&
        audioBestCardStreak >= effectiveRequiredStreak &&
        best.score >= Math.max(strictnessProfile.strictMinScore, 0.965)
    );
    const effectiveGapFloor = highConfidenceContinuation
        ? Math.min(AUDIO_MATCH_TRIGGER_FLOOR_MIN_GAP, 0.006)
        : AUDIO_MATCH_TRIGGER_FLOOR_MIN_GAP;
    const meetsTriggerGapFloor = !hasSecondBest || scoreGap >= effectiveGapFloor;

    if (!meetsTriggerLiveFrames || !meetsTriggerGapFloor) {
        queueAudioDiagEvent('matching_blocked_low_separation', {
            bestCardId,
            bestScore: Number(best.score.toFixed(4)),
            scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null,
            liveFrameCount,
            requiredLiveFrames: AUDIO_MATCH_TRIGGER_MIN_LIVE_FRAMES,
            requiredGap: effectiveGapFloor,
            highConfidenceContinuation,
            hasSecondBest
        });
        markAudioSearchDifficulty('low_separation', {
            bestCardId,
            bestScore: Number(best.score.toFixed(4)),
            scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null,
            requiredGap: effectiveGapFloor,
            highConfidenceContinuation
        });
        return;
    }

    const isStrictTrigger = (best.score >= strictnessProfile.strictMinScore && scoreGap >= strictnessProfile.strictMinGap);
    const isRelaxedStableTrigger = (
        best.score >= strictnessProfile.relaxedMinScore &&
        scoreGap >= strictnessProfile.relaxedMinGap &&
        votesForBest >= strictnessProfile.relaxedMinHits &&
        voteLead >= strictnessProfile.relaxedMinVoteLead
    );
    if (!isStrictTrigger && !isRelaxedStableTrigger) {
        queueAudioDiagEvent('matching_blocked_low_confidence', {
            bestCardId,
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
        markAudioSearchDifficulty('low_confidence', {
            bestCardId,
            bestScore: Number(best.score.toFixed(4)),
            scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null,
            votes: votesForBest,
            voteLead
        });
        return;
    }

    const match = buildMatchObjectForCardId(best.idx);
    const hasOpenPdfNow = (typeof currentPdfDoc !== 'undefined' && !!currentPdfDoc);
    const canExecuteDrop = typeof executeSearchDrop === 'function';
    if (!match || !canExecuteDrop || hasOpenPdfNow) {
        queueAudioDiagEvent('matching_drop_blocked', {
            bestCardId,
            bestScore: Number(best.score.toFixed(4)),
            votes: votesForBest,
            hasMatchObject: !!match,
            canExecuteDrop,
            hasOpenPdfNow
        });
        return;
    }

    audioHitHistory = [];
    audioLastBestCardId = null;
    audioBestCardStreak = 0;
    resetAudioSearchDifficultyState();
    queueAudioDiagEvent('matching_triggered_drop', {
        matchedCardId: bestCardId,
        matchedScore: Number(best.score.toFixed(4)),
        votes: votesForBest,
        scoreGap: Number.isFinite(scoreGap) ? Number(scoreGap.toFixed(4)) : null,
        liveFrameCount,
        triggerPath: isEarlyTrigger ? 'fast' : (isStrictTrigger ? 'strict' : 'relaxed-stable'),
        repeatReacquireActive
    });
    const matchQualityStrongForRepeat = (
        best.score >= AUDIO_MATCH_REPEAT_BASELINE_MIN_SCORE &&
        scoreGap >= AUDIO_MATCH_REPEAT_BASELINE_MIN_GAP &&
        voteLead >= AUDIO_MATCH_REPEAT_BASELINE_MIN_VOTE_LEAD
    );
    if (matchQualityStrongForRepeat) {
        audioLastMatchedCardId = bestCardId;
        audioLastMatchedAt = Date.now();
        audioLastMatchedScore = Number(best.score) || 0;
        audioLastMatchedGap = Number.isFinite(scoreGap) ? Number(scoreGap) : 0;
        audioLastMatchedVoteLead = Number(voteLead) || 0;
    } else {
        // Schwache Treffer duerfen keinen Repeat-Bonus fuer Folgedetektion freischalten.
        audioLastMatchedCardId = null;
        audioLastMatchedAt = 0;
        audioLastMatchedScore = 0;
        audioLastMatchedGap = 0;
        audioLastMatchedVoteLead = 0;
    }
    audioWaitAfterMatchUntil = Date.now() + getAudioWaitAfterMatchMs();
    // Stream fÃ¼r Beat Finder weiterverwenden statt schlieÃŸen
    const bfAnalyser    = audioMatchState.analyser;
    const bfAudioCtx    = audioMatchState.audioContext;
    const bfStream      = audioMatchState.stream;
    clearInterval(audioMatchState.samplerTimer);
    audioMatchState.running = false;
    audioMatchState = null;
    audioHitHistory = [];
    queueAudioDiagEvent('matching_stopped', { mode: audioAssistMode });
    updateAudioAssistUi();
    stopMediaStream(bfStream);
    bfAudioCtx?.close().catch(() => {});
    executeSearchDrop(match);
    flushAudioDiagQueue();
}

async function audioAssistTick() {
    if (!audioAssistMode || audioAssistBusy) return;
    audioAssistBusy = true;

    try {
        const hasOpenPdf = (typeof currentPdfDoc !== 'undefined' && !!currentPdfDoc);
        // Nur activeCenterCardId (nicht lastCardIdFromCenter) nutzen: wenn keine Karte aktiv im Center,
        // soll Matching starten. lastCardIdFromCenter wÃ¼rde matching dauerhaft blockieren.
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
                            scheduleAudioRecordingStart(centerCardId);
                        }
                    }
                } else if (!audioRecordState || audioRecordState.cardId !== centerCardId) {
                    // Wartezeit nach Aufnahme-Speicherung beachten
                    const now = Date.now();
                    if (now >= audioWaitAfterMatchUntil) {
                        // Wartezeit gerade abgelaufen â†’ Blink starten
                        if (audioWaitAfterMatchUntil > 0 && audioWaitAfterMatchBlinkUntil === 0) {
                            audioWaitAfterMatchBlinkUntil = now + getAudioReadyBlinkMs();
                            updateAudioAssistUi();
                            setTimeout(() => {
                                audioWaitAfterMatchBlinkUntil = 0;
                                updateAudioAssistUi();
                            }, getAudioReadyBlinkMs() + 50);
                        }
                        await stopAudioRecording(false);
                        scheduleAudioRecordingStart(centerCardId);
                    }
                }
            } else {
                // Nur-HÃ¶ren-Modus: nicht aufnehmen
                clearPendingAudioRecordStart();
                if (audioRecordState) {
                    await stopAudioRecording(false);
                }
            }
        } else if (hasOpenPdf) {
            // Bei offenem PDF ohne auflÃ¶sbare Karten-ID wird kein Matching gestartet,
            // um falsche Auto-Treffer zu vermeiden.
            if (audioMatchState) {
                stopAudioMatching();
            }
            clearPendingAudioRecordStart();
            if (audioRecordState) {
                await stopAudioRecording(false);
            }
        } else {
            clearPendingAudioRecordStart();
            if (audioRecordState) {
                await stopAudioRecording(false);
            }
            if (audioAssistMode !== 2) {
                // Nur im HÃ¶r-Modus (1) Matching starten; im Aufnahme-Modus (2) warten
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
        showAudioToast('Audio-Automatik konnte nicht gestartet werden. Bitte Mikrofonfreigabe prÃ¼fen.');
        disableAudioAssistMode();
    } finally {
        if (audioAssistMode) {
            updateAudioRecordProgress();
        }
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
    audioLastMatchedCardId = null;
    audioLastMatchedAt = 0;
    audioLastMatchedScore = 0;
    audioLastMatchedGap = 0;
    audioLastMatchedVoteLead = 0;
    audioHitHistory = [];
    audioLastBestCardId = null;
    audioBestCardStreak = 0;
    resetAudioMatchCandidateProgress();
    clearPendingAudioRecordStart();
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

function toggleAudioAssistMode(event) {
    if (event && event.isTrusted === false) return;

    const nowTs = Date.now();
    if (audioAssistLastToggleAt > 0 && (nowTs - audioAssistLastToggleAt) < 220) {
        return;
    }
    audioAssistLastToggleAt = nowTs;

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
        // In Aufnahme: nur Langdruck wechselt zurÃ¼ck auf GrÃ¼n (Ton An).
        // Kurzdruck bleibt "Aus" als schneller Not-Aus.
        if (isLongPress) {
            nextMode = 1;
            audioAssistDirection = -1;
        } else {
            nextMode = 0;
            audioAssistDirection = -1;
        }
    } else {
        // mode === 1 (Ton An): Langdruck â†’ Aufnahme, Kurzdruck â†’ Aus.
        if (isLongPress) {
            nextMode = 2;
            audioAssistDirection = 1;
        } else {
            nextMode = 0;
            audioAssistDirection = -1;
        }
    }

    if (nextMode === 0) {
        disableAudioAssistMode();
        return;
    }

    if (audioAssistMode === 0 && (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')) {
        showAudioToast('Dieser Browser unterstÃ¼tzt die Audio-Funktion nicht vollstÃ¤ndig.');
        return;
    }

    const previousMode = audioAssistMode;

    if (previousMode === 2 && nextMode === 1) {
        clearPendingAudioRecordStart();
        stopAudioRecording(false).catch(() => {});
    }

    audioAssistMode = nextMode;

    // WeiÃŸe Bereitschaftssignale nur im Aufnahme-Modus anzeigen.
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
        audioAssistMonitorTimer = setInterval(audioAssistTick, AUDIO_MATCH_EVAL_INTERVAL_MS);
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

function collectCardIdsForTitle(title, sourceCardId = null) {
    const cardNodes = getRenderApi()?.getCardNodes() || [];
    if (!xmlData || !cardNodes.length) return [];
    const titleKey = String(title || '').trim();
    const sourceNode = sourceCardId !== null ? (getRenderApi()?.getCardNodeById(sourceCardId) || null) : null;

    const normalizeStorageKey = (rawPath) => {
        const value = String(rawPath || '').trim().replace(/\\/g, '/').toLowerCase();
        if (!value) return '';
        return value.split('#')[0].trim();
    };

    const sourceStorageKey = normalizeStorageKey(sourceNode?.querySelector('Speicherort')?.textContent || '');
    if (!titleKey && !sourceStorageKey) return [];

    return cardNodes.map((cardNode, idx) => {
        const cardTitle = (cardNode.querySelector('Titel')?.textContent || '').trim();
        const cardStorageKey = normalizeStorageKey(cardNode.querySelector('Speicherort')?.textContent || '');
        const sameTitle = titleKey && cardTitle === titleKey;
        const sameStorage = sourceStorageKey && cardStorageKey === sourceStorageKey;
        if (!sameTitle && !sameStorage) return null;
        return String(idx);
    }).filter(Boolean);
}
