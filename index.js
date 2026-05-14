/**
 * IlluminatOS! - Main Entry Point
 * Windows 95 Style Desktop Environment
 *
 * This file initializes all core systems, UI renderers, and features
 * in the correct order to boot the operating system.
 */

// === CONFIG LOADER (must be first) ===
import { loadConfig, getConfig, isBackendAvailable, initSession, getApiVersion, getSessionToken } from './core/ConfigLoader.js';
import { initRealtime } from './core/RealtimeClient.js';
import { escapeHtml } from './core/Sanitize.js';

// === CORE SYSTEMS ===
import StorageManager from './core/StorageManager.js';
import StateManager from './core/StateManager.js';
import EventBus, { Events } from './core/EventBus.js';
import WindowManager from './core/WindowManager.js';
import FileSystemManager from './core/FileSystemManager.js';
import MediaScanner from './core/MediaScanner.js';
import CommandRegistry from './core/CommandRegistry.js';
import ScriptEngine from './core/script/ScriptEngine.js';

// === UI RENDERERS ===
import TaskbarRenderer from './ui/TaskbarRenderer.js';
import DesktopRenderer from './ui/DesktopRenderer.js';
import StartMenuRenderer from './ui/StartMenuRenderer.js';
import ContextMenuRenderer from './ui/ContextMenuRenderer.js';

// === APPLICATIONS ===
import AppRegistry from './apps/AppRegistry.js';

// === FEATURES ===
import FeatureRegistry from './core/FeatureRegistry.js';
import HealthMonitor from './core/HealthMonitor.js';
import SoundSystem from './features/SoundSystem.js';
import AchievementSystem from './features/AchievementSystem.js';
import EasterEggs from './features/EasterEggs.js';
import ClippyAssistant from './features/ClippyAssistant.js';
import DesktopPet from './features/DesktopPet.js';
import Screensaver from './features/Screensaver.js';
import SystemDialogs from './features/SystemDialogs.js';

// === ARG / NARRATIVE SYSTEMS ===
import NarrativeStateManager from './core/NarrativeStateManager.js';
import MediaAssetManager from './core/MediaAssetManager.js';
import MediaCueGraph from './core/MediaCueGraph.js';
import CampaignManager from './features/CampaignManager.js';
import MoodOrchestrator from './features/MoodOrchestrator.js';
import ContentTemplateManager from './features/ContentTemplateManager.js';

// === TELEMETRY & REPLAY (Phase 4) ===
import TelemetryCollector from './core/TelemetryCollector.js';
import ReplayEngine from './core/ReplayEngine.js';

// === LOGIN SCREEN ===
import LoginScreen from './core/LoginScreen.js';
import UserStateSync from './core/UserStateSync.js';

// === MULTIPLAYER ===
import MultiplayerClient from './core/MultiplayerClient.js';
import PresenceManager from './core/PresenceManager.js';
import OnlineUsers from './features/OnlineUsers.js';
import Notifications from './features/Notifications.js';
import ReauthGate from './features/ReauthGate.js';

// === PLUGIN SYSTEM ===
import PluginLoader from './core/PluginLoader.js';

// Log successful module loading
console.log('[IlluminatOS!] All modules imported successfully');

// === BOOT TIPS ===
// Inline defaults used if no server config is available
const DEFAULT_BOOT_TIPS = [
    'Loading your personalized experience...',
    'Initializing desktop icons...',
    'Starting Windows Manager...',
    'Loading system tray...',
    'Preparing applications...',
    'Almost ready...'
];

const DEFAULT_PLUGIN_CONFIG = [
    { path: './plugins/features/dvd-bouncer/index.js', enabled: true }
];

// Resolved after loadConfig() in initializeOS
let BOOT_TIPS = DEFAULT_BOOT_TIPS;

/**
 * Normalize configured boot tips to a safe, non-empty string array.
 * Falls back to inline defaults when config is invalid.
 * @param {*} bootTips
 * @returns {string[]}
 */
function normalizeBootTips(bootTips) {
    if (!Array.isArray(bootTips)) return DEFAULT_BOOT_TIPS;

    const sanitized = bootTips
        .filter(tip => typeof tip === 'string')
        .map(tip => tip.trim())
        .filter(Boolean);

    return sanitized.length > 0 ? sanitized : DEFAULT_BOOT_TIPS;
}

/**
 * Normalize plugin config to a safe manifest-friendly array.
 * @param {*} pluginConfig
 * @returns {{path: string, enabled: boolean}[]}
 */
function normalizePluginConfig(pluginConfig) {
    if (!Array.isArray(pluginConfig)) return DEFAULT_PLUGIN_CONFIG;

    const sanitized = pluginConfig
        .filter(plugin => plugin && typeof plugin.path === 'string' && plugin.path.trim())
        .map(plugin => ({
            path: plugin.path.trim(),
            enabled: plugin.enabled !== false
        }));

    return sanitized.length > 0 ? sanitized : DEFAULT_PLUGIN_CONFIG;
}

/**
 * Boot sequence - animates the loading screen
 */
class BootSequence {
    constructor() {
        this.bootScreen = document.getElementById('bootScreen');
        this.bootTip = document.getElementById('bootTip');
        this.loadingFill = document.querySelector('.loading-fill');
        this.progress = 0;
        this.tipIndex = 0;
    }

    /**
     * Run the boot animation
     * @returns {Promise} Resolves when boot is complete
     */
    async run() {
        return new Promise((resolve) => {
            // Animate loading bar
            const progressInterval = setInterval(() => {
                this.progress += Math.random() * 15 + 5;
                if (this.progress >= 100) {
                    this.progress = 100;
                    clearInterval(progressInterval);
                    clearInterval(tipInterval);

                    // Finish boot
                    setTimeout(() => {
                        this.complete();
                        resolve();
                    }, 500);
                }

                if (this.loadingFill) {
                    this.loadingFill.style.width = `${this.progress}%`;
                }
            }, 200);

            // Cycle through boot tips
            const tipInterval = setInterval(() => {
                this.tipIndex = (this.tipIndex + 1) % BOOT_TIPS.length;
                if (this.bootTip) {
                    this.bootTip.textContent = BOOT_TIPS[this.tipIndex];
                }
            }, 800);
        });
    }

    /**
     * Complete boot sequence - hide boot screen.
     * Desktop events (BOOT_COMPLETE, startup sound) are deferred
     * until after the login screen resolves.
     */
    complete() {
        if (this.bootScreen) {
            this.bootScreen.classList.add('fade-out');
            setTimeout(() => {
                this.bootScreen.style.display = 'none';
            }, 500);
        }

        console.log('[IlluminatOS!] Boot animation complete — showing login screen');
    }

    /**
     * Finalize desktop after user completes login/guest selection.
     */
    finalizeDesktop() {
        EventBus.emit(Events.BOOT_COMPLETE, { timestamp: Date.now() });
        EventBus.emit(Events.SOUND_PLAY, { type: 'startup' });
        console.log('[IlluminatOS!] Boot complete!');
    }
}

/** Per-component timeout (ms). Prevents any single init step from hanging the boot. */
const COMPONENT_TIMEOUT = 10000;

/**
 * Initialize a single component with error handling and a per-component timeout.
 * @param {string} name - Component name for logging
 * @param {Function} initFn - Initialization function (can be async)
 * @param {Object} options
 * @param {boolean} options.critical - If true, failure aborts boot (default: true)
 * @param {number} options.timeout - Per-component timeout in ms (default: COMPONENT_TIMEOUT)
 */
async function initComponent(name, initFn, { critical = true, timeout = COMPONENT_TIMEOUT } = {}) {
    const startedAt = performance.now();

    try {
        console.log(`[IlluminatOS!]   - Initializing ${name}...`);

        // Race the init function against a per-component timeout
        const result = await Promise.race([
            initFn(),
            new Promise((_, reject) => setTimeout(
                () => reject(new Error(`${name} timed out after ${timeout / 1000}s`)),
                timeout
            ))
        ]);

        return {
            name,
            critical,
            status: 'ok',
            durationMs: Math.round(performance.now() - startedAt)
        };
    } catch (error) {
        const durationMs = Math.round(performance.now() - startedAt);
        console.error(`[IlluminatOS!] FAILED to initialize ${name}:`, error);
        if (critical) {
            throw new Error(`Failed to initialize ${name}: ${error.message}`, { cause: error });
        }
        console.warn(`[IlluminatOS!] Non-critical component ${name} failed — continuing boot`);
        return {
            name,
            critical,
            status: 'degraded',
            durationMs,
            error: error?.message || String(error)
        };
    }
}

/**
 * Initialize all OS components in the correct order
 * @param {Function} onProgress - Callback for progress updates
 */
async function initializeOS(onProgress = () => {}) {
    console.log('[IlluminatOS!] Starting initialization...');

    const bootStart = performance.now();
    const healthReport = [];
    const trackInit = async (name, initFn, options = {}) => {
        const startedAt = performance.now();

        try {
            const result = await initComponent(name, initFn, options);
            if (result) {
                healthReport.push(result);
            }
            return result;
        } catch (error) {
            const isCritical = options.critical !== false;
            healthReport.push({
                name,
                critical: isCritical,
                status: 'failed',
                durationMs: Math.round(performance.now() - startedAt),
                error: error?.message || String(error)
            });
            throw error;
        }
    };

    // === Phase -1: Load server config (or fall back to defaults) ===
    console.log('[IlluminatOS!] Phase -1: Config Loader');
    await loadConfig();

    if (!isBackendAvailable()) {
        console.warn('[IlluminatOS!] ⚠ PHP backend not available — running with inline defaults. Admin config changes will not take effect. To enable the backend, serve the app with PHP (e.g. php -S localhost:8000).');
    }

    // === Phase -0.5: User Session + Realtime (v2 API only) ===
    if (getApiVersion() >= 2) {
        console.log('[IlluminatOS!] Phase -0.5: User Session');
        const token = await initSession();
        if (token) {
            initRealtime(token);
            console.log('[IlluminatOS!] SSE realtime connection initialized');

            // Re-fetch config now that we have a session token so non-public
            // sections (filesystem, plugins) become available. The first
            // loadConfig() call ran anonymously and only saw public sections.
            try {
                await loadConfig();
            } catch (e) {
                console.warn('[IlluminatOS!] Authenticated config refresh failed:', e?.message || e);
            }
        }
    }

    BOOT_TIPS = normalizeBootTips(getConfig('bootTips', DEFAULT_BOOT_TIPS));

    // Patch boot screen branding from config (JS patching approach — keeps index.html static)
    const osName = getConfig('branding.osName', 'IlluminatOS!');
    const bootLogo = document.querySelector('.boot-logo');
    const bootVersion = document.querySelector('.boot-version');
    const bootMessage = document.querySelector('.boot-screen > div:nth-child(3)');
    if (bootLogo) bootLogo.textContent = osName;
    if (bootVersion) bootVersion.textContent = getConfig('branding.versionString', 'Version 95.0 - Modular Edition');
    if (bootMessage && bootMessage.textContent.includes('Starting')) {
        bootMessage.textContent = getConfig('branding.bootMessage', 'Starting Windows 95...');
    }
    const bsodTitle = document.querySelector('.bsod-content h1');
    if (bsodTitle) bsodTitle.textContent = getConfig('branding.bsodTitle', osName);
    document.title = osName + ' - Desktop';

    // Patch sidebar text (Start Menu)
    const sidebarText = document.querySelector('.sidebar-text');
    if (sidebarText) sidebarText.textContent = getConfig('branding.sidebarText', osName);

    // === Phase 0: App Registry (CRITICAL - was running outside error handling!) ===
    console.log('[IlluminatOS!] Phase 0: App Registry');
    onProgress(5, 'Registering applications...');
    await trackInit('AppRegistry', () => AppRegistry.initialize());

    // === Phase 1: Core Systems ===
    console.log('[IlluminatOS!] Phase 1: Core Systems');
    onProgress(15, 'Loading core systems...');
    await trackInit('StorageManager', () => StorageManager.initialize());
    await trackInit('StateManager', () => StateManager.initialize());
    await trackInit('WindowManager', () => WindowManager.initialize());

    // Initialize narrative state (must be before ScriptEngine so builtins can access it)
    await trackInit('NarrativeStateManager', () => NarrativeStateManager.initialize(), { critical: false });

    // Initialize media asset pipeline (must be before ScriptEngine so multimedia builtins can access it)
    await trackInit('MediaAssetManager', () => MediaAssetManager.initialize(), { critical: false });

    // Initialize telemetry collector (must be before ScriptEngine so builtins can access it)
    await trackInit('TelemetryCollector', () => TelemetryCollector.initialize(), { critical: false });

    // Initialize replay engine
    await trackInit('ReplayEngine', () => ReplayEngine.initialize(), { critical: false });

    // Initialize scripting infrastructure
    await trackInit('CommandRegistry', () => CommandRegistry.initialize());
    await trackInit('ScriptEngine', () => ScriptEngine.initialize({
        FileSystemManager,
        EventBus,
        WindowManager,
        AppRegistry,
        StateManager,
        StorageManager,
        NarrativeStateManager,
        MediaAssetManager,
        MediaCueGraph,
        TelemetryCollector,
        ReplayEngine
    }));

    // === Phase 1.5: Sync Filesystem with Apps and Desktop ===
    console.log('[IlluminatOS!] Phase 1.5: Filesystem Sync');
    onProgress(25, 'Syncing filesystem...');
    await trackInit('FilesystemSync', () => {
        // W3.2 — pull in any .lnk files that exist in the FS but aren't yet
        // in state.icons (e.g. shortcuts the user created in Terminal in a
        // previous session). This runs BEFORE syncDesktopIcons so the reverse
        // sync below picks the merged set as its source of truth.
        StateManager.reconcileIconsFromFileSystem(FileSystemManager);

        // Sync desktop icons into filesystem as .lnk files
        // This allows Terminal and MyComputer to see all desktop items
        const icons = StateManager.getState('icons');
        FileSystemManager.syncDesktopIcons(icons);

        // Sync installed apps into Program Files
        const apps = AppRegistry.getAll();
        FileSystemManager.syncInstalledApps(apps);

        // Save the updated filesystem
        FileSystemManager.saveFileSystem();

        // F2 — install the runtime FS → state reconciler so a `.lnk` created
        // in Desktop/ at runtime (terminal, script, drag-and-drop) surfaces
        // as a desktop icon without a reload. Idempotent and survives
        // user-switch cascades.
        StateManager.installDesktopIconReconciler(FileSystemManager);
    }, { critical: false });

    // === Phase 1.55: Server File Sync ===
    console.log('[IlluminatOS!] Phase 1.55: Server File Sync');
    onProgress(27, 'Syncing server files...');
    await trackInit('ServerFileSync', async () => {
        const synced = await FileSystemManager.syncServerFiles();
        if (synced > 0) {
            console.log(`[IlluminatOS!] Synced ${synced} server file(s) into virtual filesystem`);
        }
    }, { critical: false });

    // === Phase 1.6: Scan Media Folders ===
    console.log('[IlluminatOS!] Phase 1.6: Media Scanner');
    onProgress(28, 'Scanning media folders...');
    await trackInit('MediaScanner', async () => {
        await MediaScanner.scan();
    }, { critical: false });

    // === Phase 2: Features ===
    console.log('[IlluminatOS!] Phase 2: Features');
    onProgress(35, 'Loading features...');

    // Register all features with FeatureRegistry
    await trackInit('FeatureRegistry', () => {
        // Debug: Log features before registration
        const featuresToRegister = [
            SoundSystem,
            AchievementSystem,
            SystemDialogs,
            Screensaver,
            ClippyAssistant,
            DesktopPet,
            EasterEggs,
            CampaignManager,
            MoodOrchestrator,
            ContentTemplateManager,
            OnlineUsers,
            Notifications,
            ReauthGate
        ];

        console.log('[IlluminatOS!] Features to register:', featuresToRegister.map(f => f?.id || 'UNDEFINED'));

        // Verify each feature is valid
        featuresToRegister.forEach((feature, i) => {
            if (!feature) {
                console.error(`[IlluminatOS!] Feature at index ${i} is undefined/null!`);
            } else if (!feature.id) {
                console.error(`[IlluminatOS!] Feature at index ${i} has no id:`, feature);
            }
        });

        FeatureRegistry.registerAll(featuresToRegister);
    }, { critical: false });

    // === Phase 2.5: Load Plugins ===
    console.log('[IlluminatOS!] Phase 2.5: Plugin System');
    onProgress(45, 'Loading plugins...');
    await trackInit('PluginLoader', async () => {
        // Load plugin list from config or use inline default
        const configPlugins = normalizePluginConfig(getConfig('plugins', DEFAULT_PLUGIN_CONFIG));

        // Merge config with existing manifest to preserve runtime toggles
        // (e.g., user disabled a plugin at runtime — that state survives reboot)
        const existingManifest = PluginLoader.getPluginManifest();
        const existingByPath = {};
        const existingPlugins = Array.isArray(existingManifest?.plugins) ? existingManifest.plugins : [];
        for (const p of existingPlugins) {
            if (!p || typeof p.path !== 'string' || !p.path.trim()) continue;
            existingByPath[p.path.trim()] = p;
        }

        const manifest = { plugins: [] };
        for (const plugin of configPlugins) {
            const existing = existingByPath[plugin.path];
            manifest.plugins.push({
                path: plugin.path.trim(),
                enabled: existing !== undefined ? existing.enabled : (plugin.enabled !== false)
            });
        }

        PluginLoader.savePluginManifest(manifest);

        // Load all plugins (registers plugin features with FeatureRegistry)
        await PluginLoader.loadAllPlugins();

        // Log status for debugging
        console.log('[IlluminatOS!] Plugins loaded:');
        PluginLoader.logStatus();
    }, { critical: false });

    // === Phase 2.7: Initialize All Features (Core + Plugin) ===
    console.log('[IlluminatOS!] Phase 2.7: Initializing all features');
    onProgress(50, 'Initializing features...');
    await trackInit('FeatureRegistry.initializeAll', async () => {
        await FeatureRegistry.initializeAll();
    }, { critical: false });

    // === Phase 3: UI Renderers ===
    console.log('[IlluminatOS!] Phase 3: UI Renderers');
    onProgress(60, 'Rendering desktop...');
    await trackInit('TaskbarRenderer', () => TaskbarRenderer.initialize());
    await trackInit('DesktopRenderer', () => DesktopRenderer.initialize());
    await trackInit('StartMenuRenderer', () => StartMenuRenderer.initialize());
    await trackInit('ContextMenuRenderer', () => ContextMenuRenderer.initialize());

    // === Phase 4: Apply saved settings ===
    console.log('[IlluminatOS!] Phase 4: Applying settings');
    onProgress(80, 'Applying settings...');
    await trackInit('Settings', () => applySettings(), { critical: false });

    // === Phase 5: Setup global handlers ===
    console.log('[IlluminatOS!] Phase 5: Global handlers');
    onProgress(90, 'Setting up handlers...');
    await trackInit('GlobalHandlers', () => setupGlobalHandlers(), { critical: false });

    // === Phase 5.5: Autoexec Script (deferred until after login) ===
    // IMPORTANT: autoexec mutates filesystem/state and must run in user-scoped
    // storage. Running here (pre-login) writes to global storage and gets
    // replaced by FileSystemManager.reloadForUser() after login.
    console.log('[IlluminatOS!] Phase 5.5: Autoexec Scripts (deferred)');
    onProgress(95, 'Preparing startup scripts...');

    // Mark as visited
    if (!StateManager.getState('user.hasVisited')) {
        StateManager.setState('user.hasVisited', true, true);
    }

    // Emit deferred storage fallback warning now that UI is ready
    StorageManager.emitFallbackWarning();

    const bootDurationMs = Math.round(performance.now() - bootStart);
    const degradedCount = healthReport.filter(entry => entry.status === 'degraded').length;
    window.__OS_BOOT_HEALTH = {
        timestamp: Date.now(),
        durationMs: bootDurationMs,
        degradedCount,
        components: healthReport
    };

    // Install the live HealthMonitor — `window.__OS_HEALTH` aggregates boot
    // health, subscription accounting, storage telemetry, bus stats, feature
    // posture, realtime/multiplayer state, and recent faults.
    try { HealthMonitor.install(); } catch (err) {
        console.warn('[IlluminatOS!] HealthMonitor install failed:', err);
    }

    if (degradedCount > 0) {
        console.warn(`[IlluminatOS!] Boot completed with ${degradedCount} degraded non-critical component(s) in ${bootDurationMs}ms`);
    } else {
        console.log(`[IlluminatOS!] Boot health: all components initialized successfully in ${bootDurationMs}ms`);
    }

    onProgress(100, 'Ready!');
    console.log('[IlluminatOS!] Initialization complete');
}

/**
 * Apply saved user settings
 */
function applySettings() {
    // Apply CRT effect
    const crtEnabled = StateManager.getState('settings.crtEffect');
    const crtOverlay = document.getElementById('crtOverlay');
    if (crtOverlay) {
        crtOverlay.style.display = crtEnabled ? 'block' : 'none';
    }

    // Apply desktop background color if saved
    const savedBg = StorageManager.get('desktopBg');
    const desktop = document.getElementById('desktop');
    if (savedBg && desktop) {
        desktop.style.backgroundColor = savedBg;
    }

    // Apply wallpaper pattern (default from admin config, fallback: space)
    const savedWallpaper = StorageManager.get('desktopWallpaper') ?? getConfig('defaults.wallpaper', 'space');
    if (savedWallpaper && desktop) {
        // Inline fallback patterns (used if no server config)
        const INLINE_WALLPAPERS = {
            'clouds': 'radial-gradient(ellipse at 20% 30%, rgba(255,255,255,0.8) 0%, transparent 50%), radial-gradient(ellipse at 80% 40%, rgba(255,255,255,0.6) 0%, transparent 40%), radial-gradient(ellipse at 50% 70%, rgba(255,255,255,0.7) 0%, transparent 45%), radial-gradient(ellipse at 10% 80%, rgba(255,255,255,0.5) 0%, transparent 35%), linear-gradient(180deg, #87CEEB 0%, #4A90D9 100%)',
            'tiles': 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px), repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)',
            'waves': 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.15) 20px, rgba(255,255,255,0.15) 40px), repeating-linear-gradient(-45deg, transparent, transparent 20px, rgba(0,0,0,0.1) 20px, rgba(0,0,0,0.1) 40px), linear-gradient(135deg, #1a5276 0%, #2980b9 50%, #1a5276 100%)',
            'forest': 'linear-gradient(180deg, #228B22 0%, #006400 30%, #004d00 60%, #003300 100%)',
            'space': 'radial-gradient(ellipse at 20% 20%, rgba(255,255,255,0.8) 0%, transparent 1%), radial-gradient(ellipse at 80% 30%, rgba(255,255,255,0.6) 0%, transparent 1%), radial-gradient(ellipse at 40% 60%, rgba(255,255,255,0.9) 0%, transparent 1%), radial-gradient(ellipse at 60% 80%, rgba(255,255,255,0.5) 0%, transparent 1%), radial-gradient(ellipse at 10% 70%, rgba(255,255,255,0.7) 0%, transparent 1%), radial-gradient(ellipse at 90% 60%, rgba(255,255,255,0.4) 0%, transparent 1%), radial-gradient(ellipse at 30% 90%, rgba(255,255,255,0.6) 0%, transparent 1%), radial-gradient(ellipse at 70% 10%, rgba(255,255,255,0.8) 0%, transparent 1%), linear-gradient(180deg, #0a0a2e 0%, #1a1a4e 50%, #0a0a2e 100%)'
        };

        // Try server config first, fall back to inline
        const configWallpapers = getConfig('wallpapers', null);
        const pattern = configWallpapers?.[savedWallpaper]?.css
            || INLINE_WALLPAPERS[savedWallpaper];
        if (pattern) {
            desktop.style.backgroundImage = pattern;
        }
    }

    // Apply color scheme (default from admin config, fallback: slate)
    const colorScheme = StorageManager.get('colorScheme') ?? getConfig('defaults.colorScheme', 'slate');

    // Remove any previously applied scheme classes to prevent accumulation
    [...document.body.classList].forEach(cls => {
        if (cls.startsWith('scheme-')) document.body.classList.remove(cls);
    });

    if (colorScheme && colorScheme !== 'win95') {
        const INLINE_COLOR_SCHEMES = {
            highcontrast: { window: '#000000', titlebar: '#800080' },
            desert: { window: '#d4c4a8', titlebar: '#8b7355' },
            ocean: { window: '#b0c4de', titlebar: '#003366' },
            rose: { window: '#e8d0d0', titlebar: '#8b4560' },
            slate: { window: '#a0a0b0', titlebar: '#404050' }
        };
        const configSchemes = getConfig('colorSchemes', null);
        const scheme = configSchemes?.[colorScheme] || INLINE_COLOR_SCHEMES[colorScheme];
        if (scheme) {
            document.documentElement.style.setProperty('--win95-gray', scheme.window);
            document.documentElement.style.setProperty('--win95-blue', scheme.titlebar);
            document.documentElement.style.setProperty('--accent-color', scheme.titlebar);
            document.body.classList.add(`scheme-${colorScheme}`);
        }
    }

    // Apply display effects settings
    const windowAnimations = StorageManager.get('windowAnimations');
    const menuShadows = StorageManager.get('menuShadows');
    const smoothScrolling = StorageManager.get('smoothScrolling');
    const iconSize = StorageManager.get('iconSize') || 'medium';
    const energySaving = StorageManager.get('energySaving');

    // Apply animation setting (default is enabled)
    document.body.classList.toggle('no-animations', windowAnimations === false);

    // Apply shadows setting (default is enabled)
    document.body.classList.toggle('no-shadows', menuShadows === false);

    // Apply smooth scrolling setting (default is enabled)
    document.body.classList.toggle('no-smooth-scroll', smoothScrolling === false);

    // Apply icon size (remove old icon-size-* class first)
    [...document.body.classList].forEach(cls => {
        if (cls.startsWith('icon-size-')) document.body.classList.remove(cls);
    });
    document.body.classList.add(`icon-size-${iconSize}`);

    // Apply energy saving mode
    if (energySaving) {
        document.body.classList.add('energy-saving');
    }

    // Subscribe to CRT setting changes
    StateManager.subscribe('settings.crtEffect', (enabled) => {
        const overlay = document.getElementById('crtOverlay');
        if (overlay) {
            overlay.style.display = enabled ? 'block' : 'none';
        }
    });
}

/**
 * Setup global event handlers
 */
function setupGlobalHandlers() {
    // NOTE: dialog:alert is now handled exclusively by SystemDialogs feature
    // The legacy showDialog() function below is kept for fallback but not subscribed
    // to avoid duplicate dialogs appearing when scripts emit dialog:alert events.

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        console.error('[IlluminatOS!] Unhandled promise rejection:', event.reason);
        EventBus.emit('system:error', {
            type: 'unhandledrejection',
            error: event.reason?.message || String(event.reason)
        });
    });

    // Handle BSOD (Blue Screen of Death)
    EventBus.on(Events.BSOD_SHOW, () => {
        showBSOD();
    });

    // Handle realtime system announcements from backend SSE
    EventBus.on('system:announcement', (announcement = {}) => {
        const title = announcement.title || 'System Announcement';
        const message = announcement.message || 'A new announcement was posted.';
        EventBus.emit('dialog:alert', {
            title,
            message,
            icon: announcement.type === 'critical' ? '⚠️' : '📢'
        });
    });

    // Notify users when announcements are changed/removed in real time
    EventBus.on('sse:announcement.updated', (payload = {}) => {
        EventBus.emit('dialog:alert', {
            title: 'Announcement Updated',
            message: `Announcement #${payload.id ?? '?'} was updated.`,
            icon: 'ℹ️'
        });
    });

    EventBus.on('sse:announcement.deleted', (payload = {}) => {
        EventBus.emit('dialog:alert', {
            title: 'Announcement Removed',
            message: `Announcement #${payload.id ?? '?'} was removed.`,
            icon: 'ℹ️'
        });
    });

    EventBus.on('sse:system.app.launch', ({ app_id: appId, params = {} } = {}) => {
        if (!appId) return;
        const launched = AppRegistry.launch(appId, params);
        if (!launched) {
            EventBus.emit('dialog:alert', {
                title: 'Remote Launch Failed',
                message: `Could not launch app: ${appId}`,
                icon: '⚠️'
            });
        }
    });

    EventBus.on('sse:system.filesystem.command', ({ operation, path, content = '', recursive = false } = {}) => {
        if (!operation || !path) return;

        // Restrict remote filesystem commands to known-safe roots.
        // Support both legacy path style (/C/server/...) and current Win95-style
        // paths used across the OS (C:/Users/User/...).
        const allowedPrefixes = [
            '/C/server/', '/C/shared/', '/C/public/',
            'C:/server/', 'C:/shared/', 'C:/public/',
            'C:/Users/User/Desktop/',
            'C:/Users/User/Documents/',
            'C:/Users/User/Pictures/',
            'C:/Users/User/Music/',
            'C:/Users/User/Projects/',
            'C:/Users/User/Secret/',
            'C:/Windows/',
            'C:/Windows/System32/'
        ];

        const normalizedPath = String(path).replace(/\\/g, '/');
        const ensuredTrailingSlash = normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`;
        if (!allowedPrefixes.some(prefix => ensuredTrailingSlash.startsWith(prefix))) {
            console.warn('[IlluminatOS!] Remote filesystem command blocked — path outside allowed prefixes:', path);
            return;
        }

        try {
            switch (operation) {
                case 'write_file':
                    FileSystemManager.writeFile(path, String(content));
                    break;
                case 'delete_file':
                    FileSystemManager.deleteFile(path);
                    break;
                case 'create_directory':
                    FileSystemManager.createDirectory(path);
                    break;
                case 'delete_directory':
                    FileSystemManager.deleteDirectory(path, Boolean(recursive));
                    break;
                default:
                    console.warn('[IlluminatOS!] Unknown remote filesystem operation:', operation);
                    return;
            }
        } catch (err) {
            EventBus.emit('dialog:alert', {
                title: 'Remote Filesystem Command Failed',
                message: err?.message || String(err),
                icon: '⚠️'
            });
        }
    });

    EventBus.on('sse:system.default_filesystem.updated', () => {
        EventBus.emit('dialog:alert', {
            title: 'Default Filesystem Updated',
            message: 'Admin updated default filesystem config. It applies to new sessions.',
            icon: 'ℹ️'
        });
    });

    // ── Admin Command Center SSE handlers ───────────────────

    // System dialog: admin sends alert/confirm/prompt dialogs
    EventBus.on('sse:system.dialog', (payload = {}) => {
        const { type = 'alert', title, message, icon, defaultValue } = payload;
        if (type === 'confirm') {
            EventBus.emit('dialog:confirm', { title, message, icon });
        } else if (type === 'prompt') {
            EventBus.emit('dialog:prompt', { title, message, icon, defaultValue });
        } else {
            EventBus.emit('dialog:alert', { title: title || 'System Message', message, icon });
        }
    });

    // System notification: admin sends toast notifications
    EventBus.on('sse:system.notification', (payload = {}) => {
        EventBus.emit('notification:show', {
            title: payload.title || '',
            message: payload.message || '',
            type: payload.type || 'info',
            icon: payload.icon,
            duration: payload.duration,
            position: payload.position,
        });
    });

    // System sound: admin triggers sound effects
    EventBus.on('sse:system.sound', (payload = {}) => {
        const { sound, volume = 0.5 } = payload;
        if (sound) {
            EventBus.emit('sound:play', { sound, volume });
        }
    });

    // System media: admin can broadcast uploaded media URLs
    EventBus.on('sse:system.media', (payload = {}) => {
        const { mediaType, src, name } = payload;
        if (!src) return;
        if (mediaType === 'audio' || mediaType === 'video') {
            EventBus.emit('command:app:launch', { appName: 'mediaplayer', params: { src, name } });
            return;
        }
        if (mediaType === 'image') {
            EventBus.emit('command:app:launch', { appName: 'browser', params: { url: src } });
        }
    });

    // System effect: admin triggers visual effects
    EventBus.on('sse:system.effect', (payload = {}) => {
        const { effect } = payload;
        if (!effect) return;
        EventBus.emit('effect:trigger', { effect });
    });

    // Handle effect:trigger → apply the actual DOM effects
    EventBus.on('effect:trigger', ({ effect } = {}) => {
        if (!effect) return;
        handleAdminEffect(effect);
    });

    // System message: admin broadcasts text messages
    EventBus.on('sse:system.message', (payload = {}) => {
        const { message, level = 'info', icon } = payload;
        if (!message) return;
        EventBus.emit('notification:show', {
            title: 'System Message',
            message,
            type: level,
            icon: icon || (level === 'error' ? '❌' : level === 'warning' ? '⚠️' : level === 'success' ? '✅' : '📢'),
            duration: 8000,
        });
    });

    // Config changed: admin pushes config changes
    EventBus.on('sse:config.changed', (payload = {}) => {
        const { section, changes } = payload;
        if (section && changes) {
            EventBus.emit('config:update', { section, changes });
        }
    });

    // Narrative events: admin sends story/mood/character events
    EventBus.on('sse:narrative.story.advance', (p = {}) => EventBus.emit('narrative:event', { type: 'story.advance', ...p }));
    EventBus.on('sse:narrative.story.branch', (p = {}) => EventBus.emit('narrative:event', { type: 'story.branch', ...p }));
    EventBus.on('sse:narrative.story.reveal', (p = {}) => EventBus.emit('narrative:event', { type: 'story.reveal', ...p }));
    EventBus.on('sse:narrative.story.flashback', (p = {}) => EventBus.emit('narrative:event', { type: 'story.flashback', ...p }));
    EventBus.on('sse:narrative.mood.shift', (p = {}) => EventBus.emit('narrative:event', { type: 'mood.shift', ...p }));
    EventBus.on('sse:narrative.mood.glitch', (p = {}) => EventBus.emit('narrative:event', { type: 'mood.glitch', ...p }));
    EventBus.on('sse:narrative.mood.dream', (p = {}) => EventBus.emit('narrative:event', { type: 'mood.dream', ...p }));
    EventBus.on('sse:narrative.character.appear', (p = {}) => EventBus.emit('narrative:event', { type: 'character.appear', ...p }));
    EventBus.on('sse:narrative.character.speak', (p = {}) => {
        // Character speech can trigger a dialog or Clippy
        const name = p.characterName || 'Unknown';
        const icon = p.characterIcon || '💬';
        EventBus.emit('dialog:alert', {
            title: name,
            message: p.message || '',
            icon
        });
    });
    EventBus.on('sse:narrative.character.leave', (p = {}) => EventBus.emit('narrative:event', { type: 'character.leave', ...p }));
    EventBus.on('sse:narrative.world.unlock', (p = {}) => EventBus.emit('narrative:event', { type: 'world.unlock', ...p }));
    EventBus.on('sse:narrative.world.change', (p = {}) => EventBus.emit('narrative:event', { type: 'world.change', ...p }));
    EventBus.on('sse:narrative.world.timer', (p = {}) => EventBus.emit('narrative:event', { type: 'world.timer', ...p }));
    EventBus.on('sse:narrative.puzzle.hint', (p = {}) => {
        EventBus.emit('dialog:alert', {
            title: p.title || 'Hint',
            message: p.message || 'No hint available.',
            icon: '💡'
        });
    });
    EventBus.on('sse:narrative.puzzle.solve', (p = {}) => EventBus.emit('narrative:event', { type: 'puzzle.solve', ...p }));
    EventBus.on('sse:narrative.puzzle.new', (p = {}) => EventBus.emit('narrative:event', { type: 'puzzle.new', ...p }));
    EventBus.on('sse:narrative.custom', (p = {}) => EventBus.emit('narrative:event', { type: 'custom', ...p }));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+T = Terminal
        if (e.ctrlKey && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            AppRegistry.launch('terminal');
        }

        // Escape closes context menu and start menu
        if (e.key === 'Escape') {
            EventBus.emit(Events.CONTEXT_MENU_HIDE);
            const startMenu = document.getElementById('startMenu');
            if (startMenu && startMenu.classList.contains('active')) {
                EventBus.emit(Events.START_MENU_TOGGLE, { open: false });
            }
        }
    });

    // Prevent default context menu on body (except inputs)
    document.body.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('input, textarea')) {
            e.preventDefault();
        }
    });
}

/**
 * Show a dialog box
 */
function showDialog(message, icon = 'info') {
    const overlay = document.getElementById('dialogOverlay');
    const dialogIcon = document.getElementById('dialogIcon');
    const dialogText = document.getElementById('dialogText');
    const dialogOk = document.getElementById('dialogOk');

    if (!overlay || !dialogText || !dialogOk) return;

    const icons = {
        'info': 'i',
        'warning': '!',
        'error': 'X',
        'question': '?'
    };

    if (dialogIcon) {
        dialogIcon.textContent = icons[icon] || icons.info;
    }
    dialogText.textContent = message;
    overlay.classList.add('active');

    const closeDialog = () => {
        overlay.classList.remove('active');
        dialogOk.removeEventListener('click', closeDialog);
    };

    dialogOk.addEventListener('click', closeDialog);

    // Close on escape
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeDialog();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

/**
 * Show Blue Screen of Death
 */
function showBSOD() {
    const bsod = document.getElementById('bsod');
    if (bsod) {
        bsod.classList.add('active');

        // Any key to dismiss
        const dismissHandler = () => {
            bsod.classList.remove('active');
            document.removeEventListener('keydown', dismissHandler);
            document.removeEventListener('click', dismissHandler);
        };

        setTimeout(() => {
            document.addEventListener('keydown', dismissHandler);
            document.addEventListener('click', dismissHandler);
        }, 1000);
    }
}

/**
 * Handle admin-triggered visual effects from the Command Center.
 * Maps effect names to DOM manipulations.
 */
function handleAdminEffect(effect) {
    const desktop = document.getElementById('desktop');
    switch (effect) {
        // ── CRT ─────────────────────────────────

        case 'crt_on': {
            const crt = document.getElementById('crtOverlay');
            if (crt) { crt.classList.add('active'); crt.style.display = 'block'; }
            break;
        }
        case 'crt_off': {
            const crt = document.getElementById('crtOverlay');
            if (crt) { crt.classList.remove('active'); crt.style.display = 'none'; }
            break;
        }

        // ── Shake ───────────────────────────────
        case 'shake': {
            if (desktop) {
                desktop.classList.add('shake');
                setTimeout(() => desktop.classList.remove('shake'), 500);
            }
            break;
        }

        // ── Flash ───────────────────────────────
        case 'flash': {
            const overlay = document.getElementById('adminFlashOverlay');
            if (overlay) {
                overlay.classList.remove('active');
                // Force reflow so re-adding the class restarts the animation
                void overlay.offsetWidth;
                overlay.classList.add('active');
                overlay.addEventListener('animationend', () => overlay.classList.remove('active'), { once: true });
            }
            break;
        }

        // ── Invert Colors ───────────────────────
        case 'invert': {
            document.body.classList.add('admin-invert');
            setTimeout(() => document.body.classList.remove('admin-invert'), 3000);
            break;
        }

        // ── Matrix Rain ─────────────────────────
        case 'matrix': {
            startMatrixRain(8000);
            break;
        }

        // ── Scanlines ───────────────────────────
        case 'scanlines': {
            const sl = document.getElementById('adminScanlinesOverlay');
            if (sl) {
                sl.classList.add('active');
                setTimeout(() => sl.classList.remove('active'), 6000);
            }
            break;
        }

        // ── VHS Distortion ──────────────────────
        case 'vhs': {
            const vhs = document.getElementById('adminVhsOverlay');
            if (vhs) {
                vhs.classList.add('active');
                document.body.classList.add('admin-vhs-active');
                setTimeout(() => {
                    vhs.classList.remove('active');
                    document.body.classList.remove('admin-vhs-active');
                }, 5000);
            }
            break;
        }

        // ── Blue Screen of Death ────────────────
        case 'bsod': {
            showBSOD();
            break;
        }

        // ── Snow / Static ───────────────────────
        case 'snow': {
            startSnowStatic(5000);
            break;
        }

        // ── Confetti ────────────────────────────
        case 'confetti': {
            spawnConfetti(80);
            break;
        }

        // ── Fireworks ───────────────────────────
        case 'fireworks': {
            launchFireworks(5);
            break;
        }

        default:
            console.warn('[Effects] Unknown effect:', effect);
    }
}

/**
 * Render a Matrix digital rain effect on the overlay canvas.
 */
function startMatrixRain(durationMs) {
    const canvas = document.getElementById('adminMatrixOverlay');
    if (!canvas) return;
    canvas.classList.add('active');

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = new Array(columns).fill(1);
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';

    let animId;
    function draw() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f0';
        ctx.font = `${fontSize}px monospace`;

        for (let i = 0; i < drops.length; i++) {
            const char = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillText(char, i * fontSize, drops[i] * fontSize);
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
        animId = requestAnimationFrame(draw);
    }
    draw();

    setTimeout(() => {
        cancelAnimationFrame(animId);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.classList.remove('active');
    }, durationMs);
}

/**
 * Render TV snow / static noise on the overlay canvas.
 */
function startSnowStatic(durationMs) {
    const overlay = document.getElementById('adminSnowOverlay');
    if (!overlay) return;

    // Use a small offscreen canvas for the noise texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    overlay.classList.add('active');

    let animId;
    function draw() {
        const imageData = ctx.createImageData(canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const v = Math.random() * 255;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        overlay.style.backgroundImage = `url(${canvas.toDataURL()})`;
        overlay.style.backgroundSize = 'cover';
        animId = requestAnimationFrame(draw);
    }
    draw();

    setTimeout(() => {
        cancelAnimationFrame(animId);
        overlay.classList.remove('active');
        overlay.style.backgroundImage = '';
    }, durationMs);
}

/**
 * Spawn confetti pieces across the screen.
 */
function spawnConfetti(count) {
    const colors = ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff', '#ff8800', '#ff0088'];
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'admin-confetti-piece';
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.top = '-20px';
        piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDuration = (2 + Math.random() * 3) + 's';
        piece.style.animationDelay = (Math.random() * 1.5) + 's';
        piece.style.width = (6 + Math.random() * 8) + 'px';
        piece.style.height = (6 + Math.random() * 8) + 'px';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
        piece.addEventListener('animationend', () => piece.remove(), { once: true });
        fragment.appendChild(piece);
    }
    document.body.appendChild(fragment);
}

/**
 * Launch firework bursts at random positions.
 */
function launchFireworks(burstCount) {
    const colors = ['#ff4444', '#ffff44', '#44ff44', '#44ffff', '#ff44ff', '#ff8800', '#ffffff'];
    for (let b = 0; b < burstCount; b++) {
        setTimeout(() => {
            const cx = 10 + Math.random() * 80; // vw %
            const cy = 10 + Math.random() * 50; // vh %
            const color = colors[Math.floor(Math.random() * colors.length)];
            const particleCount = 20 + Math.floor(Math.random() * 20);
            const fragment = document.createDocumentFragment();

            for (let i = 0; i < particleCount; i++) {
                const angle = (Math.PI * 2 * i) / particleCount;
                const dist = 40 + Math.random() * 80;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist;

                const p = document.createElement('div');
                p.className = 'admin-firework';
                p.style.left = cx + 'vw';
                p.style.top = cy + 'vh';
                p.style.backgroundColor = color;
                p.style.boxShadow = `0 0 4px ${color}`;
                p.style.animation = `adminFireworkBurst ${0.6 + Math.random() * 0.6}s ease-out forwards`;
                // Move outward via translate set at start
                p.style.setProperty('--dx', dx + 'px');
                p.style.setProperty('--dy', dy + 'px');
                // Use a custom keyframe via inline style for direction
                p.animate([
                    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                    { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0 },
                ], { duration: 600 + Math.random() * 600, easing: 'ease-out', fill: 'forwards' });
                p.addEventListener('animationend', () => p.remove(), { once: true });
                // Fallback removal
                setTimeout(() => p.remove(), 2000);
                fragment.appendChild(p);
            }
            document.body.appendChild(fragment);
        }, b * 600);
    }
}

// === MAIN EXECUTION ===
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[IlluminatOS!] DOM Ready - Starting boot sequence');

    // Signal that the real boot sequence has started (stops fallback animation)
    window.bootSequenceStarted = true;

    // Create boot sequence
    const boot = new BootSequence();

    // Track initialization progress
    let initProgress = 0;
    let initTip = 'Starting up...';
    let initComplete = false;
    let initError = null;

    // Start boot animation IMMEDIATELY (don't wait for init)
    // This ensures users see progress even if init has issues
    const bootPromise = new Promise((resolve) => {
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            clearInterval(progressInterval);
            clearInterval(tipInterval);
        };

        const progressInterval = setInterval(() => {
            // Use actual init progress if available, otherwise animate slowly
            if (initComplete) {
                boot.progress = 100;
            } else if (initError) {
                cleanup();
                resolve();
                return;
            } else {
                // Smoothly animate towards init progress
                const targetProgress = Math.min(initProgress, 95); // Cap at 95% until init completes
                boot.progress = Math.min(boot.progress + 2, targetProgress);
            }

            if (boot.loadingFill) {
                boot.loadingFill.style.width = `${boot.progress}%`;
            }

            if (boot.progress >= 100) {
                cleanup();
                setTimeout(() => {
                    boot.complete();
                    resolve();
                }, 300);
            }
        }, 100);

        // Update tips from init progress
        const tipInterval = setInterval(() => {
            if (boot.bootTip && initTip) {
                boot.bootTip.textContent = initTip;
            }
        }, 200);
    });

    try {
        // Initialize OS with progress callbacks and timeout safety
        const INIT_TIMEOUT = 30000; // 30 seconds max for initialization

        const initPromise = initializeOS((progress, tip) => {
            initProgress = progress;
            initTip = tip;
        });

        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Initialization timed out after ${INIT_TIMEOUT/1000} seconds. Last progress: ${initProgress}% - "${initTip}"`));
            }, INIT_TIMEOUT);
        });

        // Race between init completing and timeout
        await Promise.race([initPromise, timeoutPromise]);
        clearTimeout(timeoutId);

        initComplete = true;

        // Wait for boot animation to finish
        await bootPromise;

        // Show login / welcome screen and wait for user choice
        console.log('[IlluminatOS!] Showing login screen...');
        const loginResult = await LoginScreen.show();
        console.log(`[IlluminatOS!] User logged in as: ${loginResult.username} (${loginResult.mode})`);

        // === Per-user storage isolation ===
        // Scope all storage by the logged-in user so each user gets their own
        // filesystem, desktop icons, settings, etc.
        StorageManager.setUserScope(loginResult.userUuid || loginResult.username);

        // For registered users on v2 backend, hydrate/sync scoped storage
        // with database snapshots for resilient cross-device persistence.
        await UserStateSync.initializeForLoggedInUser();

        // Re-initialize StateManager from user-scoped storage so each user
        // gets their own desktop icons, settings, achievements, etc.
        StateManager.initialize();

        // Reload the filesystem from user-scoped storage
        FileSystemManager.reloadForUser();

        // Re-sync filesystem with apps and desktop for this user
        const icons = StateManager.getState('icons');
        FileSystemManager.syncDesktopIcons(icons);
        const apps = AppRegistry.getAll();
        FileSystemManager.syncInstalledApps(apps);
        FileSystemManager.saveFileSystem();

        // Re-sync server files for this user
        if (getApiVersion() >= 2) {
            const synced = await FileSystemManager.syncServerFiles();
            if (synced > 0) {
                console.log(`[IlluminatOS!] Re-synced ${synced} server file(s) for user`);
            }
        }

        // Re-scan media (uses user-scoped filesystem now)
        MediaScanner.scanned = false; // Reset so it re-scans
        await MediaScanner.scan();

        // Store the user identity in state
        StateManager.setState('user.userName', loginResult.username, true);
        StateManager.setState('user.loginMode', loginResult.mode, true);

        // Announce login so subscribers (multiplayer, presence, plugins) can
        // initialize once the user is authenticated and storage is scoped.
        EventBus.emit(Events.USER_LOGIN, {
            username: loginResult.username,
            mode: loginResult.mode
        });

        // Re-apply user-specific settings (wallpaper, color scheme, etc.)
        applySettings();

        // === Multiplayer: Connect WebSocket after login ===
        if (getApiVersion() >= 2 && getSessionToken()) {
            try {
                MultiplayerClient.connect(getSessionToken());
                PresenceManager.initialize();

                // Wire up EventBus multiplayer bridge
                const SemanticEventBus = (await import('./core/SemanticEventBus.js')).default;
                SemanticEventBus.setMultiplayerBridge((eventName, payload, channel) => {
                    MultiplayerClient.send({
                        type: 'event',
                        payload: { eventName, data: payload, channel }
                    });
                });

                console.log('[IlluminatOS!] Multiplayer client initialized');
            } catch (mpErr) {
                console.warn('[IlluminatOS!] Multiplayer init failed (non-fatal):', mpErr);
            }
        }

        // Re-render desktop icons for this user
        DesktopRenderer.render();

        // Finalize desktop first so startup remains responsive even if autoexec
        // scripts perform slow operations.
        boot.finalizeDesktop();

        // Run autoexec AFTER user scope is active so filesystem writes land in
        // the logged-in user's virtual filesystem. Intentionally non-blocking.
        (async () => {
            try {
                const { runAutoexec } = await import('./core/script/AutoexecLoader.js');
                await runAutoexec({
                    FileSystemManager,
                    EventBus,
                    StateManager,
                    WindowManager
                });
            } catch (error) {
                // Autoexec errors should not prevent boot
                console.warn('[IlluminatOS!] Autoexec error (non-fatal):', error);
            }
        })();

        console.log('[IlluminatOS!] System ready!');
    } catch (error) {
        console.error('[IlluminatOS!] Boot failed with error:', error);
        initError = error;

        // Show error to user and allow recovery (safe DOM construction)
        const bootScreen = document.getElementById('bootScreen');
        if (bootScreen) {
            const osName = getConfig('branding.osName', 'IlluminatOS!');
            bootScreen.innerHTML = '';
            const container = document.createElement('div');
            container.style.cssText = 'color: white; text-align: center; padding: 20px; font-family: "Courier New", monospace;';

            const h2 = document.createElement('h2');
            h2.style.color = '#ff6b6b';
            h2.textContent = `⚠️ ${osName} Boot Error`;

            const p1 = document.createElement('p');
            p1.style.cssText = 'color: #aaa; margin: 15px 0;';
            p1.textContent = 'An error occurred during startup:';

            const pre = document.createElement('pre');
            pre.style.cssText = 'background: #1a1a1a; padding: 15px; margin: 15px auto; border-radius: 4px; text-align: left; max-width: 600px; overflow: auto; border: 1px solid #333; color: #ff6b6b; font-size: 12px; white-space: pre-wrap;';
            pre.textContent = error.message;

            const p2 = document.createElement('p');
            p2.style.cssText = 'color: #888; font-size: 12px; margin: 10px 0;';
            p2.textContent = 'Check browser console (F12) for full details';

            const btn1 = document.createElement('button');
            btn1.style.cssText = 'padding: 12px 24px; cursor: pointer; margin-top: 15px; background: #4a4a4a; color: white; border: 2px outset #666; font-size: 14px;';
            btn1.textContent = `🔄 Restart ${osName}`;
            btn1.addEventListener('click', () => location.reload());

            const btn2 = document.createElement('button');
            btn2.style.cssText = 'padding: 12px 24px; cursor: pointer; margin-top: 15px; margin-left: 10px; background: #8b0000; color: white; border: 2px outset #666; font-size: 14px;';
            btn2.textContent = '🗑️ Reset & Restart';
            btn2.addEventListener('click', () => { localStorage.clear(); location.reload(); });

            container.append(h2, p1, pre, p2, btn1, btn2);
            bootScreen.appendChild(container);
        }
    }
});
