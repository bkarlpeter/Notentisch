const PLAY_MODE_STATE_KEY = 'notentischPlayModeState';

function persistPlayModeState() {
    try {
        sessionStorage.setItem(PLAY_MODE_STATE_KEY, isPlayMode ? '1' : '0');
        localStorage.setItem(PLAY_MODE_STATE_KEY, isPlayMode ? '1' : '0');
    } catch (e) {}
}

function restorePlayModeState() {
    try {
        const sessionValue = sessionStorage.getItem(PLAY_MODE_STATE_KEY);
        if (sessionValue === '1' || sessionValue === '0') {
            isPlayMode = sessionValue === '1';
            return;
        }
        const localValue = localStorage.getItem(PLAY_MODE_STATE_KEY);
        if (localValue === '1' || localValue === '0') {
            isPlayMode = localValue === '1';
        }
    } catch (e) {}
}

function setSaveWarningState(active, message) {
    const saveBtn = document.getElementById('modeToggleBtn');
    const hint = document.getElementById('saveDateHint');

    if (saveWarnBlinkTimer) {
        clearInterval(saveWarnBlinkTimer);
        saveWarnBlinkTimer = null;
    }

    if (!saveBtn) return;

    saveBtn.style.border = '';
    saveBtn.style.outline = '';
    saveBtn.style.outlineOffset = '';
    saveBtn.style.boxShadow = '';
    saveBtn.style.opacity = '1';

    if (active) {
        let on = false;
        let toggles = 0;
        const maxToggles = 6;
        saveWarnBlinkTimer = setInterval(() => {
            on = !on;
            toggles++;
            saveBtn.style.outline = on ? '3px solid #ffd54a' : '3px solid transparent';
            saveBtn.style.outlineOffset = '1px';
            saveBtn.style.boxShadow = on ? '0 0 0 2px rgba(255, 213, 74, 0.35)' : '';

            if (toggles >= maxToggles) {
                clearInterval(saveWarnBlinkTimer);
                saveWarnBlinkTimer = null;
                saveBtn.style.outline = '';
                saveBtn.style.outlineOffset = '';
                saveBtn.style.boxShadow = '';
            }
        }, 260);
        if (hint) hint.textContent = message || '';
    } else {
        if (hint && message) hint.textContent = message;
    }
}

function markUnsavedChange() {
    hasUnsavedChanges = true;
}

function getModeHintText() {
    return isPlayMode
        ? 'Modus: Spielen (Datum automatisch)'
        : 'Modus: Sichten (kein Datum)';
}

function applyModeButtonState() {
    const btn = document.getElementById('modeToggleBtn');
    if (!btn) return;

    btn.textContent = isPlayMode ? 'Spielen' : 'Sichten';
    btn.style.background = isPlayMode ? '#27ae60' : '#3498db';
    btn.style.color = '#fff';
    btn.style.fontWeight = 'bold';
    btn.style.border = 'none';

    const hint = document.getElementById('saveDateHint');
    if (hint) hint.textContent = getModeHintText();
}

function togglePlayMode() {
    isPlayMode = !isPlayMode;
    persistPlayModeState();
    applyModeButtonState();
}

function setSaveDateState(enabled, hintText) {
    const btn = document.getElementById('saveDateBtn');
    const hint = document.getElementById('saveDateHint');
    if (btn) {
        btn.disabled = !enabled;
        btn.style.backgroundColor = enabled ? '' : '#6a7480';
        btn.style.color = 'white';
        btn.style.fontWeight = enabled ? 'bold' : 'normal';
        btn.style.marginLeft = 'auto';
        btn.style.border = '1px solid #a3b1c2';
        btn.style.opacity = '1';
    }
    if (hint) {
        hint.textContent = hintText || '';
    }
}
