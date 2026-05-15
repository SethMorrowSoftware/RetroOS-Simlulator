/**
 * TRS-80 App - Tandy/Radio Shack TRS-80 Emulator for IlluminatOS!
 *
 * Runs Z80-based TRS-80 Model III software (.cmd / .cas / .wav / .dsk /
 * .jv1 / .jv3 / .dmk / .bas) in the browser via Lawrence Kesteloot's
 * `trs80-emulator-web` library, lazy-loaded from the esm.sh CDN.
 *
 * Mirrors the architecture of apps/C64.js:
 *   - CDN-loaded engine, no iframe, mounted in a fresh <div> per session.
 *   - Aggressive audio teardown on close (mute → terminate worker →
 *     close AudioContext → drop DOM) so SID-style "music keeps playing"
 *     bugs can't recur on TRS-80's cassette/sound output either.
 *   - Host-uploaded ROMs from `assets/trs80/local/` (api/trs80-local.php).
 *   - Recently-played chips persisted in localStorage.
 *   - Keyboard shortcuts gated by isFocused() so they don't fire while
 *     another app has focus.
 *   - Pause / Mute / Save State / Load State toolbar buttons.
 *
 * SCRIPTING SUPPORT
 *   Commands: run, runFile, stop, reset, fullscreen, setVolume, pause,
 *             resume, mute, unmute, saveState, loadState
 *   Queries:  getState, getLibrary
 *   Events:   app:trs80:started, app:trs80:ready, app:trs80:stopped,
 *             app:trs80:error, app:trs80:paused, app:trs80:resumed
 *
 * License posture matches the C64 app: we link to the trs80-emulator-web
 * CDN (MIT) and to host-curated ROM directories. We do not redistribute
 * commercial software.
 */

import AppBase from './AppBase.js';
import { escapeHtml } from '../core/Sanitize.js';

/**
 * CDN base for the lkesteloot/trs80 packages. esm.sh transparently
 * converts the published CommonJS to browser-loadable ES modules and
 * resolves the dependency graph (trs80-base, z80-base, etc.) for us.
 *
 * Pin to a major.minor so our usage doesn't break on a future
 * incompatible release. Update deliberately when bumping.
 */
const TRS80_PKG_VERSION = '2.3';
const TRS80_EMU_URL = `https://esm.sh/trs80-emulator@${TRS80_PKG_VERSION}`;
const TRS80_WEB_URL = `https://esm.sh/trs80-emulator-web@${TRS80_PKG_VERSION}`;
const TRS80_BASE_URL = `https://esm.sh/trs80-base@${TRS80_PKG_VERSION}`;

/**
 * File extensions the emulator can load. Used by the file picker and to
 * pick a loader path inside `_runProgramFromBuffer`.
 */
const FLOPPY_EXTS   = new Set(['dsk', 'jv1', 'jv3', 'dmk', 'dsk1', 'dsk3']);
const CASSETTE_EXTS = new Set(['cas', 'wav']);
const PROGRAM_EXTS  = new Set(['cmd', 'bas', 'bin']);
const ALL_EXTS_LIST = '.cmd,.cas,.wav,.dsk,.jv1,.jv3,.dmk,.bas,.bin,.zip';

/**
 * Curated starter library. The TRS-80 freeware/PD landscape is much
 * thinner than the C64's retrobrews collection, so this list stays
 * intentionally small — the host populates `assets/trs80/local/` for
 * anything else.
 *
 * Each entry: { name, icon, category, year, desc, url? | iaItem? }
 *   - `url`:    Direct download URL (CORS-friendly hosts).
 *   - `iaItem`: Internet Archive item ID — resolved at runtime via the
 *               IA metadata API and routed through `api/trs80-local.php`'s
 *               sibling proxy or directly when CORS allows.
 */
const GAME_LIBRARY = [
    { name: 'TRS-80 Model III BASIC', icon: '⌨️', category: 'Tools', year: 1980,
      desc: 'Boot to Level II BASIC — empty machine',
      url: '' /* empty URL = boot machine with no media */ },
];

const CATEGORY_ORDER = [
    'Local Library',  // host-uploaded ROMs from assets/trs80/local/
    'Adventure',
    'Arcade',
    'Action',
    'Puzzle',
    'Tools',
];

class TRS80 extends AppBase {
    constructor() {
        super({
            id: 'trs80',
            name: 'TRS-80',
            icon: '🖥️',
            width: 800,
            height: 620,
            minWidth: 560,
            minHeight: 440,
            resizable: true,
            singleton: true,
            category: 'games'
        });

        this.isRunning = false;
        this.isReady = false;
        this.currentRom = null;
        this.currentRomName = null;
        this.activeBlobUrl = null;
        this._modulesPromise = null;    // dynamic import promise — cached per session
        this._modules = null;           // { emu, web, base } once loaded
        this._trs80 = null;             // live Trs80 instance
        this._screen = null;
        this._keyboard = null;
        this._cassette = null;
        this._sound = null;
        this._audioContext = null;      // we capture and explicitly close on stop
        this._readyWatchdog = null;
        this._localLibrary = [];        // host-uploaded ROMs from assets/trs80/local/
        this._dropdownEntries = new Map(); // option value → entry (rebuilt on local load)
        this._paused = false;
        this._muted = false;
        this._volumeBeforeMute = 0.5;
        this._recents = [];
        this._pagehideHandler = null;
        this._lastSaveState = null;     // Uint8Array of most-recent save state

        this.registerCommands();
        this.registerQueries();
    }

    // ── Scripting ──────────────────────────────────────────────

    registerCommands() {
        this.registerCommand('run', (payload) => {
            const url = typeof payload === 'string' ? payload : payload?.url;
            if (url === undefined) return { success: false, error: 'URL required (empty url = BASIC only)' };
            this.loadGame(url, this.lookupBundleName(url));
            return { success: true, url };
        });
        this.registerCommand('stop',       async () => { await this.stopEmulator(); return { success: true }; });
        this.registerCommand('reset',      async () => { await this.resetCurrent();  return { success: true }; });
        this.registerCommand('pause',          () => { this._setPaused(true);  return { success: true }; });
        this.registerCommand('resume',         () => { this._setPaused(false); return { success: true }; });
        this.registerCommand('mute',           () => { if (!this._muted) this.toggleMute(); return { success: true }; });
        this.registerCommand('unmute',         () => { if ( this._muted) this.toggleMute(); return { success: true }; });
        this.registerCommand('fullscreen', (payload) => {
            const want = payload?.value;
            this.toggleFullscreen(typeof want === 'boolean' ? want : undefined);
            return { success: true };
        });
        this.registerCommand('setVolume', (payload) => {
            const volume = payload?.volume ?? payload?.value;
            if (volume === undefined) return { success: false, error: 'Volume required (0-1)' };
            this.setVolume(Number(volume));
            return { success: true, volume: Number(volume) };
        });
        this.registerCommand('saveState', async () => { await this.saveState(); return { success: true }; });
        this.registerCommand('loadState', async () => { await this.loadState(); return { success: true }; });
    }

    registerQueries() {
        this.registerQuery('getState', () => ({
            isRunning: this.isRunning,
            isReady: this.isReady,
            currentRom: this.currentRom,
            currentRomName: this.currentRomName,
            paused: this._paused,
            muted: this._muted,
        }));
        this.registerQuery('getLibrary', () => GAME_LIBRARY.map(g => ({
            name: g.name, icon: g.icon, category: g.category, year: g.year,
            desc: g.desc, url: g.url,
        })));
    }

    // ── Lifecycle ──────────────────────────────────────────────

    onOpen() {
        const dropdownOptions = this._buildDropdownOptionsHTML();

        return `
            <div class="trs80-app">
                <div class="trs80-toolbar">
                    <div class="trs80-bar">
                        <label class="trs80-label">Program:</label>
                        <select class="trs80-select" id="trs80GameSelect" title="Pick a program">
                            <option value="">— Pick a program —</option>
                            ${dropdownOptions}
                        </select>
                    </div>
                    <div class="trs80-buttons">
                        <button class="trs80-btn" id="trs80PauseBtn" title="Pause / resume (P)" disabled>⏸ Pause</button>
                        <button class="trs80-btn" id="trs80MuteBtn" title="Mute / unmute (M)">🔊</button>
                        <button class="trs80-btn" id="trs80SaveStateBtn" title="Save state (Ctrl+S)" disabled>💾 Save</button>
                        <button class="trs80-btn" id="trs80LoadStateBtn" title="Load state (Ctrl+L)" disabled>📂 Load</button>
                        <button class="trs80-btn" id="trs80StopBtn" title="Stop emulator (Esc)" disabled>⏹ Stop</button>
                        <button class="trs80-btn" id="trs80ResetBtn" title="Reload current program (R)" disabled>🔄 Reset</button>
                        <button class="trs80-btn" id="trs80FsBtn" title="Toggle fullscreen (F)">⛶ Fullscreen</button>
                    </div>
                </div>
                <div class="trs80-toolbar trs80-toolbar-sub">
                    <div class="trs80-bar">
                        <label class="trs80-label">URL:</label>
                        <input type="text" class="trs80-input" id="trs80UrlInput"
                               placeholder="https://example.com/program.cmd"
                               spellcheck="false" />
                        <button class="trs80-btn" id="trs80RunBtn" title="Load & run this URL">▶ Run URL</button>
                        <button class="trs80-btn" id="trs80FileBtn" title="Open a local program/disk/cassette">📂 File…</button>
                        <input type="file" id="trs80FileInput" accept="${ALL_EXTS_LIST}" style="display:none;" />
                    </div>
                </div>
                <div class="trs80-recents" id="trs80Recents" style="display:none;"></div>
                <div class="trs80-emulator-area" id="trs80EmulatorArea">
                    <div class="trs80-splash" id="trs80Splash">
                        <div class="trs80-splash-screen">
                            <div class="trs80-splash-banner">
                                TRS-80 MODEL III BASIC<br>
                                (C) 1980 TANDY<br>
                                READY<br>
                                &gt;<span class="trs80-cursor">█</span>
                            </div>
                        </div>
                        <div class="trs80-splash-hint">
                            <b>Program</b> dropdown picks from the bundled set plus any ROMs the
                            host has dropped into <code>assets/trs80/local/</code>. Or paste a
                            <code>.cmd</code> / <code>.dsk</code> / <code>.cas</code> URL, or
                            click <b>File…</b> for a local file.<br>
                            <span class="trs80-splash-keys">Keys: <b>P</b>=pause &middot; <b>M</b>=mute &middot; <b>R</b>=reset &middot; <b>F</b>=fullscreen &middot; <b>Esc</b>=stop &middot; <b>Ctrl+S/L</b>=save&nbsp;state</span><br>
                            <span class="trs80-splash-credit">Powered by <b>trs80-emulator-web</b> (Lawrence Kesteloot, MIT) — WebAssembly Z80.</span>
                        </div>
                    </div>
                    <div class="trs80-stage" id="trs80Stage" style="display:none;"></div>
                    <div class="trs80-loading" id="trs80Loading" style="display:none;">
                        <div class="trs80-loading-spinner"></div>
                        <div class="trs80-loading-text" id="trs80LoadingText">Loading TRS-80…</div>
                    </div>
                    <div class="trs80-error" id="trs80Error" style="display:none;">
                        <div class="trs80-error-icon">⚠️</div>
                        <div class="trs80-error-title" id="trs80ErrorTitle">Something went wrong</div>
                        <div class="trs80-error-body" id="trs80ErrorBody"></div>
                        <div class="trs80-error-actions">
                            <button class="trs80-btn" id="trs80ErrorDismiss">Back to program list</button>
                        </div>
                    </div>
                </div>
                <div class="trs80-status" id="trs80Status">Ready</div>
            </div>
        `;
    }

    onMount() {
        const gameSelect = this.getElement('#trs80GameSelect');
        const urlInput = this.getElement('#trs80UrlInput');
        const runBtn = this.getElement('#trs80RunBtn');
        const fileBtn = this.getElement('#trs80FileBtn');
        const fileInput = this.getElement('#trs80FileInput');
        const stopBtn = this.getElement('#trs80StopBtn');
        const resetBtn = this.getElement('#trs80ResetBtn');
        const fsBtn = this.getElement('#trs80FsBtn');
        const pauseBtn = this.getElement('#trs80PauseBtn');
        const muteBtn = this.getElement('#trs80MuteBtn');
        const saveStateBtn = this.getElement('#trs80SaveStateBtn');
        const loadStateBtn = this.getElement('#trs80LoadStateBtn');

        this.addHandler(gameSelect, 'change', (e) => {
            const value = e.target.value;
            if (!value) return;
            const entry = this._dropdownEntries.get(value);
            if (!entry) return;
            if (urlInput && typeof entry.url === 'string') urlInput.value = entry.url;
            this.loadLibraryEntry(entry);
        });

        const launchFromUrlBar = () => {
            const url = urlInput?.value?.trim() ?? '';
            if (!url) return;
            const name = this.lookupBundleName(url);
            this._pushRecent({ name, url, icon: '🔗', category: 'Recently pasted' });
            this.loadGame(url, name);
        };
        this.addHandler(runBtn, 'click', launchFromUrlBar);
        this.addHandler(urlInput, 'keydown', (e) => {
            if (e.key === 'Enter') launchFromUrlBar();
        });

        this.addHandler(fileBtn, 'click', () => fileInput?.click());
        this.addHandler(fileInput, 'change', (e) => {
            const file = e.target.files?.[0];
            if (file) this.loadLocalFile(file);
            e.target.value = '';
        });

        this.addHandler(stopBtn, 'click', () => this.stopEmulator());
        this.addHandler(resetBtn, 'click', () => this.resetCurrent());
        this.addHandler(fsBtn, 'click', () => this.toggleFullscreen());
        this.addHandler(pauseBtn, 'click', () => this.togglePause());
        this.addHandler(muteBtn, 'click', () => this.toggleMute());
        this.addHandler(saveStateBtn, 'click', () => this.saveState());
        this.addHandler(loadStateBtn, 'click', () => this.loadState());

        const errorDismiss = this.getElement('#trs80ErrorDismiss');
        this.addHandler(errorDismiss, 'click', () => {
            const splash = this.getElement('#trs80Splash');
            const errorOverlay = this.getElement('#trs80Error');
            if (errorOverlay) errorOverlay.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            if (gameSelect) gameSelect.value = '';
            this.setStatus('Ready');
        });

        // Keyboard shortcuts. Gated on isFocused() so we never grab keys
        // intended for another app, and skipped when the user is typing
        // in an input.
        this.addHandler(document, 'keydown', (e) => {
            if (!this.isFocused()) return;
            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            this._handleShortcut(e);
        });

        // Tab close / page navigate: kill audio + worker cleanly.
        this._pagehideHandler = () => {
            try { this.stopEmulator(); } catch { /* ignore */ }
        };
        window.addEventListener('pagehide', this._pagehideHandler);

        this._loadRecents();
        this._renderRecents();

        // Background warmup of the CDN bundles so the first user-initiated
        // launch is faster.
        this.ensureModulesLoaded().catch((err) => {
            console.warn('[TRS-80] Background module preload failed:', err);
        });

        // Pull in any host-uploaded ROMs from assets/trs80/local/.
        this._fetchLocalLibrary();
    }

    onClose() {
        this.stopEmulator();
        if (this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }
        if (this._pagehideHandler) {
            try { window.removeEventListener('pagehide', this._pagehideHandler); } catch { /* ignore */ }
            this._pagehideHandler = null;
        }
    }

    onResize() {
        // CanvasScreen sizes itself based on its parent; nothing to do.
    }

    // ── Library / Dropdown Helpers ─────────────────────────────

    _buildDropdownOptionsHTML() {
        this._dropdownEntries = new Map();
        const byCat = new Map();
        const allEntries = [...this._localLibrary, ...GAME_LIBRARY];
        allEntries.forEach((entry, idx) => {
            const key = `opt:${idx}`;
            this._dropdownEntries.set(key, entry);
            const cat = entry.category || 'Misc';
            if (!byCat.has(cat)) byCat.set(cat, []);
            byCat.get(cat).push({ entry, key });
        });
        const orderedCats = [
            ...CATEGORY_ORDER.filter(c => byCat.has(c)),
            ...[...byCat.keys()].filter(c => !CATEGORY_ORDER.includes(c))
        ];
        return orderedCats.map(cat => {
            const items = byCat.get(cat).map(({ entry, key }) => {
                const yearTag = entry.year ? ` (${entry.year})` : '';
                const descTag = entry.desc ? ` — ${entry.desc}` : '';
                const label = `${entry.icon || '💾'} ${entry.name}${yearTag}${descTag}`;
                return `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`;
            }).join('');
            return `<optgroup label="${escapeHtml(cat)}">${items}</optgroup>`;
        }).join('');
    }

    async _fetchLocalLibrary() {
        try {
            const url = new URL('api/trs80-local.php', document.baseURI).toString();
            const res = await fetch(url, { credentials: 'omit' });
            if (!res.ok) return;
            const data = await res.json();
            const entries = Array.isArray(data?.entries) ? data.entries : [];
            if (entries.length === 0) return;
            this._localLibrary = entries.map(e => ({
                name:     typeof e.name === 'string' ? e.name : 'Untitled',
                icon:     typeof e.icon === 'string' ? e.icon : '💾',
                category: typeof e.category === 'string' ? e.category : 'Local Library',
                year:     Number.isInteger(e.year) ? e.year : 0,
                desc:     typeof e.desc === 'string' ? e.desc : '',
                url:      typeof e.url === 'string' ? e.url : '',
            })).filter(e => e.url);
            const select = this.getElement('#trs80GameSelect');
            if (select) {
                const previousValue = select.value;
                const placeholder = '<option value="">— Pick a program —</option>';
                select.innerHTML = placeholder + this._buildDropdownOptionsHTML();
                if (previousValue && [...select.options].some(o => o.value === previousValue)) {
                    select.value = previousValue;
                }
            }
            console.log(`[TRS-80] Loaded ${this._localLibrary.length} local ROM(s).`);
        } catch (err) {
            console.warn('[TRS-80] Local library fetch failed (non-fatal):', err);
        }
    }

    // ── CDN Loader ─────────────────────────────────────────────

    /**
     * Lazy-load the trs80-emulator + trs80-emulator-web + trs80-base
     * packages from esm.sh. Cached on the instance so concurrent callers
     * share one load.
     */
    ensureModulesLoaded() {
        if (this._modules) return Promise.resolve(this._modules);
        if (this._modulesPromise) return this._modulesPromise;
        this.setStatus('Loading TRS-80 emulator engine from CDN…');

        // Hint the browser to start the connection early.
        if (!document.querySelector('link[data-trs80-preconnect="1"]')) {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = 'https://esm.sh';
            link.crossOrigin = 'anonymous';
            link.dataset.trs80Preconnect = '1';
            document.head.appendChild(link);
        }

        this._modulesPromise = (async () => {
            const [emu, web, base] = await Promise.all([
                import(TRS80_EMU_URL),
                import(TRS80_WEB_URL),
                import(TRS80_BASE_URL),
            ]);
            this._modules = { emu, web, base };
            return this._modules;
        })().catch((err) => {
            this._modulesPromise = null; // allow retry
            throw err;
        });
        return this._modulesPromise;
    }

    // ── Core Methods ──────────────────────────────────────────

    async loadGame(url, displayName) {
        await this._startEmulatorWith({
            url: url || '',
            displayName: displayName || (url ? this.getBundleName(url) : 'BASIC (no media)'),
        });
    }

    async loadLocalFile(file) {
        if (!file) return;
        if (this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }
        const blobUrl = URL.createObjectURL(file);
        this.activeBlobUrl = blobUrl;
        await this._startEmulatorWith({
            url: blobUrl,
            displayName: file.name,
            // Hint the format so we don't have to guess by content sniffing.
            extHint: file.name.split('.').pop().toLowerCase(),
        });
    }

    async loadLibraryEntry(entry) {
        if (!entry) return;
        const displayName = entry.name || this.lookupBundleName(entry.url || '');
        if (typeof entry.url === 'string') {
            if (entry.url && !entry.url.startsWith('blob:')) {
                this._pushRecent(entry);
            }
            await this.loadGame(entry.url, displayName);
            return;
        }
        this._showError('Library entry "' + displayName + '" has no url.');
    }

    /**
     * Stop any running instance, build a fresh emulator, fetch the program
     * and dispatch to the right loader (floppy / cassette / cmd).
     * @private
     */
    async _startEmulatorWith({ url, displayName, extHint }) {
        const stage = this.getElement('#trs80Stage');
        const splash = this.getElement('#trs80Splash');
        const loading = this.getElement('#trs80Loading');
        const loadingText = this.getElement('#trs80LoadingText');
        const errorOverlay = this.getElement('#trs80Error');

        if (!stage) return;

        await this.stopEmulator(/* keepSplash= */ false);
        this.playSound('floppy');

        if (splash) splash.style.display = 'none';
        if (stage) stage.style.display = 'block';
        if (errorOverlay) errorOverlay.style.display = 'none';
        if (loading) loading.style.display = 'flex';
        if (loadingText) loadingText.textContent = 'Loading TRS-80 engine…';

        try {
            const { emu, web } = await this.ensureModulesLoaded();
            if (loadingText) loadingText.textContent = 'Booting Z80…';

            // Fresh root <div> per session — same defensive pattern as C64.
            stage.innerHTML = '';
            const root = document.createElement('div');
            root.className = 'trs80-root';
            root.id = `trs80-player-${Date.now()}`;
            stage.appendChild(root);

            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

            this.currentRom = url;
            this.currentRomName = displayName;
            this.isRunning = true;
            this.isReady = false;
            this.updateButtons(true);
            this.setStatus('Starting: ' + displayName);

            // Build the emulator graph.
            const config = emu.Config.makeDefault();
            this._screen = new web.CanvasScreen(root);
            this._keyboard = new web.WebKeyboard();
            // Gate keyboard interception on our window having focus so the
            // TRS-80 doesn't eat keys typed into another app's window.
            this._keyboard.interceptKeys = () => this.isFocused();
            this._cassette = new emu.CassettePlayer();
            this._sound = new web.WebSoundPlayer(false /* not muted */);
            // Capture the AudioContext if WebSoundPlayer exposes it so we
            // can explicitly close it on stop. Different versions surface
            // it under different names — try them all.
            this._audioContext =
                this._sound?.audioCtx ||
                this._sound?.audioContext ||
                this._sound?.context ||
                null;

            this._trs80 = new emu.Trs80(
                config, this._screen, this._keyboard, this._cassette, this._sound
            );
            this._keyboard.configureKeyboard?.();
            this._trs80.reset();
            this._trs80.start();

            // Watchdog: surface a diagnostic if the emulator never makes
            // visible progress in 30 s.
            if (this._readyWatchdog) clearTimeout(this._readyWatchdog);
            this._readyWatchdog = setTimeout(() => {
                if (this.isRunning && !this.isReady) {
                    console.warn('[TRS-80] Emulator did not signal ready in 30s.');
                    this.setStatus('Stuck booting — check the browser console.');
                }
            }, 30000);

            // If the user asked for a real program (URL or blob), fetch it
            // and hand it to the right loader. Empty URL = boot to BASIC.
            if (url) {
                if (loadingText) loadingText.textContent = 'Fetching program…';
                await this._fetchAndLoad(url, displayName, extHint);
            }

            this.isReady = true;
            if (this._readyWatchdog) {
                clearTimeout(this._readyWatchdog);
                this._readyWatchdog = null;
            }
            if (loading) loading.style.display = 'none';
            this.setStatus('Running: ' + displayName);
            this.emitAppEvent('started', { url, name: displayName });
            this.emitAppEvent('ready',   { name: displayName });
        } catch (err) {
            console.error('[TRS-80] Failed to start:', err);
            this._showError(
                'Failed to start TRS-80 emulator',
                [
                    `Reason: ${err?.message || err}`,
                    'Check the browser console for the full stack.',
                ]
            );
            this.setStatus('Error: ' + (err?.message || err));
            this.isRunning = false;
            this.isReady = false;
            this.updateButtons(false);
            this.emitAppEvent('error', { error: err?.message || String(err), url });
        }
    }

    /**
     * Fetch a program URL and dispatch to the right Trs80 loader based on
     * the file extension.
     * @private
     */
    async _fetchAndLoad(url, displayName, extHint) {
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} fetching ${displayName}`);
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        await this._runProgramFromBuffer(buf, extHint || this._extOf(url));
    }

    /**
     * Dispatch a loaded buffer to the right loader on the Trs80 instance.
     * @private
     */
    async _runProgramFromBuffer(buf, ext) {
        if (!this._trs80) throw new Error('Emulator not initialised');
        const lower = (ext || '').toLowerCase();

        // Floppy disk image — preferred on disk-based titles.
        if (FLOPPY_EXTS.has(lower)) {
            const { base } = this._modules;
            const floppy = base.decodeTrs80File
                ? base.decodeTrs80File(buf, { filename: this.currentRomName, disassemble: false })
                : null;
            // decodeTrs80File can return either a FloppyDisk or a typed
            // wrapper. Try both shapes.
            const disk = floppy && floppy.kind === 'floppy' ? floppy
                       : (base.decodeFloppyDisk ? base.decodeFloppyDisk(buf, this.currentRomName) : null);
            if (!disk) throw new Error('Could not decode floppy disk image');
            this._trs80.loadFloppyDisk(disk, 0);
            this._trs80.reset();
            return;
        }

        // Cassette image (.cas) or audio (.wav) — feed to the cassette player.
        if (CASSETTE_EXTS.has(lower)) {
            // The default CassettePlayer is a stub; trs80-cassette-player
            // (separate package) does the real work. For now, surface a
            // clear message — cassette support is a follow-up.
            throw new Error('Cassette playback (.cas/.wav) not wired in this build — use .cmd or .dsk');
        }

        // CMD program — load into memory and run.
        if (PROGRAM_EXTS.has(lower)) {
            const { base } = this._modules;
            // Auto-decode via decodeTrs80File when available.
            const decoded = base.decodeTrs80File
                ? base.decodeTrs80File(buf, { filename: this.currentRomName, disassemble: false })
                : null;
            if (decoded && decoded.kind === 'cmd-program' && this._trs80.runUserProgram) {
                this._trs80.runUserProgram(decoded);
                return;
            }
            // Fall back: try common method names exposed by older versions.
            if (this._trs80.runUserProgram) {
                this._trs80.runUserProgram(buf);
                return;
            }
            throw new Error('CMD loader not exposed by this engine version');
        }

        throw new Error(`Unrecognised file extension "${ext}" — supported: .cmd .dsk .jv1 .jv3 .dmk .bas`);
    }

    /**
     * Stop the running emulator and fully tear down workers, audio, and DOM.
     * Mirrors the aggressive sequence in apps/C64.js — pre-mute, every
     * documented exit/terminate hook, explicitly close every AudioContext
     * we can reach, terminate any reachable Web Workers, drop the DOM,
     * null all our refs.
     *
     * @param {boolean} [keepSplash=true]
     */
    async stopEmulator(keepSplash = true) {
        const stage = this.getElement('#trs80Stage');
        const splash = this.getElement('#trs80Splash');

        if (this._readyWatchdog) {
            clearTimeout(this._readyWatchdog);
            this._readyWatchdog = null;
        }

        // 1. Pre-mute so anything in flight during teardown is silent.
        try { this._sound?.setMuted?.(true); } catch { /* ignore */ }
        try { this._sound?.setVolume?.(0); } catch { /* ignore */ }

        // 2. Stop the Z80. Different library versions expose different
        //    teardown hooks — try every plausible one.
        const stopPaths = [
            () => this._trs80?.stop?.(),
            () => this._trs80?.setRunningState?.(this._modules?.emu?.RunningState?.STOPPED),
            () => this._trs80?.dispose?.(),
            () => this._trs80?.shutdown?.(),
        ];
        for (const fn of stopPaths) {
            try { await Promise.resolve(fn()); } catch { /* ignore */ }
        }

        // 3. Eject any mounted floppies so their handles are released.
        try { this._trs80?.ejectAllFloppyDisks?.(); } catch { /* ignore */ }

        // 4. Explicitly close any AudioContext we captured. WebSoundPlayer
        //    keeps its AudioContext alive otherwise, and the AudioWorklet
        //    will keep producing samples until the GC eventually reaps it.
        const audioCandidates = [
            this._audioContext,
            this._sound?.audioCtx,
            this._sound?.audioContext,
            this._sound?.context,
        ];
        for (const ctx of audioCandidates) {
            if (ctx && typeof ctx.close === 'function' && ctx.state !== 'closed') {
                try { ctx.close(); } catch { /* ignore */ }
            }
        }

        // 5. Pause and unhook any <audio> elements.
        if (stage) {
            for (const a of stage.querySelectorAll('audio')) {
                try { a.pause(); } catch { /* ignore */ }
                try { a.removeAttribute('src'); a.load(); } catch { /* ignore */ }
            }
        }

        // 6. Terminate any Web Workers reachable from the emulator object.
        const workerCandidates = [
            this._sound?.worker,
            this._trs80?.worker,
        ];
        for (const w of workerCandidates) {
            if (w && typeof w.terminate === 'function') {
                try { w.terminate(); } catch { /* ignore */ }
            }
        }

        // 7. Drop the DOM subtree so canvases/audio nodes lose all
        //    references and become GC-eligible.
        if (stage) stage.innerHTML = '';

        if (this.activeBlobUrl && this.currentRom === this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }

        // 8. Null all our refs.
        this._trs80 = null;
        this._screen = null;
        this._keyboard = null;
        this._cassette = null;
        this._sound = null;
        this._audioContext = null;

        this.isRunning = false;
        this.isReady = false;
        this.updateButtons(false);

        if (keepSplash) {
            if (stage) stage.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            this.setStatus('Ready');
        }

        this.emitAppEvent('stopped', {});
    }

    toggleFullscreen(want) {
        const stage = this.getElement('#trs80EmulatorArea');
        if (!stage) return;
        const wantFullscreen = typeof want === 'boolean' ? want : !document.fullscreenElement;
        if (!wantFullscreen) {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            return;
        }
        stage.requestFullscreen().catch(err => {
            console.warn('[TRS-80] Fullscreen request failed:', err);
        });
    }

    setVolume(volume) {
        const v = Math.max(0, Math.min(1, Number(volume) || 0));
        try {
            this._sound?.setVolume?.(v);
        } catch (e) {
            console.warn('[TRS-80] setVolume failed:', e);
        }
    }

    // ── Toolbar Actions ────────────────────────────────────────

    togglePause() {
        if (!this.isRunning) return;
        this._setPaused(!this._paused);
    }

    /** @private */
    _setPaused(want) {
        if (!this.isRunning) return;
        this._paused = !!want;
        try {
            // The trs80 library exposes setRunningState; we toggle between
            // STARTED and PAUSED.
            const RunningState = this._modules?.emu?.RunningState;
            if (RunningState && this._trs80?.setRunningState) {
                this._trs80.setRunningState(this._paused ? RunningState.PAUSED : RunningState.STARTED);
            } else if (this._trs80?.setPaused) {
                this._trs80.setPaused(this._paused);
            }
        } catch (e) {
            console.warn('[TRS-80] pause/resume failed:', e);
        }
        const btn = this.getElement('#trs80PauseBtn');
        if (btn) btn.innerHTML = this._paused ? '▶ Resume' : '⏸ Pause';
        this.setStatus(this._paused ? 'Paused: ' + (this.currentRomName || '') : 'Running: ' + (this.currentRomName || ''));
        this.emitAppEvent(this._paused ? 'paused' : 'resumed', { name: this.currentRomName });
    }

    toggleMute() {
        this._muted = !this._muted;
        if (this._muted) {
            this.setVolume(0);
        } else {
            this.setVolume(this._volumeBeforeMute || 0.5);
        }
        const btn = this.getElement('#trs80MuteBtn');
        if (btn) {
            btn.innerHTML = this._muted ? '🔇' : '🔊';
            btn.title = this._muted ? 'Unmute (M)' : 'Mute (M)';
        }
    }

    async saveState() {
        if (!this.isRunning || !this.isReady) return;
        try {
            // The trs80 emulator exposes save state via Trs80.save().
            // Fall back to a no-op message if the running build doesn't
            // expose it.
            const state = this._trs80?.save?.();
            if (!state) {
                this.setStatus('Save state not supported by this engine build');
                return;
            }
            this._lastSaveState = state;
            const loadBtn = this.getElement('#trs80LoadStateBtn');
            if (loadBtn) loadBtn.disabled = false;
            this.setStatus('State saved (in-memory, this session)');
            this.emitAppEvent('stateSaved', {});
        } catch (e) {
            console.warn('[TRS-80] saveState failed:', e);
            this.setStatus('Save state failed: ' + (e?.message || e));
        }
    }

    async loadState() {
        if (!this.isRunning || !this.isReady) return;
        if (!this._lastSaveState) {
            this.setStatus('No save state in this session yet');
            return;
        }
        try {
            this._trs80?.restore?.(this._lastSaveState);
            this.setStatus('State restored');
            this.emitAppEvent('stateLoaded', {});
        } catch (e) {
            console.warn('[TRS-80] loadState failed:', e);
            this.setStatus('Load state failed: ' + (e?.message || e));
        }
    }

    async resetCurrent() {
        const url = this.currentRom;
        const name = this.currentRomName;
        await this.stopEmulator();
        if (url !== null) await this.loadGame(url, name);
    }

    /** @private */
    _handleShortcut(e) {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === 's') { e.preventDefault(); this.saveState(); return; }
            if (key === 'l') { e.preventDefault(); this.loadState(); return; }
            return;
        }
        if (e.altKey || e.shiftKey) return;
        switch (e.key) {
            case 'Escape':
                if (this.isRunning) { e.preventDefault(); this.stopEmulator(); }
                break;
            case 'p': case 'P':
                if (this.isRunning) { e.preventDefault(); this.togglePause(); }
                break;
            case 'm': case 'M':
                e.preventDefault(); this.toggleMute();
                break;
            case 'r': case 'R':
                if (this.isRunning) { e.preventDefault(); this.resetCurrent(); }
                break;
            case 'f': case 'F':
                e.preventDefault(); this.toggleFullscreen();
                break;
        }
    }

    // ── Recents (persisted to localStorage) ────────────────────

    static get RECENTS_KEY() { return 'trs80.recents.v1'; }
    static get RECENTS_MAX() { return 6; }

    _loadRecents() {
        try {
            const raw = localStorage.getItem(TRS80.RECENTS_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            if (Array.isArray(arr)) {
                this._recents = arr.filter(r => r && typeof r === 'object' &&
                    typeof r.name === 'string' && typeof r.url === 'string')
                    .slice(0, TRS80.RECENTS_MAX);
            }
        } catch { /* ignore */ }
    }

    _saveRecents() {
        try { localStorage.setItem(TRS80.RECENTS_KEY, JSON.stringify(this._recents)); } catch { /* ignore */ }
    }

    _pushRecent(entry) {
        if (!entry || !entry.name) return;
        const key = entry.url || entry.name;
        const trimmed = {
            name: entry.name, icon: entry.icon || '💾',
            url: entry.url, category: entry.category, year: entry.year,
        };
        const idx = this._recents.findIndex(r => (r.url || r.name) === key);
        if (idx !== -1) this._recents.splice(idx, 1);
        this._recents.unshift(trimmed);
        if (this._recents.length > TRS80.RECENTS_MAX) this._recents.length = TRS80.RECENTS_MAX;
        this._saveRecents();
        this._renderRecents();
    }

    _renderRecents() {
        const bar = this.getElement('#trs80Recents');
        if (!bar) return;
        if (this._recents.length === 0) {
            bar.style.display = 'none';
            bar.innerHTML = '';
            return;
        }
        bar.style.display = 'flex';
        const chips = this._recents.map((r, i) => {
            const label = `${r.icon || '💾'} ${r.name}`;
            return `<button class="trs80-recent-chip" data-recent-idx="${i}"
                            title="Re-launch ${escapeHtml(r.name)}">${escapeHtml(label)}</button>`;
        }).join('');
        bar.innerHTML = '<span class="trs80-recents-label">Recent:</span>' + chips;
        for (const chip of bar.querySelectorAll('.trs80-recent-chip')) {
            this.addHandler(chip, 'click', () => {
                const idx = Number(chip.dataset.recentIdx);
                const entry = this._recents[idx];
                if (entry) this.loadLibraryEntry(entry);
            });
        }
    }

    // ── UI Helpers ─────────────────────────────────────────────

    _showLoading(text) {
        const splash = this.getElement('#trs80Splash');
        const stage = this.getElement('#trs80Stage');
        const loading = this.getElement('#trs80Loading');
        const loadingText = this.getElement('#trs80LoadingText');
        const errorOverlay = this.getElement('#trs80Error');
        if (splash) splash.style.display = 'none';
        if (stage) stage.style.display = 'none';
        if (errorOverlay) errorOverlay.style.display = 'none';
        if (loading) loading.style.display = 'flex';
        if (loadingText) loadingText.textContent = text || 'Loading…';
    }

    _showError(title, lines = []) {
        const splash = this.getElement('#trs80Splash');
        const stage = this.getElement('#trs80Stage');
        const loading = this.getElement('#trs80Loading');
        const errorOverlay = this.getElement('#trs80Error');
        const errorTitle = this.getElement('#trs80ErrorTitle');
        const errorBody = this.getElement('#trs80ErrorBody');
        if (splash) splash.style.display = 'none';
        if (stage) stage.style.display = 'none';
        if (loading) loading.style.display = 'none';
        if (!errorOverlay) return;
        if (errorTitle) errorTitle.textContent = title || 'Something went wrong';
        if (errorBody) {
            errorBody.innerHTML = (lines || []).map(line =>
                `<div class="trs80-error-line">${escapeHtml(line)}</div>`
            ).join('');
        }
        errorOverlay.style.display = 'flex';
    }

    setStatus(text) {
        const el = this.getElement('#trs80Status');
        if (el) el.textContent = text;
    }

    updateButtons(running) {
        const stopBtn = this.getElement('#trs80StopBtn');
        const resetBtn = this.getElement('#trs80ResetBtn');
        const pauseBtn = this.getElement('#trs80PauseBtn');
        const saveBtn = this.getElement('#trs80SaveStateBtn');
        const loadBtn = this.getElement('#trs80LoadStateBtn');
        if (stopBtn) stopBtn.disabled = !running;
        if (resetBtn) resetBtn.disabled = !running;
        if (pauseBtn) pauseBtn.disabled = !running;
        if (saveBtn) saveBtn.disabled = !running;
        if (loadBtn) loadBtn.disabled = !running || !this._lastSaveState;
        if (!running) {
            this._paused = false;
            if (pauseBtn) pauseBtn.innerHTML = '⏸ Pause';
        }
    }

    lookupBundleName(url) {
        if (url === '' || url == null) return 'BASIC (no media)';
        const directHit = GAME_LIBRARY.find(g => g.url === url);
        if (directHit) return directHit.name;
        const localHit = this._localLibrary.find(g => g.url === url);
        if (localHit) return localHit.name;
        return this.getBundleName(url);
    }

    getBundleName(url) {
        if (!url) return 'TRS-80';
        if (url.startsWith('blob:')) return 'local file';
        try {
            const parts = new URL(url, document.baseURI).pathname.split('/');
            return parts[parts.length - 1] || url;
        } catch {
            return url;
        }
    }

    /** @private */
    _extOf(url) {
        try {
            const path = url.startsWith('blob:') ? '' : new URL(url, document.baseURI).pathname;
            const m = path.match(/\.([a-z0-9]+)$/i);
            return m ? m[1].toLowerCase() : '';
        } catch {
            return '';
        }
    }
}

export default TRS80;
