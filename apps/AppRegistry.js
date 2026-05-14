/**
 * AppRegistry - Central registry for all applications
 * Manages app registration, launching, and querying
 *
 * TO ADD A NEW APP:
 * 1. Create your app file extending AppBase (see DEVELOPER_GUIDE.md)
 * 2. Include 'category' in your app's constructor config
 * 3. Import your app below
 * 4. Add to the appropriate section in initialize()
 *
 * Example:
 *   // In your app file:
 *   super({ id: 'myapp', name: 'My App', icon: '📱', category: 'accessories' });
 *
 *   // In initialize():
 *   this.register(new MyApp());  // Category is auto-detected from app config!
 */

import EventBus, { Events } from '../core/EventBus.js';
import { CATEGORIES } from '../core/Constants.js';
import WindowManager from '../core/WindowManager.js';
import { getConfig } from '../core/ConfigLoader.js';

// --- App Imports ---
import Calculator from './Calculator.js';
import Notepad from './Notepad.js';
import Terminal from './Terminal.js';
import Paint from './Paint.js';
import Minesweeper from './Minesweeper.js';
import Snake from './Snake.js';
import Asteroids from './Asteroids.js';
import Doom from './Doom.js';
import Solitaire from './Solitaire.js';
import MediaPlayer from './MediaPlayer.js';
import Browser from './Browser.js';
import ControlPanel from './ControlPanel.js';
import AdminPanel from './AdminPanel.js';
import MyComputer from './MyComputer.js';
import RecycleBin from './RecycleBin.js';
import Defrag from './Defrag.js';
import SkiFree from './SkiFree.js';
import ChatRoom from './ChatRoom.js';
import Phone from './Phone.js';
import InstantMessenger from './InstantMessenger.js';
import TaskManager from './TaskManager.js';
import DisplayProperties from './DisplayProperties.js';
import SoundSettings from './SoundSettings.js';
import FindFiles from './FindFiles.js';
import HelpSystem from './HelpSystem.js';
import Calendar from './Calendar.js';
import Clock from './Clock.js';
import FreeCell from './FreeCell.js';
import Zork from './Zork.js';
import Tetris from './Tetris.js';
import HyperCard from './HyperCard.js';
import FeaturesSettings from './FeaturesSettings.js';
import ScriptRunner from './ScriptRunner.js';
import RunDialog from './RunDialog.js';
import Inbox from './Inbox.js';
import CampaignStudio from './CampaignStudio.js';
import TimelineEditor from './TimelineEditor.js';
import ShowrunnerConsole from './ShowrunnerConsole.js';
import AnalyticsDashboard from './AnalyticsDashboard.js';
import GameLobby from './GameLobby.js';
import BonziBuddy from './BonziBuddy.js';
import DOSBox from './DOSBox.js';
import C64 from './C64.js';
// --- System App Placeholders (Simple implementations for completeness) ---
import AppBase from './AppBase.js';

class SimpleApp extends AppBase {
    constructor(id, name, icon, content, category = 'system', showInMenu = false) {
        super({ id, name, icon, width: 400, height: 300, category, showInMenu });
        this.content = content;
    }
    onOpen() {
        return `<div style="padding:20px;">${this.content || 'Coming soon...'}</div>`;
    }
}

/**
 * DialogApp — lightweight app entry that doesn't open a window.
 * Used for system actions (shutdown, etc.) where SystemDialogs handles the UI
 * via the app:open event emitted by AppRegistry.launch().
 */
class DialogApp extends AppBase {
    constructor(id, name, icon) {
        super({ id, name, icon, category: 'system', showInMenu: false, singleton: true });
    }
    launch() {
        // No-op — don't create a window. AppRegistry.launch() emits app:open
        // which SystemDialogs listens for to show the appropriate dialog.
    }
    onOpen() { return ''; }
}

class AppRegistryClass {
    constructor() {
        this.apps = new Map();
        this.metadata = new Map();

        // Debug logging flag — set to true for verbose output
        this.debug = false;
    }

    /**
     * Log a message if debug mode is enabled
     * @param  {...any} args - Arguments to pass to console.log
     */
    _log(...args) {
        if (this.debug) {
            console.log(...args);
        }
    }

    /**
     * Register an application
     * Apps can specify category and showInMenu in their constructor config,
     * eliminating the need to pass these as metadata.
     *
     * @param {AppBase} app - App instance
     * @param {Object} meta - Optional additional metadata (overrides app config)
     */
    register(app, meta = {}) {
        if (this.apps.has(app.id)) {
            console.warn(`[AppRegistry] App "${app.id}" already registered`);
            return false;
        }

        this.apps.set(app.id, app);

        // Build metadata - app config takes precedence, meta can override
        const appConfig = app.config || {};
        this.metadata.set(app.id, {
            id: app.id,
            name: app.name,
            icon: app.icon,
            // Category: check app.category, then app.config.category, then meta, then default
            category: app.category || appConfig.category || meta.category || CATEGORIES.ACCESSORIES,
            // showInMenu: check app.showInMenu, then app.config.showInMenu, then meta, then default true
            showInMenu: app.showInMenu !== undefined ? app.showInMenu :
                       (appConfig.showInMenu !== undefined ? appConfig.showInMenu :
                       (meta.showInMenu !== undefined ? meta.showInMenu : true)),
            // Include any extra metadata
            ...meta
        });

        EventBus.emit(Events.APP_REGISTERED, {
            appId: app.id,
            name: app.name,
            category: this.metadata.get(app.id).category,
            scripting: {
                baseline: true,
                transport: 'command/query event bus'
            }
        });

        this._log(`[AppRegistry] Registered: ${app.name} (${app.id}) [${this.metadata.get(app.id).category}]`);
        return true;
    }

    /**
     * Unregister an application (for plugin unload/hot-reload)
     * Closes the app if running, then removes from registry.
     * @param {string} appId - App ID to unregister
     */
    unregister(appId) {
        const app = this.apps.get(appId);
        if (!app) {
            console.warn(`[AppRegistry] Cannot unregister "${appId}" - not found`);
            return;
        }

        // Close all windows of the app (not just the current one)
        try {
            if (typeof app.closeAll === 'function') {
                app.closeAll();
            } else if (typeof app.close === 'function') {
                app.close();
            }
        } catch (error) {
            console.warn(`[AppRegistry] Error closing "${appId}" during unregister:`, error);
        }

        this.apps.delete(appId);
        this.metadata.delete(appId);
        console.log(`[AppRegistry] Unregistered: ${app.name} (${appId})`);
    }

    /**
     * Batch register multiple apps at once
     * @param {AppBase[]} apps - Array of app instances
     */
    registerAll(apps) {
        apps.forEach(app => this.register(app));
    }

    /**
     * Initialize and register all core apps
     * Apps are grouped by category for organization, but category is
     * determined from the app's own config, not the section it's in.
     */
    initialize() {
        // --- Accessories (Productivity Tools) ---
        this.registerAll([
            new Calculator(),
            new Notepad(),
            new Paint(),
            new Calendar(),
            new Clock(),
            new HyperCard(),
        ]);

        // --- System Tools (Utilities) ---
        this.registerAll([
            new Terminal(),
            new Defrag(),
            new TaskManager(),
            new ScriptRunner(),
            new CampaignStudio(),
            new TimelineEditor(),
            new ShowrunnerConsole(),
            new AnalyticsDashboard(),
        ]);

        // --- Games ---
        this.registerAll([
            new Minesweeper(),
            new Snake(),
            new Asteroids(),
            new Doom(),
            new Solitaire(),
            new FreeCell(),
            new SkiFree(),
            new Zork(),
            new Tetris(),
            new DOSBox(),
            new C64(),
        ]);

        // --- Multimedia ---
        this.registerAll([
            new MediaPlayer(),
        ]);

        // --- Internet & Communication ---
        this.registerAll([
            new Browser(),
            new ChatRoom(),
            new Phone(),
            new InstantMessenger(),
            new Inbox(),
            new GameLobby(),
            new BonziBuddy(),
        ]);

        // --- System Apps (category and showInMenu set in app config) ---
        this.registerAll([
            new MyComputer(),
            new RecycleBin(),
            new AdminPanel(),
        ]);

        // --- Settings ---
        // Register each settings app individually with error handling
        // to identify if any fail to load
        this._log('[AppRegistry] Registering Settings apps...');

        const failedApps = [];

        try { this.register(new ControlPanel()); }
        catch (e) { console.error('[AppRegistry] FAILED: ControlPanel:', e); failedApps.push('ControlPanel'); }

        try { this.register(new DisplayProperties()); }
        catch (e) { console.error('[AppRegistry] FAILED: DisplayProperties:', e); failedApps.push('DisplayProperties'); }

        try { this.register(new SoundSettings()); }
        catch (e) { console.error('[AppRegistry] FAILED: SoundSettings:', e); failedApps.push('SoundSettings'); }

        try {
            this._log('[AppRegistry] Creating FeaturesSettings...');
            const fs = new FeaturesSettings();
            this._log('[AppRegistry] FeaturesSettings created successfully:', fs.id);
            this.register(fs);
        } catch (e) {
            console.error('[AppRegistry] FAILED: FeaturesSettings:', e);
            console.error('[AppRegistry] FeaturesSettings error stack:', e.stack);
            failedApps.push('FeaturesSettings');
        }

        // --- Hidden System Apps ---
        this.registerAll([
            new FindFiles(),
            new HelpSystem(),
            new RunDialog(),
            new DialogApp('shutdown', 'Shut Down', '⏻'),
        ]);

        this._log(`[AppRegistry] Initialized with ${this.apps.size} apps`);

        // Emit health warning if any apps failed to register
        if (failedApps.length > 0) {
            console.warn(`[AppRegistry] ${failedApps.length} app(s) failed to register: ${failedApps.join(', ')}`);
            EventBus.emit(Events.SYSTEM_HEALTH_WARNING, {
                source: 'AppRegistry',
                message: `${failedApps.length} app(s) failed to register`,
                failedApps
            });
        }
    }

    /**
     * Get an app instance by ID
     * @param {string} appId - App ID
     * @returns {AppBase|undefined} App instance
     */
    get(appId) {
        return this.apps.get(appId);
    }

    /**
     * Check if an app is disabled via admin config (apps.disabledApps)
     * @param {string} appId - App ID
     * @returns {boolean} True if the app is disabled
     */
    isDisabled(appId) {
        const disabledApps = getConfig('apps.disabledApps', []);
        return Array.isArray(disabledApps) && disabledApps.includes(appId);
    }

    /**
     * Launch an application with comprehensive error handling
     * Implements Windows 95-style behavior:
     * - If app is already open and minimized, restore it instead of creating a new window
     * - If opening a file that's already open in an existing window, restore that window
     *
     * @param {string} appId - App ID to launch
     * @param {object} params - Launch parameters (e.g., { filePath: [...] } for file-based apps)
     * @returns {boolean} True if launch succeeded, false otherwise
     */
    launch(appId, params = {}) {
        // Validate input
        if (!appId || typeof appId !== 'string') {
            console.error('[AppRegistry] Invalid appId:', appId);
            EventBus.emit(Events.APP_LAUNCH_ERROR, {
                appId: String(appId),
                error: 'Invalid app ID',
                type: 'validation'
            });
            return false;
        }

        const app = this.apps.get(appId);

        if (!app) {
            console.error(`[AppRegistry] Unknown app: ${appId}`);
            EventBus.emit(Events.APP_LAUNCH_ERROR, {
                appId,
                error: 'App not found',
                type: 'not_found'
            });
            EventBus.emit('dialog:alert', {
                message: `Cannot find application: ${appId}`,
                title: 'Application Not Found',
                icon: 'error'
            });
            return false;
        }

        // Check if app is disabled by admin config
        if (this.isDisabled(appId)) {
            console.warn(`[AppRegistry] App "${appId}" is disabled by admin configuration`);
            EventBus.emit('dialog:alert', {
                message: `${app.name} has been disabled by the system administrator.`,
                title: 'Application Disabled',
                icon: 'warning'
            });
            return false;
        }

        try {
            // Windows 95 behavior: Check if this file is already open in an existing window
            // This handles cases like double-clicking a .txt file when it's already open in Notepad
            if (params && params.filePath && Array.isArray(params.filePath)) {
                const existingWindowId = app.findWindowWithFile(params.filePath);
                if (existingWindowId) {
                    console.log(`[AppRegistry] File already open in window ${existingWindowId}, restoring...`);
                    WindowManager.focus(existingWindowId); // Will restore if minimized
                    return true;
                }
            }

            // Set parameters if provided
            if (params && typeof params === 'object') {
                if (typeof app.setParams === 'function') {
                    try {
                        app.setParams(params);
                    } catch (paramError) {
                        console.warn(`[AppRegistry] Error setting params for ${appId}:`, paramError);
                        // Continue anyway - params are optional
                    }
                }
            }

            // Launch the app (this is the critical operation)
            // Note: AppBase.launch() already handles singleton apps by focusing existing window
            // and calling onRelaunch() if params are provided
            if (typeof app.launch !== 'function') {
                throw new Error(`App ${appId} does not have a launch() method`);
            }

            app.launch();

            // Emit success event
            EventBus.emit('app:open', {
                appId: appId,
                windowId: app.windowId,
                instance: app.instanceCounter - 1,
                timestamp: Date.now()
            });

            this._log(`[AppRegistry] Successfully launched ${app.name} (${appId})`);
            return true;

        } catch (error) {
            // Comprehensive error logging
            console.error(`[AppRegistry] Failed to launch ${appId}:`, error);
            console.error('[AppRegistry] Error stack:', error.stack);

            // Emit semantic event for error tracking
            EventBus.emit(Events.APP_LAUNCH_ERROR, {
                appId,
                appName: app.name,
                error: error.message,
                stack: error.stack,
                type: 'launch_failed',
                timestamp: Date.now()
            });

            // Show user-friendly error dialog
            EventBus.emit('dialog:alert', {
                message: `Failed to open ${app.name}:\n\n${error.message}`,
                title: 'Application Error',
                icon: 'error'
            });

            return false;
        }
    }

    /**
     * Close an application
     * @param {string} appId - App ID to close
     * @returns {boolean} True if close succeeded, false otherwise
     */
    close(appId) {
        if (!appId || typeof appId !== 'string') {
            console.error('[AppRegistry] Invalid appId for close:', appId);
            return false;
        }

        const app = this.apps.get(appId);
        if (!app) {
            console.warn(`[AppRegistry] Cannot close unknown app: ${appId}`);
            return false;
        }

        try {
            if (typeof app.close === 'function') {
                app.close();
            }
            EventBus.emit('app:close', {
                id: appId,
                timestamp: Date.now()
            });
            return true;
        } catch (error) {
            console.error(`[AppRegistry] Error closing ${appId}:`, error);
            EventBus.emit(Events.APP_CLOSE_ERROR, {
                appId,
                error: error.message,
                timestamp: Date.now()
            });
            return false;
        }
    }

    /**
     * Get all registered app metadata (excludes admin-disabled apps)
     */
    getAll() {
        const disabledApps = getConfig('apps.disabledApps', []);
        return Array.from(this.metadata.values())
            .filter(m => !Array.isArray(disabledApps) || !disabledApps.includes(m.id));
    }

    /**
     * Get apps by category (excludes admin-disabled apps)
     */
    getByCategory(category) {
        const all = this.getAll();
        const filtered = all.filter(m => m.category === category);
        this._log(`[AppRegistry] getByCategory('${category}'):`, filtered);
        return filtered;
    }
}

// Singleton instance
const AppRegistry = new AppRegistryClass();

if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.appRegistry = AppRegistry;
}

// NOTE: Do NOT auto-initialize here! This runs outside error handling.
// Initialization is now called explicitly from index.js inside the try-catch block.
// AppRegistry.initialize();

export default AppRegistry;
