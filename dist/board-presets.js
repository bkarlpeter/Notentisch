(function initializeBoardPresets() {
    'use strict';

    const USER_CONFIG_KEY     = 'notentischUserConfig';
    const LEGACY_PRESET_KEY   = 'notentischBoardPreset';
    const CUSTOM_PRESETS_KEY   = 'notentischCustomPresets';
    const PRESET_STATES_KEY    = 'notentischPresetStates';
    const HIDDEN_BUILTINS_KEY  = 'notentischHiddenBuiltins';
    const CUSTOM_ID_PREFIX     = 'custom-';

    const BUILTIN_PRESETS = [
        {
            id: 'classic', label: 'Klassisch', builtin: true,
            description: 'Ohne Dekorrahmen, urspruenglicher Blau-Canvas-Look.',
            preview: { board: '#121212', quadrant: '#1f2e3a', center: '#1a3045', accent: '#5a9fd4', patternUrl: null }
        },
        {
            id: 'carved-a', label: 'Holzornament', builtin: true,
            description: 'Warmer Holzrahmen mit heller Center-Fläche.',
            preview: { board: '#17120d', quadrant: '#4d392b', center: '#f3e7d7', accent: '#9d7d59',
                patternUrl: 'Werkstatt/stock-photo-wooden-carved-pattern-with-a-large-flower-in-the-middle-with-intersecting-broken-lines-with-2259941291.jpg' }
        },
        {
            id: 'carved-b', label: 'Stein/Marmor', builtin: true,
            description: 'Kühler Steinrahmen mit hellem Marmor-Center.',
            preview: { board: '#16181b', quadrant: '#49525a', center: '#ece7df', accent: '#8e959c',
                patternUrl: 'Werkstatt/stock-photo-stone-marble-granite-slab-surface-for-decorative-works-or-texture-19417213.jpg' }
        },
        {
            id: 'carved-c', label: 'Japanisches Muster', builtin: true,
            description: 'Grün-goldenes Ornament mit ruhiger Center-Fläche.',
            preview: { board: '#111611', quadrant: '#2a3b2d', center: '#e8e4d8', accent: '#b69b53',
                patternUrl: 'Werkstatt/stock-vector-japanese-or-chinese-seamless-pattern-with-luxury-green-and-gold-gradient-color-background-for-new-2405722885.jpg' }
        }
    ];
    const BUILTIN_IDS   = BUILTIN_PRESETS.map((p) => p.id);
    const DEFAULT_PRESET = 'carved-a';

    // ── Storage ───────────────────────────────────────────────────────────────

    function readCustomPresets() {
        try { const r = localStorage.getItem(CUSTOM_PRESETS_KEY); return r ? JSON.parse(r) : []; }
        catch { return []; }
    }
    function writeCustomPresets(arr) {
        try { localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch {}
    }
    function readPresetStates() {
        try { const r = localStorage.getItem(PRESET_STATES_KEY); const p = r ? JSON.parse(r) : {};
              return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; }
        catch { return {}; }
    }
    function writePresetStates(s) {
        try { localStorage.setItem(PRESET_STATES_KEY, JSON.stringify(s || {})); } catch {}
    }
    function isActiveInternal(id, states) { return id in states ? !!states[id] : true; }
    function readHiddenBuiltins() {
        try { const r = localStorage.getItem(HIDDEN_BUILTINS_KEY); const a = r ? JSON.parse(r) : [];
              return new Set(Array.isArray(a) ? a : []); }
        catch { return new Set(); }
    }
    function writeHiddenBuiltins(s) {
        try { localStorage.setItem(HIDDEN_BUILTINS_KEY, JSON.stringify([...s])); } catch {}
    }
    function getAllInternal() {
        const hidden = readHiddenBuiltins();
        return [...BUILTIN_PRESETS.filter((p) => !hidden.has(p.id)), ...readCustomPresets()];
    }

    // ── Normalization ─────────────────────────────────────────────────────────

    function normalizeBoardPreset(value) {
        const n = String(value || '').trim().toLowerCase();
        return getAllInternal().some((p) => p.id === n) ? n : DEFAULT_PRESET;
    }

    // ── User-config preset field ──────────────────────────────────────────────

    function readUserConfigPreset() {
        try { const r = localStorage.getItem(USER_CONFIG_KEY); if (!r) return '';
              const p = JSON.parse(r); return typeof p?.boardPreset === 'string' ? p.boardPreset : ''; }
        catch { return ''; }
    }
    function writeUserConfigPreset(preset) {
        try { const r = localStorage.getItem(USER_CONFIG_KEY); const p = r ? JSON.parse(r) : {};
              if (!p || typeof p !== 'object') return;
              p.boardPreset = preset; localStorage.setItem(USER_CONFIG_KEY, JSON.stringify(p)); }
        catch {}
    }

    // ── CSS generation for custom presets ─────────────────────────────────────

    function safeUrl(url)              { return String(url || '').replace(/["'\\]/g, '').replace(/[\x00-\x1f\x7f]/g, ''); }
    function safeColor(v, fallback)    { const s = String(v || '').trim(); return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback; }
    function hexToRgbTriplet(hex) {
        const s = safeColor(hex, '#000000');
        return {
            r: parseInt(s.slice(1, 3), 16),
            g: parseInt(s.slice(3, 5), 16),
            b: parseInt(s.slice(5, 7), 16)
        };
    }

    function generateCustomCSS(preset) {
        const id = String(preset.id || '');
        if (!id.startsWith(CUSTOM_ID_PREFIX)) return '';
        const c  = preset.colors || preset.preview || {};
        const bg = safeColor(c.board,    '#121212');
        const qc = safeColor(c.quadrant, '#3d3428');
        const cc = safeColor(c.center,   '#d4b896');
        const ac = safeColor(c.accent,   '#8b7355');
        const ccRgb = hexToRgbTriplet(cc);
        const rawUrl = safeUrl(preset.patternUrl || c.patternUrl || '');

        if (!rawUrl) return [
            `body[data-board-preset="${id}"] { background: ${bg}; }`,
            `body[data-board-preset="${id}"] .quadrant { background: ${qc}; }`,
            `body[data-board-preset="${id}"] .center-hole { background: ${cc}; border-color: ${ac}; }`,
            `body[data-board-preset="${id}"] .center-hole::before,`,
            `body[data-board-preset="${id}"] .center-hole::after,`,
            `body[data-board-preset="${id}"] #center-content::before { content: none; }`
        ].join('\n');

        const v = '--pattern-' + id;
        const _ts       = preset.tileSize;
        const bgSize    = (_ts === 'cover') ? 'cover'     : `${parseInt(_ts) || 320}px auto`;
        const bgRepeat  = (_ts === 'cover') ? 'no-repeat' : 'repeat';
        return [
            `body[data-board-preset="${id}"] { ${v}: url("${rawUrl}"); --center-frame-width: max(calc((var(--card-stack-width) - 190px) / 4), 12px); --center-overlay-alpha: 0.2; background: ${bg}; }`,
            `body[data-board-preset="${id}"] .quadrant { background: ${qc}; }`,
            `body[data-board-preset="${id}"] .center-hole { background: var(${v}) center/${bgSize} ${bgRepeat}; gap:0; border:none; padding:0; box-shadow:0 0 50px rgba(0,0,0,.9); isolation:isolate; }`,
            `body[data-board-preset="${id}"] .center-hole::before { content:""; position:absolute; inset:calc(-1 * var(--center-frame-width)); border-radius:calc(20px + var(--center-frame-width)); background: linear-gradient(135deg,rgba(255,255,255,.18) 0%,rgba(0,0,0,.22) 100%), var(${v}) center/${bgSize} ${bgRepeat}; box-shadow:0 16px 30px rgba(0,0,0,.42),0 0 0 1px rgba(30,30,30,.7),inset 0 0 0 1px rgba(255,255,255,.3); z-index:-1; pointer-events:none; }`,
            `body[data-board-preset="${id}"] .center-hole::after { content:""; position:absolute; inset:0; border-radius:20px; background:rgba(${ccRgb.r}, ${ccRgb.g}, ${ccRgb.b}, var(--center-overlay-alpha, 0.2)); z-index:0; pointer-events:none; }`,
            `body[data-board-preset="${id}"] .center-hole > * { position:relative; z-index:1; }`,
            `body[data-board-preset="${id}"] #center-content { background: var(${v}) center/${bgSize} ${bgRepeat}; border-radius:20px; border:none; box-shadow:none; }`,
            `body[data-board-preset="${id}"] #center-content::before { content:none; }`
        ].join('\n');
    }

    function injectCustomStyles() {
        const id = 'notentisch-custom-presets-style';
        let el = document.getElementById(id);
        if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
        el.textContent = readCustomPresets().map(generateCustomCSS).join('\n\n');
    }

    // ── DOM helpers ───────────────────────────────────────────────────────────

    function applyBoardPresetAttribute(preset) {
        const n = normalizeBoardPreset(preset);
        if (document.body) document.body.setAttribute('data-board-preset', n);
        return n;
    }
    function resolveInitialPreset() {
        const u = readUserConfigPreset(); if (u) return normalizeBoardPreset(u);
        try { const l = localStorage.getItem(LEGACY_PRESET_KEY); if (l) return normalizeBoardPreset(l); } catch {}
        return DEFAULT_PRESET;
    }
    function genCustomId() { return CUSTOM_ID_PREFIX + Date.now().toString(36).slice(-8); }
    function refreshPublicOptions() { window.NOTENTISCH_BOARD_PRESET_OPTIONS = window.getActiveBoardPresets(); }

    // ── Public API ────────────────────────────────────────────────────────────

    window.NOTENTISCH_BOARD_PRESET_DEFAULT = DEFAULT_PRESET;
    window.NOTENTISCH_BOARD_PRESET_OPTIONS = [];
    window.normalizeBoardPreset = normalizeBoardPreset;

    window.getAllBoardPresets = function () {
        const states = readPresetStates();
        return getAllInternal().map((p) => ({ ...p, active: isActiveInternal(p.id, states), builtin: BUILTIN_IDS.includes(p.id) }));
    };
    window.getActiveBoardPresets = function () {
        const states = readPresetStates();
        return getAllInternal().filter((p) => isActiveInternal(p.id, states));
    };
    window.getBoardPresetOptions = function () { return window.getActiveBoardPresets(); };

    window.isBuiltinPreset  = function (id) { return BUILTIN_IDS.includes(String(id || '')); };
    window.isPresetActive   = function (id) { return isActiveInternal(String(id || ''), readPresetStates()); };

    window.setPresetActive = function (id, active) {
        const s = readPresetStates(); s[String(id)] = !!active; writePresetStates(s); refreshPublicOptions();
    };

    window.addCustomBoardPreset = function (def) {
        const id = genCustomId();
        const patternUrl = def.patternUrl ? safeUrl(String(def.patternUrl)) : null;
        const colors = {
            board:    safeColor(def.colors?.board,    '#121212'),
            quadrant: safeColor(def.colors?.quadrant, '#3d3428'),
            center:   safeColor(def.colors?.center,   '#d4b896'),
            accent:   safeColor(def.colors?.accent,   '#8b7355')
        };
        const newPreset = {
            id,
            label:       String(def.label || 'Eigenes Design').trim().slice(0, 60),
            description: String(def.description || '').trim().slice(0, 120),
            builtin: false, patternUrl, colors,
            preview: { ...colors, patternUrl }
        };
        const arr = readCustomPresets(); arr.push(newPreset); writeCustomPresets(arr);
        injectCustomStyles(); refreshPublicOptions();
        return newPreset;
    };

    window.setCustomPresetTileSize = function (id, tileSize) {
        const idStr = String(id || '');
        const arr = readCustomPresets();
        const idx = arr.findIndex((p) => p.id === idStr);
        if (idx < 0) return false;
        arr[idx].tileSize = (tileSize === 'cover') ? 'cover' : (parseInt(tileSize) || 320);
        writeCustomPresets(arr);
        injectCustomStyles();
        return true;
    };

    window.deleteCustomBoardPreset = function (id) {
        const idStr = String(id || '');
        if (BUILTIN_IDS.includes(idStr)) {
            if (idStr === 'classic') return false;
            const h = readHiddenBuiltins(); h.add(idStr); writeHiddenBuiltins(h);
            if (readUserConfigPreset() === idStr) { writeUserConfigPreset(DEFAULT_PRESET); applyBoardPresetAttribute(DEFAULT_PRESET); }
            refreshPublicOptions();
            return true;
        }
        writeCustomPresets(readCustomPresets().filter((p) => p.id !== idStr));
        const s = readPresetStates(); delete s[idStr]; writePresetStates(s);
        if (readUserConfigPreset() === idStr) { writeUserConfigPreset(DEFAULT_PRESET); applyBoardPresetAttribute(DEFAULT_PRESET); }
        injectCustomStyles(); refreshPublicOptions();
        return true;
    };

    window.restoreBuiltinPreset = function (id) {
        const idStr = String(id || '');
        if (!BUILTIN_IDS.includes(idStr)) return false;
        const h = readHiddenBuiltins(); h.delete(idStr); writeHiddenBuiltins(h);
        refreshPublicOptions();
        return true;
    };

    window.getHiddenBuiltinPresets = function () {
        const hidden = readHiddenBuiltins();
        return BUILTIN_PRESETS.filter((p) => hidden.has(p.id));
    };

    window.setBoardPreset = function (value) {
        const n = applyBoardPresetAttribute(value); writeUserConfigPreset(n);
        try { localStorage.setItem(LEGACY_PRESET_KEY, n); } catch {}
        return n;
    };
    window.getBoardPreset = function () {
        if (!document.body) return DEFAULT_PRESET;
        return normalizeBoardPreset(document.body.getAttribute('data-board-preset'));
    };

    // ── Init ──────────────────────────────────────────────────────────────────

    refreshPublicOptions();
    document.addEventListener('DOMContentLoaded', function () {
        injectCustomStyles();
        applyBoardPresetAttribute(resolveInitialPreset());
        refreshPublicOptions();
    });
})();
