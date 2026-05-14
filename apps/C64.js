/**
 * C64 App - Commodore 64 Emulator for IlluminatOS!
 *
 * Run C64 programs and games in the browser via EmulatorJS (the VICE
 * `x64sc` libretro core compiled to WebAssembly via RetroArch's Emscripten
 * build).
 *
 * Engine + assets are loaded from the official EmulatorJS CDN at
 * `cdn.emulatorjs.org` the first time the app is used in a session. No
 * BIOS is required — VICE bundles the necessary ROMs.
 *
 * EmulatorJS is GPL-3.0. We do not redistribute its code; we link to its
 * CDN at runtime exactly like DOSBox links to v8.js-dos.com. If you ever
 * vendor it locally, surface the GPL accordingly.
 *
 * SCRIPTING SUPPORT
 *   Commands: run, runFile, stop, reset, fullscreen, setVolume
 *   Queries:  getState, getLibrary
 *   Events:   app:c64:started, app:c64:ready, app:c64:stopped, app:c64:error
 *
 * RETROSCRIPT EXAMPLES
 *   command c64:run { url: "https://archive.org/download/.../game.d64" }
 *   command c64:stop
 *   command c64:fullscreen
 *   set $state = query c64:getState
 *
 * SUPPORTED FILE FORMATS
 *   .d64 .g64 .nib .crt .prg .t64 .tap .m3u .zip .7z
 *
 * UX
 *   - Library dropdown grouped by category (curated freeware / public-domain).
 *   - Free-form URL field for direct loads of CORS-friendly hosts (Internet
 *     Archive sends `Access-Control-Allow-Origin: *` for direct file URLs).
 *   - Local file picker — Blob URL load, no CORS dance.
 *
 * Why no iframe: same reason DOSBox doesn't iframe js-dos. EmulatorJS
 * renders into a target `<div>` so it can be styled, scoped, and
 * orchestrated by the host page. Iframes would block the scripting bridge
 * and force their own chrome.
 */

import AppBase from './AppBase.js';
import { escapeHtml } from '../core/Sanitize.js';

/** CDN base for EmulatorJS assets (stable channel). */
const EJS_CDN_BASE = 'https://cdn.emulatorjs.org/stable';
const EJS_DATA_PATH = `${EJS_CDN_BASE}/data/`;
const EJS_LOADER_URL = `${EJS_DATA_PATH}loader.js`;

/** Libretro core selector — VICE's accurate C64 core. */
const C64_CORE = 'c64';

/**
 * Curated C64 library — freeware / public-domain / clearly-licensed
 * homebrew, hosted on Internet Archive (which sends permissive CORS for
 * direct downloads). Add entries that have a clean redistribution story;
 * leave commercial ROMs to the user's local files.
 *
 * Each entry: { name, icon, category, year, desc, url }
 */
const GAME_LIBRARY = [
    // === Demoscene (legally released by the authors) ===
    { name: 'Booze Design — Edge of Disgrace', icon: '✨', category: 'Demoscene', year: 2008,
      desc: 'One of the most acclaimed C64 demos ever',
      url: 'https://archive.org/download/c64_demo_edge_of_disgrace/edge_of_disgrace.d64' },
    { name: 'Crest — Deus Ex Machina', icon: '🌀', category: 'Demoscene', year: 2000,
      desc: 'Classic Crest demoscene release',
      url: 'https://archive.org/download/c64_demo_deus_ex_machina/deus_ex_machina.d64' },

    // === Modern homebrew (released as freeware by the authors) ===
    { name: '8-Bit Slicks (Demo)', icon: '🏎️', category: 'Homebrew', year: 2018,
      desc: 'Multiplayer top-down racer — RGCD',
      url: 'https://archive.org/download/c64_homebrew_8bit_slicks/8bit_slicks.d64' },
    { name: 'Aviator Arcade II', icon: '✈️', category: 'Homebrew', year: 2020,
      desc: 'Single-screen biplane shooter',
      url: 'https://archive.org/download/c64_homebrew_aviator_arcade_ii/aviator_arcade_ii.d64' },

    // === Productivity / Tools (BASIC built-in) ===
    { name: 'Commodore BASIC (built-in)', icon: '⌨️', category: 'Tools', year: 1982,
      desc: 'Boot to the famous "READY." prompt',
      url: '' /* empty URL = boot the machine with no media */ },
];

const CATEGORY_ORDER = ['Demoscene', 'Homebrew', 'Tools'];

class C64 extends AppBase {
    constructor() {
        super({
            id: 'c64',
            name: 'Commodore 64',
            icon: '🕹️',
            width: 760,
            height: 600,
            minWidth: 520,
            minHeight: 420,
            resizable: true,
            singleton: true,
            category: 'games'
        });

        this.isRunning = false;
        this.isReady = false;
        this.currentRom = null;
        this.currentRomName = null;
        this.activeBlobUrl = null;
        this._loaderPromise = null;     // CDN preload promise — cached per session
        this._readyWatchdog = null;     // Warns if the emulator never reports ready
        this._configuredScript = null;  // Most recently injected loader script tag

        this.registerCommands();
        this.registerQueries();
    }

    // ── Scripting ──────────────────────────────────────────────

    registerCommands() {
        this.registerCommand('run', (payload) => {
            const url = typeof payload === 'string' ? payload : payload?.url;
            if (url === undefined) return { success: false, error: 'URL required (empty string = BASIC only)' };
            this.loadGame(url, this.lookupBundleName(url));
            return { success: true, url };
        });

        this.registerCommand('stop', async () => {
            await this.stopEmulator();
            return { success: true };
        });

        this.registerCommand('reset', async () => {
            const url = this.currentRom;
            const name = this.currentRomName;
            await this.stopEmulator();
            if (url !== null) this.loadGame(url, name);
            return { success: true };
        });

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
    }

    registerQueries() {
        this.registerQuery('getState', () => ({
            isRunning: this.isRunning,
            isReady: this.isReady,
            currentRom: this.currentRom,
            currentRomName: this.currentRomName
        }));

        this.registerQuery('getLibrary', () =>
            GAME_LIBRARY.map(g => ({
                name: g.name, url: g.url, desc: g.desc, icon: g.icon, category: g.category
            }))
        );
    }

    // ── Lifecycle ──────────────────────────────────────────────

    onOpen() {
        const byCat = new Map();
        for (const game of GAME_LIBRARY) {
            if (!byCat.has(game.category)) byCat.set(game.category, []);
            byCat.get(game.category).push(game);
        }
        const orderedCats = [
            ...CATEGORY_ORDER.filter(c => byCat.has(c)),
            ...[...byCat.keys()].filter(c => !CATEGORY_ORDER.includes(c))
        ];
        const dropdownOptions = orderedCats.map(cat => {
            const items = byCat.get(cat).map(game => {
                const label = `${game.icon} ${game.name} (${game.year}) — ${game.desc}`;
                // Encode an empty URL as the literal `__BASIC__` sentinel so
                // the dropdown can distinguish "user picked BASIC" from
                // "user picked nothing".
                const value = game.url === '' ? '__BASIC__' : game.url;
                return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
            }).join('');
            return `<optgroup label="${escapeHtml(cat)}">${items}</optgroup>`;
        }).join('');

        return `
            <div class="c64-app">
                <div class="c64-toolbar">
                    <div class="c64-bar">
                        <label class="c64-label">Disk:</label>
                        <select class="c64-select" id="c64GameSelect" title="Pick a program">
                            <option value="">— Pick a program —</option>
                            ${dropdownOptions}
                        </select>
                    </div>
                    <div class="c64-buttons">
                        <button class="c64-btn" id="c64StopBtn" title="Stop emulator" disabled>⏹ Stop</button>
                        <button class="c64-btn" id="c64ResetBtn" title="Reload current disk" disabled>🔄 Reset</button>
                        <button class="c64-btn" id="c64FsBtn" title="Toggle fullscreen">⛶ Fullscreen</button>
                    </div>
                </div>
                <div class="c64-toolbar c64-toolbar-sub">
                    <div class="c64-bar">
                        <label class="c64-label">URL:</label>
                        <input type="text" class="c64-input" id="c64UrlInput"
                               placeholder="https://archive.org/download/.../your-game.d64"
                               spellcheck="false" />
                        <button class="c64-btn" id="c64RunBtn" title="Load & run this URL">▶ Run URL</button>
                        <button class="c64-btn" id="c64FileBtn" title="Open a local disk image">📂 File…</button>
                        <input type="file" id="c64FileInput"
                               accept=".d64,.g64,.nib,.crt,.prg,.t64,.tap,.m3u,.zip,.7z"
                               style="display:none;" />
                    </div>
                </div>
                <div class="c64-emulator-area" id="c64EmulatorArea">
                    <div class="c64-splash" id="c64Splash">
                        <div class="c64-splash-screen">
                            <div class="c64-splash-banner">
                                **** COMMODORE 64 BASIC V2 ****<br>
                                64K RAM SYSTEM&nbsp;&nbsp;38911 BASIC BYTES FREE<br>
                                <br>
                                READY.<br>
                                <span class="c64-cursor">█</span>
                            </div>
                        </div>
                        <div class="c64-splash-hint">
                            Pick a disk from the <b>Disk</b> dropdown, paste a <code>.d64</code> /
                            <code>.prg</code> / <code>.crt</code> URL, or click <b>File…</b> to load
                            from your computer.<br>
                            <span class="c64-splash-credit">Powered by <b>EmulatorJS</b> / <b>VICE</b> — WebAssembly.</span>
                        </div>
                    </div>
                    <div class="c64-stage" id="c64Stage" style="display:none;"></div>
                    <div class="c64-loading" id="c64Loading" style="display:none;">
                        <div class="c64-loading-spinner"></div>
                        <div class="c64-loading-text" id="c64LoadingText">Loading VICE…</div>
                    </div>
                </div>
                <div class="c64-status" id="c64Status">Ready</div>
            </div>
        `;
    }

    onMount() {
        const gameSelect = this.getElement('#c64GameSelect');
        const urlInput = this.getElement('#c64UrlInput');
        const runBtn = this.getElement('#c64RunBtn');
        const fileBtn = this.getElement('#c64FileBtn');
        const fileInput = this.getElement('#c64FileInput');
        const stopBtn = this.getElement('#c64StopBtn');
        const resetBtn = this.getElement('#c64ResetBtn');
        const fsBtn = this.getElement('#c64FsBtn');

        this.addHandler(gameSelect, 'change', (e) => {
            const value = e.target.value;
            if (!value) return;
            // The dropdown encodes "boot to BASIC" as __BASIC__ so we can
            // tell it apart from "no selection".
            const url = value === '__BASIC__' ? '' : value;
            if (urlInput) urlInput.value = url;
            this.loadGame(url, this.lookupBundleName(url));
        });

        this.addHandler(runBtn, 'click', () => {
            const url = urlInput?.value?.trim() ?? '';
            this.loadGame(url, this.lookupBundleName(url));
        });

        this.addHandler(urlInput, 'keydown', (e) => {
            if (e.key === 'Enter') {
                const url = urlInput.value.trim();
                this.loadGame(url, this.lookupBundleName(url));
            }
        });

        this.addHandler(fileBtn, 'click', () => fileInput?.click());
        this.addHandler(fileInput, 'change', (e) => {
            const file = e.target.files?.[0];
            if (file) this.loadLocalFile(file);
            e.target.value = ''; // allow re-selecting the same file
        });

        this.addHandler(stopBtn, 'click', () => this.stopEmulator());
        this.addHandler(resetBtn, 'click', () => {
            const url = this.currentRom;
            const name = this.currentRomName;
            this.stopEmulator().then(() => { if (url !== null) this.loadGame(url, name); });
        });
        this.addHandler(fsBtn, 'click', () => this.toggleFullscreen());

        // Preload the EmulatorJS loader script in the background so the
        // first user-initiated launch is faster.
        this.ensureLoaderPreloaded().catch((err) => {
            console.warn('[C64] Background loader preload failed:', err);
        });
    }

    onClose() {
        this.stopEmulator();
        if (this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }
    }

    onResize() {
        // EmulatorJS uses ResizeObserver internally — no action needed.
    }

    // ── CDN Loader ─────────────────────────────────────────────

    /**
     * EmulatorJS lazy-loads its assets when `loader.js` first runs in a
     * page that has the `EJS_*` globals set. We can't usefully preload
     * the rest until we know the core (`EJS_core`) — so this "preload"
     * is really just a DNS/handshake warmup hint via a `<link rel=
     * preconnect>` to the CDN. Cheap and safe.
     *
     * The actual `<script src="loader.js">` injection happens per game
     * launch in `_executeLoader()` because EmulatorJS reads the globals
     * at script-execute time.
     */
    ensureLoaderPreloaded() {
        if (this._loaderPromise) return this._loaderPromise;
        this._loaderPromise = new Promise((resolve) => {
            if (!document.querySelector('link[data-c64-preconnect="1"]')) {
                const link = document.createElement('link');
                link.rel = 'preconnect';
                link.href = 'https://cdn.emulatorjs.org';
                link.crossOrigin = 'anonymous';
                link.dataset.c64Preconnect = '1';
                document.head.appendChild(link);
            }
            resolve();
        });
        return this._loaderPromise;
    }

    // ── Core Methods ──────────────────────────────────────────

    /**
     * Load and run a program at a URL. An empty URL boots the machine
     * with no media (you get the BASIC prompt).
     * @param {string} url
     * @param {string} [displayName]
     */
    async loadGame(url, displayName) {
        await this._startEmulatorWith({
            url: url || '',
            displayName: displayName || (url ? this.getBundleName(url) : 'BASIC (no disk)')
        });
    }

    /**
     * Load a local disk image via Blob URL — avoids CORS entirely.
     * @param {File} file
     */
    async loadLocalFile(file) {
        if (!file) return;
        if (this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }
        const blobUrl = URL.createObjectURL(file);
        this.activeBlobUrl = blobUrl;
        await this._startEmulatorWith({ url: blobUrl, displayName: file.name });
    }

    /**
     * Stop any running instance, then start a fresh one with the given URL.
     * @private
     */
    async _startEmulatorWith({ url, displayName }) {
        const stage = this.getElement('#c64Stage');
        const splash = this.getElement('#c64Splash');
        const loading = this.getElement('#c64Loading');
        const loadingText = this.getElement('#c64LoadingText');

        if (!stage) return;

        await this.stopEmulator(/* keepSplash= */ false);
        this.playSound('floppy');

        if (splash) splash.style.display = 'none';
        if (stage) stage.style.display = 'block';
        if (loading) loading.style.display = 'flex';
        if (loadingText) loadingText.textContent = 'Fetching VICE core…';

        try {
            await this.ensureLoaderPreloaded();

            // Fresh root div per session. EmulatorJS attaches a lot of
            // internal state to its player target; re-using the same div
            // across launches is fragile.
            stage.innerHTML = '';
            const root = document.createElement('div');
            root.className = 'c64-root';
            root.id = `c64-player-${Date.now()}`;
            stage.appendChild(root);

            // Let the browser compute layout so the container has
            // dimensions before EmulatorJS creates its canvas.
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

            this.currentRom = url;
            this.currentRomName = displayName;
            this.isRunning = true;
            this.isReady = false;
            this.updateButtons(true);
            this.setStatus('Starting: ' + displayName);

            if (loadingText) loadingText.textContent = 'Booting C64…';

            // Watchdog — if the emulator never signals ready in 60 s,
            // surface a diagnostic.
            if (this._readyWatchdog) clearTimeout(this._readyWatchdog);
            this._readyWatchdog = setTimeout(() => {
                if (this.isRunning && !this.isReady) {
                    console.warn('[C64] Emulator did not reach ready state in 60s.');
                    this.setStatus('Stuck booting — check the browser console.');
                }
            }, 60000);

            // Configure EmulatorJS via globals + inject loader.js. The
            // loader reads `window.EJS_*` at script-execute time.
            this._configureEmulatorJSGlobals({
                playerSelector: `#${root.id}`,
                gameUrl: url,
                gameName: displayName,
                onReady: () => this._handleEmulatorReady()
            });

            await this._executeLoader();

            if (loading) loading.style.display = 'none';

            this.emitAppEvent('started', { url, name: displayName });
        } catch (err) {
            console.error('[C64] Failed to start emulator:', err);
            this.setStatus('Error: ' + (err?.message || err));
            if (loading) loading.style.display = 'none';
            if (stage) stage.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            this.isRunning = false;
            this.isReady = false;
            this.updateButtons(false);
            this.emitAppEvent('error', { error: err?.message || String(err), url });
        }
    }

    /**
     * Set EmulatorJS configuration globals. EmulatorJS reads these from
     * `window` when `loader.js` executes — there is no constructor we can
     * call directly with options.
     * @private
     */
    _configureEmulatorJSGlobals({ playerSelector, gameUrl, gameName, onReady }) {
        // Tear down the previous instance if EmulatorJS hung one on
        // window. `EJS_terminate` is the documented teardown hook; we
        // also blank out the singleton handle just to be safe before
        // the loader re-instantiates.
        try {
            if (typeof window.EJS_terminate === 'function') {
                window.EJS_terminate();
            }
        } catch (e) {
            console.warn('[C64] EJS_terminate threw:', e);
        }
        try { delete window.EJS_emulator; } catch { /* non-configurable, ignore */ }

        window.EJS_player = playerSelector;
        window.EJS_core = C64_CORE;
        window.EJS_pathtodata = EJS_DATA_PATH;
        window.EJS_gameUrl = gameUrl || ''; // empty = boot machine, no media
        window.EJS_gameName = gameName || 'Commodore 64';
        window.EJS_startOnLoaded = true;
        window.EJS_volume = 0.5;
        // Win95-ish accent (a muted navy that sits comfortably with the
        // grey chrome). EmulatorJS uses this for its inner buttons / menus.
        window.EJS_color = '#1084d0';
        // Tell EmulatorJS to stop spamming the console with its boot log
        // unless we're explicitly debugging.
        window.EJS_DEBUG_XX = false;
        // ready callback
        window.EJS_ready = onReady;
        window.EJS_onGameStart = () => this._handleGameStart();
    }

    /**
     * Inject (or re-inject) the loader script. EmulatorJS's loader
     * initialises on script-execute, so swapping games means a fresh
     * script tag with a unique URL suffix to defeat the browser's
     * "already loaded this script" optimisation.
     * @private
     */
    _executeLoader() {
        return new Promise((resolve, reject) => {
            // Remove the previous loader tag if we injected one — keeps
            // the DOM clean and avoids stale handler references.
            if (this._configuredScript && this._configuredScript.parentNode) {
                this._configuredScript.parentNode.removeChild(this._configuredScript);
                this._configuredScript = null;
            }

            const script = document.createElement('script');
            // Cache-bust the URL per launch so the browser actually
            // re-executes loader.js with the new globals. The CDN
            // ignores unknown query params, so we still hit the edge
            // cache for the bytes themselves.
            script.src = `${EJS_LOADER_URL}?_=${Date.now()}`;
            script.async = true;
            script.dataset.c64Loader = '1';
            script.onload = () => resolve();
            script.onerror = () => {
                reject(new Error('Failed to fetch EmulatorJS loader from ' + EJS_LOADER_URL));
            };
            this._configuredScript = script;
            document.head.appendChild(script);
        });
    }

    /** @private */
    _handleEmulatorReady() {
        this.isReady = true;
        if (this._readyWatchdog) {
            clearTimeout(this._readyWatchdog);
            this._readyWatchdog = null;
        }
        this.setStatus('Running: ' + (this.currentRomName || 'C64'));
        this.emitAppEvent('ready', { name: this.currentRomName });
    }

    /** @private */
    _handleGameStart() {
        this.emitAppEvent('play', { name: this.currentRomName });
    }

    /**
     * Stop the running emulator and fully tear down workers, audio, and DOM.
     * @param {boolean} [keepSplash=true] - If false, caller will swap content immediately.
     */
    async stopEmulator(keepSplash = true) {
        const stage = this.getElement('#c64Stage');
        const splash = this.getElement('#c64Splash');

        if (this._readyWatchdog) {
            clearTimeout(this._readyWatchdog);
            this._readyWatchdog = null;
        }

        try {
            if (typeof window.EJS_terminate === 'function') {
                window.EJS_terminate();
            } else if (window.EJS_emulator && typeof window.EJS_emulator.exit === 'function') {
                window.EJS_emulator.exit();
            }
        } catch (e) {
            console.warn('[C64] Error during emulator teardown:', e);
        }
        try { delete window.EJS_emulator; } catch { /* ignore */ }

        // Drop the entire DOM subtree so canvases / audio nodes get GC'd.
        if (stage) stage.innerHTML = '';

        if (this.activeBlobUrl && this.currentRom === this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }

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

    /**
     * Toggle fullscreen on the emulator stage.
     * @param {boolean} [want]
     */
    toggleFullscreen(want) {
        const stage = this.getElement('#c64EmulatorArea');
        if (!stage) return;

        const wantFullscreen = typeof want === 'boolean' ? want : !document.fullscreenElement;

        if (!wantFullscreen) {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
            return;
        }

        stage.requestFullscreen().catch(err => {
            console.warn('[C64] Fullscreen request failed:', err);
        });
    }

    /**
     * Set audio volume (0-1). EmulatorJS exposes a per-instance volume API.
     * @param {number} volume
     */
    setVolume(volume) {
        const v = Math.max(0, Math.min(1, Number(volume) || 0));
        try {
            if (window.EJS_emulator?.setVolume) {
                window.EJS_emulator.setVolume(v);
            }
        } catch (e) {
            console.warn('[C64] setVolume failed:', e);
        }
    }

    // ── Helpers ────────────────────────────────────────────────

    setStatus(text) {
        const el = this.getElement('#c64Status');
        if (el) el.textContent = text;
    }

    updateButtons(running) {
        const stopBtn = this.getElement('#c64StopBtn');
        const resetBtn = this.getElement('#c64ResetBtn');
        if (stopBtn) stopBtn.disabled = !running;
        if (resetBtn) resetBtn.disabled = !running;
    }

    /**
     * Look up a curated library entry by URL and return its display name,
     * or fall back to a name derived from the URL itself.
     */
    lookupBundleName(url) {
        if (url === '' || url == null) return 'BASIC (no disk)';
        const lib = GAME_LIBRARY.find(g => g.url === url);
        if (lib) return lib.name;
        return this.getBundleName(url);
    }

    getBundleName(url) {
        if (!url) return 'C64';
        if (url.startsWith('blob:')) return 'local file';
        try {
            const parts = new URL(url).pathname.split('/');
            return parts[parts.length - 1] || url;
        } catch {
            return url;
        }
    }
}

export default C64;
