/**
 * TRS-80 App - Tandy/Radio Shack TRS-80 Emulator for IlluminatOS!
 *
 * Runs Z80-based TRS-80 Model III software (.cmd / .cas / .bas / .dsk /
 * .jv1 / .jv3 / .dmk) in the browser via Lawrence Kesteloot's
 * `trs80-emulator` packages, lazy-loaded from the esm.sh CDN.
 *
 * Engine packages (all MIT, pinned to one exact version):
 *   - trs80-emulator      Z80 + TRS-80 Model III hardware (Config, Trs80, …)
 *   - trs80-emulator-web  CanvasScreen, WebKeyboard, WebSoundPlayer
 *   - trs80-base          file-format decoders (decodeTrs80File, …)
 *
 * GAME / SOFTWARE LIBRARY (mirrors apps/DOSBox.js + apps/C64.js)
 *   - A curated dropdown of classic TRS-80 titles resolved on demand from
 *     the Internet Archive (`iaSearch` Lucene query → metadata API → file).
 *   - A free-form URL field + local File… picker for any image.
 *   - Host-uploaded ROMs from `assets/trs80/local/` (api/trs80-local.php).
 *   - Internet Archive downloads stream through the IlluminatOS CORS proxy
 *     at `api/trs80-proxy.php` (archive.org's CORS posture is inconsistent
 *     for third-party embeds) — exactly the api/c64-proxy.php pattern.
 *   - Recently-played chips persisted in localStorage.
 *
 * SCRIPTING SUPPORT
 *   Commands: run, stop, reset, fullscreen, setVolume, pause, resume,
 *             mute, unmute
 *   Queries:  getState, getLibrary
 *   Events:   app:trs80:started, app:trs80:ready, app:trs80:stopped,
 *             app:trs80:error, app:trs80:paused, app:trs80:resumed
 *
 * License posture matches the C64 / DOSBox apps: we link to the
 * trs80-emulator CDN (MIT) and to public preservation archives. We do not
 * redistribute commercial software.
 */

import AppBase from './AppBase.js';
import { escapeHtml } from '../core/Sanitize.js';

/**
 * CDN URLs for the lkesteloot/trs80 packages. esm.sh transparently serves
 * the published ES modules and resolves their dependency graph (z80-emulator,
 * strongly-typed-events, etc.) for us.
 *
 * Pinned to one EXACT version so a future incompatible release can't break
 * our usage and so esm.sh never loads two copies of a shared dependency.
 * Bump deliberately and re-test against the real API surface.
 */
const TRS80_PKG_VERSION = '2.3.1';
/**
 * esm.sh URLs with `?bundle` so the CDN inlines transitive deps (z80-emulator,
 * strongly-typed-events, base64-js, etc.) into one module. Without ?bundle,
 * esm.sh emits import statements that resolve to its `/stable/` paths — any
 * one of which can fail with an opaque error and bring the whole load down
 * with no useful diagnostics. Bundling is slightly more bytes but FAR more
 * reliable for legacy (now-deprecated on npm) packages like this one.
 */
const TRS80_EMU_URL  = `https://esm.sh/trs80-emulator@${TRS80_PKG_VERSION}?bundle`;
const TRS80_WEB_URL  = `https://esm.sh/trs80-emulator-web@${TRS80_PKG_VERSION}?bundle`;
const TRS80_BASE_URL = `https://esm.sh/trs80-base@${TRS80_PKG_VERSION}?bundle`;

/** Internal pixel scale of the CanvasScreen bitmap (CSS scales it to fit). */
const SCREEN_SCALE = 2;

/** File extensions the emulator can decode — used for the File… picker. */
const SUPPORTED_EXTS = '.cmd,.bas,.cas,.dsk,.jv1,.jv3,.dmk';

/**
 * Hosts whose responses send permissive CORS to third-party origins, so the
 * browser can fetch them directly without the proxy.
 */
const CORS_FRIENDLY_HOSTS = new Set([
    'raw.githubusercontent.com',
]);

/**
 * Hosts the `api/trs80-proxy.php` CORS proxy is configured to fetch from.
 * Must stay in sync with the `$allowed_hosts` list in api/trs80-proxy.php.
 * archive.org also serves files from numbered ia######.us.archive.org
 * subdomains, matched by suffix below.
 */
const PROXY_HOSTS = new Set([
    'archive.org',
]);

/**
 * File extensions to prefer when resolving an Internet Archive item to a
 * single downloadable file. Native disk images first, then memory-image
 * programs, then cassette/Basic. `.zip` is intentionally absent — the
 * lkesteloot emulator decodes raw images, it does not unzip archives.
 */
const IA_PREFERRED_EXTS = ['.dsk', '.dmk', '.jv1', '.jv3', '.cmd', '.cas', '.bas'];

/**
 * Curated TRS-80 library.
 *
 * Every entry past the "boot to BASIC" one is resolved on demand from the
 * Internet Archive via an `iaSearch` Lucene query — the same mechanism the
 * C64 app uses. The titles below are TRS-80-defining works (Big Five
 * Software's arcade games, Tandy first-party adventures, etc.) that are
 * effectively platform-exclusive, so a `title:"…" AND mediatype:software`
 * search resolves to the TRS-80 item rather than a port.
 *
 * Each entry: { name, icon, category, year, desc, url? | iaItem? | iaSearch? }
 *   - `url`:      Direct download URL, or '' to boot the bare machine.
 *   - `iaItem`:   Explicit Internet Archive item identifier.
 *   - `iaSearch`: Lucene query — resolved to an item at runtime, cached.
 *
 * Legality posture: we link to public preservation archives; we do not
 * redistribute software. Load anything else from a URL or the File… button.
 */
const GAME_LIBRARY = [
    { name: 'TRS-80 Model III BASIC', icon: '⌨️', category: 'System', year: 1980,
      desc: 'Boot to Level II BASIC — empty machine',
      url: '' /* empty URL = boot machine with no media */ },

    // === Arcade — Big Five Software (TRS-80 arcade legends) ===
    { name: 'Robot Attack', icon: '🤖', category: 'Arcade', year: 1981,
      desc: 'Big Five — robot shoot-out with voice synthesis',
      iaSearch: 'title:"Robot Attack" AND mediatype:software' },
    { name: 'Defense Command', icon: '🛡️', category: 'Arcade', year: 1981,
      desc: 'Big Five — Defender-style planetary defense',
      iaSearch: 'title:"Defense Command" AND mediatype:software' },
    { name: 'Cosmic Fighter', icon: '🚀', category: 'Arcade', year: 1980,
      desc: 'Big Five — wave-based space shooter',
      iaSearch: 'title:"Cosmic Fighter" AND mediatype:software' },
    { name: 'Galaxy Invasion', icon: '👾', category: 'Arcade', year: 1980,
      desc: 'Big Five — Galaxian-style alien attack',
      iaSearch: 'title:"Galaxy Invasion" AND mediatype:software' },
    { name: 'Attack Force', icon: '🛸', category: 'Arcade', year: 1981,
      desc: 'Big Five — ram the alien ships in a maze',
      iaSearch: 'title:"Attack Force" AND mediatype:software' },
    { name: 'Meteor Mission II', icon: '🌠', category: 'Arcade', year: 1981,
      desc: 'Big Five — rescue stranded astronauts',
      iaSearch: 'title:"Meteor Mission" AND mediatype:software' },
    { name: 'Stellar Escort', icon: '⭐', category: 'Arcade', year: 1982,
      desc: 'Big Five — scrolling starfield shooter',
      iaSearch: 'title:"Stellar Escort" AND mediatype:software' },
    { name: 'Super Nova', icon: '💥', category: 'Arcade', year: 1980,
      desc: 'Big Five — Asteroids-style rock blaster',
      iaSearch: 'title:"Super Nova" AND mediatype:software' },

    // === Action ===
    { name: 'Sea Dragon', icon: '🐉', category: 'Action', year: 1982,
      desc: 'Adventure International — submarine cavern run',
      iaSearch: 'title:"Sea Dragon" AND mediatype:software' },
    { name: 'Scarfman', icon: '👻', category: 'Action', year: 1981,
      desc: 'The Cornsoft Group — TRS-80 maze-muncher',
      iaSearch: 'title:"Scarfman" AND mediatype:software' },
    { name: 'Android Nim', icon: '🟢', category: 'Action', year: 1978,
      desc: 'The classic Nim with marching androids',
      iaSearch: 'title:"Android Nim" AND mediatype:software' },
    { name: 'Weerd', icon: '🟣', category: 'Action', year: 1982,
      desc: 'Multi-stage arcade action',
      iaSearch: 'title:"Weerd" AND mediatype:software' },

    // === Adventure — Tandy first-party text adventures ===
    { name: 'Raaka-Tu', icon: '🗿', category: 'Adventure', year: 1981,
      desc: 'Tandy — curse of the temple text adventure',
      iaSearch: 'title:"Raaka-Tu" AND mediatype:software' },
    { name: 'Madness and the Minotaur', icon: '🐂', category: 'Adventure', year: 1981,
      desc: 'Tandy — labyrinth text-and-graphics adventure',
      iaSearch: 'title:"Madness and the Minotaur" AND mediatype:software' },
    { name: 'Bedlam', icon: '🏚️', category: 'Adventure', year: 1982,
      desc: 'Tandy — escape the lunatic asylum',
      iaSearch: 'title:"Bedlam" AND mediatype:software AND year:[1980 TO 1985]' },

    // === Tools / Toys ===
    { name: 'Dancing Demon', icon: '🕺', category: 'Tools', year: 1979,
      desc: 'Tandy — animated dancing / choreography toy',
      iaSearch: 'title:"Dancing Demon" AND mediatype:software' },
];

const CATEGORY_ORDER = [
    'Local Library',  // host-uploaded ROMs from assets/trs80/local/
    'System',
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
        this._modules = null;           // { emu, web, base, WebSoundPlayerClass } once loaded
        this._trs80 = null;             // live Trs80 instance (fresh per launch)
        this._screen = null;            // CanvasScreen (fresh per launch)
        this._cassette = null;          // CassettePlayer stub (fresh per launch)
        this._keyboard = null;          // WebKeyboard — created ONCE, reused (see _ensureKeyboard)
        this._sound = null;             // SoundPlayer  — created ONCE, reused (see _ensureSound)
        this._localLibrary = [];        // host-uploaded ROMs from assets/trs80/local/
        this._dropdownEntries = new Map(); // option value → entry (rebuilt on local load)
        this._iaUrlCache = new Map();      // IA query / item ID → resolved value
        this._iaResolveInFlight = new Map(); // IA key → in-flight Promise (dedupes)
        this._loadGeneration = 0;       // bumped on every load — cancels stale IA resolves
        this._paused = false;
        this._muted = false;
        this._recents = [];
        this._pagehideHandler = null;

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
        this.registerCommand('stop',   async () => { await this.stopEmulator(); return { success: true }; });
        this.registerCommand('reset',  async () => { await this.resetCurrent();  return { success: true }; });
        this.registerCommand('pause',      () => { this._setPaused(true);  return { success: true }; });
        this.registerCommand('resume',     () => { this._setPaused(false); return { success: true }; });
        this.registerCommand('mute',       () => { this._setMuted(true);   return { success: true }; });
        this.registerCommand('unmute',     () => { this._setMuted(false);  return { success: true }; });
        this.registerCommand('fullscreen', (payload) => {
            const want = payload?.value;
            this.toggleFullscreen(typeof want === 'boolean' ? want : undefined);
            return { success: true };
        });
        this.registerCommand('setVolume', (payload) => {
            const volume = payload?.volume ?? payload?.value;
            if (volume === undefined) return { success: false, error: 'Volume required (0-1)' };
            // The TRS-80 sound player is on/off only — treat >0 as unmuted.
            this._setMuted(Number(volume) <= 0);
            return { success: true, volume: Number(volume) };
        });
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
            desc: g.desc, url: g.url, iaItem: g.iaItem, iaSearch: g.iaSearch,
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
                        <button class="trs80-btn" id="trs80PauseBtn" title="Pause / resume" disabled>⏸ Pause</button>
                        <button class="trs80-btn" id="trs80MuteBtn" title="Mute / unmute">🔊</button>
                        <button class="trs80-btn" id="trs80StopBtn" title="Stop emulator (Esc)" disabled>⏹ Stop</button>
                        <button class="trs80-btn" id="trs80ResetBtn" title="Reload current program" disabled>🔄 Reset</button>
                        <button class="trs80-btn" id="trs80FsBtn" title="Toggle fullscreen">⛶ Fullscreen</button>
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
                        <input type="file" id="trs80FileInput" accept="${SUPPORTED_EXTS}" style="display:none;" />
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
                            The <b>Program</b> dropdown has classic TRS-80 titles resolved on
                            demand from the Internet Archive, plus any ROMs the host dropped
                            into <code>assets/trs80/local/</code>. Or paste a <code>.cmd</code>
                            / <code>.dsk</code> / <code>.cas</code> URL, or click <b>File…</b>
                            for a local image.<br>
                            <span class="trs80-splash-keys">Press <b>Esc</b> to stop. Use the toolbar for pause / mute / reset / fullscreen.</span><br>
                            <span class="trs80-splash-credit">Powered by <b>trs80-emulator</b> (Lawrence Kesteloot, MIT) — a Z80 TRS-80 Model III in JavaScript.</span>
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
                            <a class="trs80-btn trs80-error-link" id="trs80ErrorSearch"
                               href="https://archive.org/search?query=trs-80"
                               target="_blank" rel="noopener" style="display:none;">
                                🔍 Search Internet Archive
                            </a>
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
        this.addHandler(muteBtn, 'click', () => this._setMuted(!this._muted));

        const errorDismiss = this.getElement('#trs80ErrorDismiss');
        this.addHandler(errorDismiss, 'click', () => {
            const splash = this.getElement('#trs80Splash');
            const errorOverlay = this.getElement('#trs80Error');
            if (errorOverlay) errorOverlay.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            if (gameSelect) gameSelect.value = '';
            this.setStatus('Ready');
        });

        // Esc stops the emulator. Single-letter shortcuts are deliberately
        // omitted: the trs80-emulator WebKeyboard captures keystrokes at
        // document.body level while running, so a global "P"/"R" shortcut
        // would also be typed into the running program. Gated on
        // isFocused() and skipped while typing in a form field.
        this.addHandler(document, 'keydown', (e) => {
            if (!this.isFocused()) return;
            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (e.key === 'Escape' && this.isRunning) {
                e.preventDefault();
                this.stopEmulator();
            }
        });

        // Tab close / page navigate: kill audio + emulator cleanly.
        this._pagehideHandler = () => {
            try { this.stopEmulator(); } catch { /* ignore */ }
        };
        window.addEventListener('pagehide', this._pagehideHandler);

        this._loadRecents();
        this._renderRecents();

        // Background warmup of the CDN bundles so the first launch is faster.
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

    onFocus() {
        // Re-arm keyboard interception when our window regains focus, so a
        // running program keeps receiving keystrokes after an app switch.
        if (this.isRunning && !this._paused && this._keyboard) {
            this._keyboard.interceptKeys = true;
        }
    }

    onBlur() {
        // Stop eating keystrokes the moment another app takes focus —
        // WebKeyboard listens on document.body, so this gate is essential.
        if (this._keyboard) this._keyboard.interceptKeys = false;
    }

    onResize() {
        // CanvasScreen renders to a fixed-size bitmap; CSS object-fit scales
        // it to the stage. Nothing to recompute on resize.
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
     * packages from esm.sh. The WebSoundPlayer is deep-imported separately
     * (it isn't re-exported from the web package index); failure there is
     * non-fatal — we fall back to SilentSoundPlayer. Cached on the instance
     * so concurrent callers share one load.
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
            // Import each package separately so a failure tells us WHICH
            // package broke instead of a generic Promise.all rejection that
            // can come back with an empty message and leave the user staring
            // at "Failed to start:".
            const safeImport = async (url, label) => {
                try {
                    return await import(url);
                } catch (err) {
                    const msg = err?.message || String(err) || 'unknown error';
                    throw new Error(`Failed to load ${label} from ${url}: ${msg}`);
                }
            };
            const emu  = await safeImport(TRS80_EMU_URL,  'trs80-emulator');
            const web  = await safeImport(TRS80_WEB_URL,  'trs80-emulator-web');
            const base = await safeImport(TRS80_BASE_URL, 'trs80-base');

            // WebSoundPlayer is re-exported from the trs80-emulator-web index
            // (verified against the v2.3.1 source). If a future build drops
            // it, we fall back to SilentSoundPlayer — the emulator still
            // runs, just silent.
            const WebSoundPlayerClass = web?.WebSoundPlayer || null;
            if (!WebSoundPlayerClass) {
                console.warn('[TRS-80] WebSoundPlayer not found in trs80-emulator-web — running silent.');
            }
            this._modules = { emu, web, base, WebSoundPlayerClass };
            return this._modules;
        })().catch((err) => {
            this._modulesPromise = null; // allow retry
            throw err;
        });
        return this._modulesPromise;
    }

    /**
     * Stringify an unknown error value for user-facing messages. The catch
     * block in `_startEmulatorWith` used to do `err?.message || err` and
     * render `Error: ` (empty trailing) when something threw `''`, null,
     * undefined, or a plain string. This handles all of those.
     * @private
     */
    _errToText(err) {
        if (err == null) return 'Unknown error (no detail available)';
        if (typeof err === 'string') return err || 'Unknown error (empty)';
        if (err.message) return err.message;
        if (err.stack)   return String(err.stack).split('\n')[0];
        try { return JSON.stringify(err); } catch { return String(err); }
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
        await this._startEmulatorWith({ url: blobUrl, displayName: file.name });
    }

    /**
     * Launch a curated / recents library entry. Entries carry either a
     * direct `url`, an `iaItem` identifier, or an `iaSearch` Lucene query
     * that is resolved against the Internet Archive at runtime.
     */
    async loadLibraryEntry(entry) {
        if (!entry) return;
        const displayName = entry.name || this.lookupBundleName(entry.url || '');

        // Direct URL (including '' for "boot to BASIC") wins.
        if (typeof entry.url === 'string') {
            // Skip recents for the BASIC entry (no media) and blob URLs
            // (they don't survive a session — re-launching would 404).
            if (entry.url && !entry.url.startsWith('blob:')) {
                this._pushRecent(entry);
            }
            await this.loadGame(entry.url, displayName);
            return;
        }

        if (!entry.iaItem && !entry.iaSearch) {
            this._showError('Library entry "' + displayName + '" has no url, iaItem, or iaSearch.');
            return;
        }

        // Swap to the loading overlay immediately so the (sometimes slow)
        // metadata round-trip gives visible feedback.
        const generation = ++this._loadGeneration;
        const resolveLabel = entry.iaItem
            ? 'Resolving "' + displayName + '" on Internet Archive…'
            : 'Searching Internet Archive for "' + displayName + '"…';
        this._showLoading(resolveLabel);
        this.setStatus(resolveLabel);

        try {
            let itemId = entry.iaItem;
            if (!itemId) {
                itemId = await this._resolveIASearchToItemId(entry.iaSearch, displayName);
            }
            if (generation !== this._loadGeneration) return; // superseded
            this._showLoading('Resolving "' + displayName + '" (' + itemId + ')…');
            const url = await this._resolveIAItemToUrl(itemId);
            if (generation !== this._loadGeneration) return; // superseded
            this._pushRecent(entry);
            await this.loadGame(url, displayName);
        } catch (err) {
            if (generation !== this._loadGeneration) return;
            const reason = this._errToText(err);
            console.error('[TRS-80] IA resolve failed for', entry.iaItem || entry.iaSearch, '→', err);
            const iaSearchUrl = 'https://archive.org/search?query=' +
                encodeURIComponent(displayName + ' TRS-80');
            this._showError(
                `Couldn't load "${displayName}" from the Internet Archive.`,
                [
                    `Reason: ${reason}`,
                    entry.iaItem
                        ? `The IA item "${entry.iaItem}" may have been renamed or removed.`
                        : 'The IA search for this title returned no usable item.',
                    'Try another title, paste a URL above, or click "File…" to load a local image.',
                ],
                { iaSearchUrl }
            );
            this.setStatus('Failed: ' + reason);
            this.emitAppEvent('error', {
                error: reason,
                iaItem: entry.iaItem, iaSearch: entry.iaSearch, name: displayName,
            });
        }
    }

    /**
     * Resolve an Internet Archive search query to a single item identifier.
     * Hits advancedsearch.php (through the proxy) and prefers a software-
     * mediatype result. Cached per-instance; concurrent calls are deduped.
     * @private
     */
    _resolveIASearchToItemId(query, displayName) {
        const cacheKey = 'search:' + query;
        if (this._iaUrlCache.has(cacheKey)) {
            return Promise.resolve(this._iaUrlCache.get(cacheKey));
        }
        if (this._iaResolveInFlight.has(cacheKey)) {
            return this._iaResolveInFlight.get(cacheKey);
        }

        const directSearchUrl =
            'https://archive.org/advancedsearch.php' +
            '?q=' + encodeURIComponent(query) +
            '&fl[]=identifier&fl[]=title&fl[]=mediatype' +
            '&rows=5&page=1&output=json';
        const fetchUrl = this.getLoadUrl(directSearchUrl);

        const promise = (async () => {
            const res = await fetch(fetchUrl, { credentials: 'omit' });
            if (!res.ok) {
                throw new Error(`IA search HTTP ${res.status} for "${displayName}"`);
            }
            const data = await res.json();
            const docs = data?.response?.docs;
            if (!Array.isArray(docs) || docs.length === 0) {
                throw new Error(`IA search returned no results for "${displayName}"`);
            }
            const softwareHit = docs.find(d => d.mediatype === 'software');
            const pick = softwareHit || docs[0];
            const itemId = pick?.identifier;
            if (typeof itemId !== 'string' || !itemId) {
                throw new Error(`IA search result missing identifier for "${displayName}"`);
            }
            this._iaUrlCache.set(cacheKey, itemId);
            return itemId;
        })().finally(() => {
            this._iaResolveInFlight.delete(cacheKey);
        });

        this._iaResolveInFlight.set(cacheKey, promise);
        return promise;
    }

    /**
     * Resolve an Internet Archive item identifier to a direct download URL
     * for the best emulator-loadable file. Hits the IA metadata API and
     * picks the most specific extension (see IA_PREFERRED_EXTS). Cached
     * per-instance; concurrent calls are deduped.
     * @private
     */
    _resolveIAItemToUrl(itemId) {
        if (this._iaUrlCache.has(itemId)) {
            return Promise.resolve(this._iaUrlCache.get(itemId));
        }
        if (this._iaResolveInFlight.has(itemId)) {
            return this._iaResolveInFlight.get(itemId);
        }

        const directMetaUrl = `https://archive.org/metadata/${encodeURIComponent(itemId)}`;
        const fetchUrl = this.getLoadUrl(directMetaUrl);

        const promise = (async () => {
            const res = await fetch(fetchUrl, { credentials: 'omit' });
            if (!res.ok) {
                throw new Error(`IA metadata HTTP ${res.status} for "${itemId}"`);
            }
            const meta = await res.json();
            const files = Array.isArray(meta?.files) ? meta.files : [];
            if (files.length === 0) {
                throw new Error(`IA item "${itemId}" has no files (renamed or removed?)`);
            }

            // Pick the most specific extension. Within a tier, prefer the
            // shorter filename (usually the original, un-derived upload).
            let pick = null;
            for (const ext of IA_PREFERRED_EXTS) {
                const matches = files.filter(f =>
                    typeof f.name === 'string' &&
                    f.name.toLowerCase().endsWith(ext) &&
                    !/_archive\.zip$/i.test(f.name) &&
                    !/_files\.xml$/i.test(f.name) &&
                    !/_meta\.(xml|sqlite)$/i.test(f.name)
                );
                if (matches.length) {
                    matches.sort((a, b) => a.name.length - b.name.length);
                    pick = matches[0];
                    break;
                }
            }
            if (!pick) {
                throw new Error(`No supported file in IA item "${itemId}" (looked for ${IA_PREFERRED_EXTS.join(', ')})`);
            }

            const url = `https://archive.org/download/${encodeURIComponent(itemId)}/${encodeURI(pick.name)}`;
            this._iaUrlCache.set(itemId, url);
            return url;
        })().finally(() => {
            this._iaResolveInFlight.delete(itemId);
        });

        this._iaResolveInFlight.set(itemId, promise);
        return promise;
    }

    /**
     * Resolve a user-facing URL into the URL we should actually fetch.
     * archive.org (and its ia######.us.archive.org file subdomains) is
     * routed through the IlluminatOS PHP proxy because its CORS posture for
     * third-party browser embeds is inconsistent. CORS-friendly hosts,
     * same-origin URLs, and local schemes (blob:/data:/file:) pass through.
     *
     * Deployments can override the proxy URL by setting
     *   window.__TRS80_PROXY_URL = 'https://example.com/proxy.php';
     * before the TRS-80 app launches.
     *
     * @param {string} originalUrl
     * @returns {string}
     */
    getLoadUrl(originalUrl) {
        if (!originalUrl) return originalUrl;
        try {
            const u = new URL(originalUrl, document.baseURI);
            const host = u.hostname.toLowerCase();

            // Local schemes — never proxy.
            if (u.protocol === 'blob:' || u.protocol === 'data:' || u.protocol === 'file:') {
                return originalUrl;
            }
            // Same-origin — no CORS issue.
            if (host === location.hostname.toLowerCase()) {
                return originalUrl;
            }
            // Explicit CORS-friendly hosts — fetch direct.
            if (CORS_FRIENDLY_HOSTS.has(host)) {
                return originalUrl;
            }

            const isProxyAllowed =
                PROXY_HOSTS.has(host) ||
                host.endsWith('.archive.org') ||
                /\.us\.archive\.org$/i.test(host);

            if (isProxyAllowed) {
                const customProxy = (typeof window !== 'undefined' && window.__TRS80_PROXY_URL) || null;
                const proxyBase = customProxy
                    ? customProxy
                    : new URL('api/trs80-proxy.php', document.baseURI).toString();
                const sep = proxyBase.includes('?') ? '&' : '?';
                return proxyBase + sep + 'url=' + encodeURIComponent(originalUrl);
            }
            // Unknown host — pass through; CORS may fail with a clear console error.
            return originalUrl;
        } catch {
            return originalUrl;
        }
    }

    /**
     * Stop any running instance, build a fresh emulator, and (if media was
     * requested) fetch + run it. The trs80-emulator `runTrs80File` handles
     * every supported format — floppy, CMD, cassette, Basic — including its
     * own reset + boot timing, so no per-format branching is needed.
     * @private
     */
    async _startEmulatorWith({ url, displayName }) {
        const stage = this.getElement('#trs80Stage');
        const splash = this.getElement('#trs80Splash');
        const loading = this.getElement('#trs80Loading');
        const loadingText = this.getElement('#trs80LoadingText');
        const errorOverlay = this.getElement('#trs80Error');

        if (!stage) return;

        // Tear down any prior instance first — stopEmulator() bumps
        // _loadGeneration, cancelling in-flight loads — THEN claim a fresh
        // generation for this launch so our own supersede-checks below
        // compare against the right value.
        await this.stopEmulator(/* keepSplash= */ false);
        const generation = ++this._loadGeneration;
        this.playSound('floppy');

        if (splash) splash.style.display = 'none';
        if (stage) stage.style.display = 'block';
        if (errorOverlay) errorOverlay.style.display = 'none';
        if (loading) loading.style.display = 'flex';
        if (loadingText) loadingText.textContent = 'Loading TRS-80 engine…';

        try {
            const { emu, web } = await this.ensureModulesLoaded();
            if (generation !== this._loadGeneration) return; // superseded mid-load
            if (loadingText) loadingText.textContent = 'Booting Z80…';

            // Fresh root <div> per session — same defensive pattern as C64.
            stage.innerHTML = '';
            const root = document.createElement('div');
            root.className = 'trs80-root';
            root.id = `trs80-player-${Date.now()}`;
            stage.appendChild(root);

            this.currentRom = url;
            this.currentRomName = displayName;
            this.isRunning = true;
            this.isReady = false;
            this.updateButtons(true);
            this.setStatus('Starting: ' + displayName);

            // Build the emulator graph. The screen is created fresh per
            // launch and its node appended into the fresh root. The
            // keyboard and sound player are created ONCE and reused — a
            // fresh WebKeyboard would attach a second set of document.body
            // listeners every launch (the library never removes them).
            const config = emu.Config.makeDefault();
            this._screen = new web.CanvasScreen(SCREEN_SCALE);
            root.appendChild(this._screen.getNode());
            this._ensureKeyboard(web);
            this._ensureSound(emu);
            this._cassette = new emu.CassettePlayer();

            this._trs80 = new emu.Trs80(
                config, this._screen, this._keyboard, this._cassette, this._sound
            );
            this._trs80.reset();
            this._trs80.start();
            // start() arms WebKeyboard interception; only keep it armed if
            // our window actually has focus right now.
            this._keyboard.interceptKeys = this.isFocused();
            // WebSoundPlayer constructs muted — open the gate unless the
            // user has explicitly muted this session.
            if (!this._muted) this._sound?.unmute?.();

            // Real program requested (URL or blob): fetch it and hand the
            // decoded file to runTrs80File. Empty URL = boot to BASIC.
            if (url) {
                if (loadingText) loadingText.textContent = 'Fetching program…';
                await this._fetchAndRun(url, displayName);
                if (generation !== this._loadGeneration) return;
            }

            this.isReady = true;
            if (loading) loading.style.display = 'none';
            this.setStatus('Running: ' + displayName);
            this.emitAppEvent('started', { url, name: displayName });
            this.emitAppEvent('ready',   { name: displayName });
        } catch (err) {
            if (generation !== this._loadGeneration) return;
            const reason = this._errToText(err);
            console.error('[TRS-80] Failed to start:', err || '(no error object)');
            this._showError(
                'Failed to start the TRS-80 emulator',
                [
                    `Reason: ${reason}`,
                    'If this is a URL load, the host may be blocking cross-origin requests.',
                    'Check the browser console for the full stack.',
                ]
            );
            this.setStatus('Error: ' + reason);
            this.isRunning = false;
            this.isReady = false;
            this.updateButtons(false);
            this.emitAppEvent('error', { error: reason, url });
        }
    }

    /**
     * Fetch a program URL (through the CORS proxy when needed), decode it,
     * and run it. `decodeTrs80File` auto-detects floppy / CMD / cassette /
     * Basic from the bytes; `runTrs80File` dispatches accordingly.
     * @private
     */
    async _fetchAndRun(url, displayName) {
        // Capture the live emulator + modules up front. If a newer launch
        // swaps them out while we're awaiting the download, this file must
        // not be run into the wrong (or a torn-down) instance.
        const trs80 = this._trs80;
        const modules = this._modules;
        if (!trs80 || !modules) {
            throw new Error('Emulator was not initialised');
        }
        const res = await fetch(this.getLoadUrl(url), { credentials: 'omit' });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} fetching ${displayName}`);
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length === 0) {
            throw new Error(`Downloaded file for "${displayName}" was empty`);
        }
        if (trs80 !== this._trs80) {
            return; // superseded by a newer launch — drop this quietly
        }
        const filename = this.getBundleName(url) || displayName;
        const trs80File = modules.base.decodeTrs80File(buf, filename);
        if (!trs80File || trs80File.className === 'RawBinaryFile') {
            throw new Error(
                `Unrecognized TRS-80 file format for "${displayName}". ` +
                'Supported: .cmd .bas .cas .dsk .jv1 .jv3 .dmk'
            );
        }
        if (trs80File.error) {
            // Partial decodes (e.g. a disk with a few bad CRCs) often still
            // run — log the warning but go ahead and try.
            console.warn('[TRS-80] decode reported:', trs80File.error);
        }
        trs80.runTrs80File(trs80File);
    }

    /** Create the reusable WebKeyboard on first use. @private */
    _ensureKeyboard(web) {
        if (!this._keyboard) {
            this._keyboard = new web.WebKeyboard();
            // Attaches keydown/keyup/paste listeners to document.body. Done
            // exactly once — the library exposes no removal API.
            this._keyboard.configureKeyboard();
        } else {
            this._keyboard.clearKeyboard();
        }
        return this._keyboard;
    }

    /** Create the reusable sound player on first use. @private */
    _ensureSound(emu) {
        if (!this._sound) {
            const SoundClass = this._modules?.WebSoundPlayerClass;
            this._sound = SoundClass ? new SoundClass() : new emu.SilentSoundPlayer();
        }
        return this._sound;
    }

    /**
     * Stop the running emulator and tear down per-session objects. The
     * reusable keyboard and sound player are kept (the keyboard's body
     * listeners can't be removed; the sound player owns a single shared
     * AudioContext) but the keyboard is disarmed and the sound muted.
     *
     * @param {boolean} [keepSplash=true]
     */
    async stopEmulator(keepSplash = true) {
        const stage = this.getElement('#trs80Stage');
        const splash = this.getElement('#trs80Splash');

        // Bump the generation so any in-flight load/resolve becomes a no-op.
        this._loadGeneration++;

        // Disarm keyboard interception and silence the sound player before
        // anything else, so teardown can't leak a keystroke or a sample.
        if (this._keyboard) {
            try { this._keyboard.interceptKeys = false; } catch { /* ignore */ }
            try { this._keyboard.clearKeyboard(); } catch { /* ignore */ }
        }
        try { this._sound?.mute?.(); } catch { /* ignore */ }
        try { this._sound?.setFloppyMotorOn?.(false); } catch { /* ignore */ }

        // Stop the Z80 tick loop.
        try { this._trs80?.stop?.(); } catch { /* ignore */ }
        // Eject floppies so their handles are released.
        try { this._trs80?.ejectAllFloppyDisks?.(); } catch { /* ignore */ }

        // Drop the DOM subtree (canvas + screen node) so it becomes
        // GC-eligible.
        if (stage) stage.innerHTML = '';

        if (this.activeBlobUrl && this.currentRom === this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }

        // Null the per-session refs. Keep _keyboard and _sound (reused).
        this._trs80 = null;
        this._screen = null;
        this._cassette = null;

        this.isRunning = false;
        this.isReady = false;
        this._paused = false;
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

    // ── Toolbar Actions ────────────────────────────────────────

    togglePause() {
        if (!this.isRunning) return;
        this._setPaused(!this._paused);
    }

    /**
     * Pause / resume. The trs80-emulator has no dedicated pause API —
     * stop() cancels the tick loop (freezing the Z80) and start() resumes
     * it, which is exactly pause/resume.
     * @private
     */
    _setPaused(want) {
        if (!this.isRunning) return;
        this._paused = !!want;
        try {
            if (this._paused) {
                this._trs80?.stop?.();
            } else {
                this._trs80?.start?.();
                if (this._keyboard) this._keyboard.interceptKeys = this.isFocused();
            }
        } catch (e) {
            console.warn('[TRS-80] pause/resume failed:', e);
        }
        const btn = this.getElement('#trs80PauseBtn');
        if (btn) btn.textContent = this._paused ? '▶ Resume' : '⏸ Pause';
        this.setStatus(
            (this._paused ? 'Paused: ' : 'Running: ') + (this.currentRomName || '')
        );
        this.emitAppEvent(this._paused ? 'paused' : 'resumed', { name: this.currentRomName });
    }

    /**
     * Mute / unmute. The WebSoundPlayer is on/off only (no volume curve);
     * SilentSoundPlayer has neither method, so the optional-chaining calls
     * are simply no-ops when sound is unavailable.
     * @private
     */
    _setMuted(want) {
        this._muted = !!want;
        try {
            if (this._muted) this._sound?.mute?.();
            else this._sound?.unmute?.();
        } catch (e) {
            console.warn('[TRS-80] mute/unmute failed:', e);
        }
        const btn = this.getElement('#trs80MuteBtn');
        if (btn) {
            btn.textContent = this._muted ? '🔇' : '🔊';
            btn.title = this._muted ? 'Unmute' : 'Mute';
        }
    }

    async resetCurrent() {
        const url = this.currentRom;
        const name = this.currentRomName;
        await this.stopEmulator();
        if (url !== null) await this.loadGame(url, name);
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
                    typeof r.name === 'string')
                    .slice(0, TRS80.RECENTS_MAX);
            }
        } catch { /* ignore */ }
    }

    _saveRecents() {
        try { localStorage.setItem(TRS80.RECENTS_KEY, JSON.stringify(this._recents)); } catch { /* ignore */ }
    }

    _pushRecent(entry) {
        if (!entry || !entry.name) return;
        const key = entry.url || entry.iaItem || entry.iaSearch || entry.name;
        const trimmed = {
            name: entry.name, icon: entry.icon || '💾',
            url: entry.url, iaItem: entry.iaItem, iaSearch: entry.iaSearch,
            category: entry.category, year: entry.year,
        };
        const idx = this._recents.findIndex(r =>
            (r.url || r.iaItem || r.iaSearch || r.name) === key);
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

    _showError(title, lines = [], opts = {}) {
        const splash = this.getElement('#trs80Splash');
        const stage = this.getElement('#trs80Stage');
        const loading = this.getElement('#trs80Loading');
        const errorOverlay = this.getElement('#trs80Error');
        const errorTitle = this.getElement('#trs80ErrorTitle');
        const errorBody = this.getElement('#trs80ErrorBody');
        const errorSearch = this.getElement('#trs80ErrorSearch');
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
        if (errorSearch) {
            if (opts.iaSearchUrl) {
                errorSearch.style.display = 'inline-block';
                errorSearch.href = opts.iaSearchUrl;
            } else {
                errorSearch.style.display = 'none';
            }
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
        if (stopBtn) stopBtn.disabled = !running;
        if (resetBtn) resetBtn.disabled = !running;
        if (pauseBtn) pauseBtn.disabled = !running;
        if (!running) {
            this._paused = false;
            if (pauseBtn) pauseBtn.textContent = '⏸ Pause';
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
            return decodeURIComponent(parts[parts.length - 1]) || url;
        } catch {
            return url;
        }
    }
}

export default TRS80;
