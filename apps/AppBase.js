/**
 * AppBase - Base class for all applications
 * Provides common functionality and lifecycle methods
 *
 * MULTI-INSTANCE SUPPORT:
 * All helper methods automatically scope to the current window context.
 * Apps don't need to track windowIds - just use this.getElement(), this.setState(), etc.
 *
 * Apps extend this class and implement:
 *   - onOpen(): Return HTML content
 *   - onClose(): Cleanup (optional)
 *   - onFocus(): Handle focus (optional)
 *   - onBlur(): Handle blur (optional)
 *   - onMount(): Post-render initialization (optional)
 *
 * Events emitted:
 *   - app:launch - When app starts launching
 *   - app:ready - When app is mounted and ready
 *   - app:focus - When app window gains focus
 *   - app:blur - When app window loses focus
 *   - app:close - When app window closes
 *   - app:state:change - When app instance state changes
 *   - app:error - When an error occurs in the app
 *   - app:message - When app sends message to another app
 *   - app:broadcast - When app broadcasts to all apps
 */

import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import WindowManager from '../core/WindowManager.js';
import { escapeHtml, escAttr } from '../core/Sanitize.js';
import SubscriptionManager from '../core/SubscriptionManager.js';

class AppBase {
    /**
     * Create an app instance
     * @param {Object} config - App configuration
     */
    constructor(config) {
        this.config = { ...config };
        this.id = config.id;
        this.name = config.name;
        this.icon = config.icon || '📄';
        this.width = config.width || 500;
        this.height = config.height || 'auto';
        this.resizable = config.resizable !== false;
        this.singleton = config.singleton === true; // Default: allow multiple instances

        // Menu/category properties (used by AppRegistry for Start Menu)
        this.category = config.category || 'accessories';
        this.showInMenu = config.showInMenu !== false;

        // Runtime state - track all open instances
        this.openWindows = new Map(); // windowId -> { state, boundHandlers, eventUnsubscribers }
        this.instanceCounter = 0;

        // Current window context - automatically set before lifecycle calls
        // This allows getElement(), instanceState(), etc. to work without passing windowId
        this._currentWindowId = null;

        // Pending launch parameters (set via setParams, consumed on next launch)
        this._pendingParams = null;

        // Legacy support for single-window apps
        this.windowId = null;
        this.isOpen = false;

        // Track event unsubscribers registered outside any window context (e.g. in constructor).
        // These are cleaned up when the last window closes.
        this._globalEventUnsubscribers = [];

        // Tracks which of this app's windows currently hold OS focus. Apps
        // that register document-level keyboard listeners should gate their
        // handlers with `if (!this.isFocused()) return;` so a Tetris piece
        // doesn't move while you're typing in Notepad.
        this._focusedWindowIds = new Set();

        // Serialize command handlers to prevent _currentWindowId context races
        // when multiple script commands are emitted close together.
        this._commandExecutionChain = Promise.resolve();

        // Safety timeout for queued command handlers.
        // Prevents one hung command from permanently blocking every subsequent command.
        this.commandHandlerTimeoutMs = Number(config.commandHandlerTimeoutMs) > 0
            ? Number(config.commandHandlerTimeoutMs)
            : 10000;
    }

    /**
     * Execute a function with a timeout so command queue processing can't deadlock.
     * @private
     * @param {Function} work - async/sync function
     * @param {string} action - command action name
     */
    async _runWithCommandTimeout(work, action) {
        const timeoutMs = this.commandHandlerTimeoutMs;
        if (!timeoutMs || timeoutMs <= 0) {
            return work();
        }

        let timerId;
        try {
            return await Promise.race([
                Promise.resolve().then(work),
                new Promise((_, reject) => {
                    timerId = setTimeout(() => {
                        reject(new Error(`Command '${action}' timed out after ${timeoutMs}ms`));
                    }, timeoutMs);
                })
            ]);
        } finally {
            if (timerId) {
                clearTimeout(timerId);
            }
        }
    }

    /**
     * Set parameters to be passed to onOpen() on next launch
     * @param {Object} params - Parameters for the app
     */
    setParams(params) {
        this._pendingParams = params;
    }

    // ===== LIFECYCLE METHODS (Override in subclass) =====

    /**
     * Called when app opens - return HTML content
     * @returns {string} HTML content for window
     */
    onOpen() {
        return '<div>Override onOpen() in your app</div>';
    }

    /**
     * Called after window is created and in DOM
     * Use for initializing canvas, adding event listeners, etc.
     * Note: All helper methods (getElement, addHandler, etc.) automatically
     * target the correct window - no need to track windowId!
     */
    onMount() {
        // Override for post-render initialization
    }

    /**
     * Called when window gains focus
     */
    onFocus() {
        // Override if needed
    }

    /**
     * Called when window loses focus
     */
    onBlur() {
        // Override if needed
    }

    /**
     * Called when window is resized
     * @param {Object} dimensions - New dimensions {width, height}
     */
    onResize(dimensions) {
        // Override if needed
    }

    /**
     * Called when app closes - cleanup resources
     */
    onClose() {
        // Override for cleanup
    }

    /**
     * Called when a singleton app is re-launched while already open
     * Override to handle new parameters (e.g., navigate to a new path)
     * @param {Object} params - New parameters passed to launch
     */
    onRelaunch(params) {
        // Override in subclass to handle re-launch with new params
    }

    /**
     * Whether any window of this app currently holds OS focus.
     * Use this from document-level keyboard listeners so they only
     * fire when the user is actually interacting with this app:
     *
     *   this.addHandler(document, 'keydown', (e) => {
     *       if (!this.isFocused()) return;
     *       // ...handle key
     *   });
     *
     * @param {string} [windowId] - Optional: check focus for a specific
     *                               window instance only.
     * @returns {boolean}
     */
    isFocused(windowId = null) {
        if (windowId) return this._focusedWindowIds.has(windowId);
        return this._focusedWindowIds.size > 0;
    }

    /**
     * Get the file path currently open in a specific window
     * Override in file-based apps (Notepad, Paint, etc.) to enable
     * the "restore existing window" behavior when opening files
     * @param {string} windowId - The window ID to check
     * @returns {string[]|null} File path array or null if no file open
     */
    getOpenFilePath(windowId) {
        const instanceData = this.openWindows.get(windowId);
        if (instanceData && instanceData.state.currentFile) {
            return instanceData.state.currentFile;
        }
        return null;
    }

    /**
     * Find a window that has a specific file open
     * @param {string[]} filePath - File path to search for
     * @returns {string|null} Window ID if found, null otherwise
     */
    findWindowWithFile(filePath) {
        if (!filePath || !Array.isArray(filePath)) return null;

        const filePathStr = JSON.stringify(filePath);
        for (const [windowId, instanceData] of this.openWindows.entries()) {
            const openFile = instanceData.state.currentFile;
            if (openFile && JSON.stringify(openFile) === filePathStr) {
                return windowId;
            }
        }
        return null;
    }

    // ===== PUBLIC API =====

    /**
     * Launch the application
     */
    launch() {
        // Check singleton - only focus if singleton AND already has open windows
        if (this.singleton && this.openWindows.size > 0) {
            const firstWindowId = this.openWindows.keys().next().value;
            WindowManager.focus(firstWindowId);

            // Call onRelaunch with new params if provided (e.g., navigate to new path)
            if (this._pendingParams && Object.keys(this._pendingParams).length > 0) {
                this._currentWindowId = firstWindowId;
                try {
                    this.onRelaunch(this._pendingParams);
                } catch (error) {
                    EventBus.emit(Events.APP_ERROR, {
                        appId: this.id,
                        windowId: firstWindowId,
                        error: error.message,
                        stack: error.stack
                    });
                }
            }

            // Clear pending params
            this._pendingParams = null;
            return;
        }

        // Generate unique window ID for this instance
        this.instanceCounter++;
        const windowId = this.singleton ? this.id : `${this.id}-${this.instanceCounter}`;

        // Emit app launch event
        EventBus.emit(Events.APP_LAUNCH, {
            appId: this.id,
            windowId: windowId,
            singleton: this.singleton
        });

        // Set context BEFORE calling onOpen so it can use helpers if needed
        this._currentWindowId = windowId;

        // Initialize instance data structure
        this.openWindows.set(windowId, {
            state: {},                    // Per-instance state storage
            boundHandlers: new Map(),     // DOM event handlers for cleanup
            eventUnsubscribers: [],       // EventBus subscriptions for cleanup
            coreScriptApiRegistered: false
        });

        // Get content from subclass, passing any pending parameters
        const params = this._pendingParams || {};
        this._pendingParams = null; // Clear params after use

        let content;
        try {
            // SubscriptionManager.runAs binds any EventBus.on() / StateManager.subscribe()
            // calls inside onOpen() to this window's ID, so they auto-clean on close
            // even if the app didn't use this.onEvent() / this.subscribe() helpers.
            content = SubscriptionManager.runAs(windowId, () => this.onOpen(params));
        } catch (error) {
            EventBus.emit(Events.APP_ERROR, {
                appId: this.id,
                windowId: windowId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }

        // Create window with unique ID
        const windowEl = WindowManager.create({
            id: windowId,
            title: this.name,
            icon: this.icon,
            content,
            width: this.width,
            height: this.height,
            resizable: this.resizable,
            onClose: () => this.handleClose(windowId)
        });

        // Legacy support
        this.windowId = windowId;
        this.isOpen = true;

        // Setup focus/blur tracking for this window
        this.setupFocusTracking(windowId);

        // Setup resize tracking for this window
        this.setupResizeTracking(windowId);

        // Call mount hook after slight delay (let DOM render)
        setTimeout(() => {
            // Guard: if the window was closed before this timeout fired, skip mount
            if (!this.openWindows.has(windowId)) return;

            // Save and restore context to avoid corrupting another window's context
            const prevWindowId = this._currentWindowId;
            this._currentWindowId = windowId;
            try {
                // Bind subscriptions created in onMount to this window's ID
                // so they get cleaned up automatically on close, even if
                // the app bypasses the AppBase helper methods.
                SubscriptionManager.runAs(windowId, () => {
                    this.registerCoreScriptApi();
                    this.onMount();
                });
                // Emit app ready event after mount completes
                EventBus.emit(Events.APP_READY, {
                    appId: this.id,
                    windowId: windowId
                });
            } catch (error) {
                EventBus.emit(Events.APP_ERROR, {
                    appId: this.id,
                    windowId: windowId,
                    error: error.message,
                    stack: error.stack
                });
            } finally {
                // Restore previous context if another window was active
                if (prevWindowId !== windowId && this.openWindows.has(prevWindowId)) {
                    this._currentWindowId = prevWindowId;
                }
            }
        }, 50);
    }

    /**
     * Close the application (closes current context window, or specific windowId)
     * @param {string} [windowId] - Optional specific window to close
     */
    close(windowId) {
        const targetId = windowId || this._currentWindowId || this.windowId;
        if (targetId) {
            WindowManager.close(targetId);
        }
    }

    /**
     * Close all windows of this app
     */
    closeAll() {
        // Snapshot keys to avoid mutating the Map during iteration
        const windowIds = [...this.openWindows.keys()];
        for (const wid of windowIds) {
            WindowManager.close(wid);
        }
    }

    /**
     * Handle window close (called by WindowManager)
     * @param {string} windowId - The window ID being closed
     */
    handleClose(windowId) {
        // Set context for onClose
        this._currentWindowId = windowId;

        // Get instance data
        const instanceData = this.openWindows.get(windowId);

        // Cleanup bound handlers for this specific window
        if (instanceData) {
            // Clean up DOM event handlers
            if (instanceData.boundHandlers) {
                instanceData.boundHandlers.forEach((handlers, target) => {
                    handlers.forEach(({ event, handler, options }) => {
                        target.removeEventListener(event, handler, options);
                    });
                });
            }

            // Clean up EventBus subscriptions
            if (instanceData.eventUnsubscribers) {
                instanceData.eventUnsubscribers.forEach(unsub => unsub());
            }
        }

        // Call subclass cleanup
        try {
            this.onClose();
        } catch (error) {
            EventBus.emit(Events.APP_ERROR, {
                appId: this.id,
                windowId: windowId,
                error: error.message,
                stack: error.stack
            });
        }

        // Emit app close event
        EventBus.emit(Events.APP_CLOSE, {
            appId: this.id,
            windowId: windowId
        });

        // Remove from tracked windows
        this.openWindows.delete(windowId);

        // Drop the focus flag so document-level key handlers gated on
        // isFocused() don't keep firing after the window is gone. A
        // window can be closed while focused (e.g. Ctrl+W) and no blur
        // event is dispatched in that path.
        this._focusedWindowIds.delete(windowId);

        // Release any subscriptions that were tracked against this window
        // by SubscriptionManager (i.e. raw EventBus.on() / StateManager.subscribe()
        // calls made inside onOpen/onMount that bypassed the AppBase helpers).
        SubscriptionManager.unsubscribeAll(windowId);

        // Update legacy properties
        if (this.openWindows.size === 0) {
            this.isOpen = false;
            this.windowId = null;
            this._currentWindowId = null;

            // Clean up global event subscriptions registered outside any window context
            this._globalEventUnsubscribers.forEach(unsub => unsub());
            this._globalEventUnsubscribers = [];

            // Release any subscriptions tracked against the app ID itself
            // (e.g. constructor-time registrations).
            SubscriptionManager.unsubscribeAll(this.id);
        } else {
            // Set windowId to another open window
            this.windowId = this.openWindows.keys().next().value;
            this._currentWindowId = this.windowId;
        }
    }

    // ===== INSTANCE STATE MANAGEMENT =====
    // These methods store state per-window, so multiple instances don't conflict

    /**
     * Get instance-specific state value
     * @param {string} key - State key
     * @param {*} defaultValue - Default if not set
     * @returns {*} The state value
     */
    getInstanceState(key, defaultValue = undefined) {
        const windowId = this._currentWindowId;
        const instanceData = this.openWindows.get(windowId);
        if (!instanceData) return defaultValue;
        return key in instanceData.state ? instanceData.state[key] : defaultValue;
    }

    /**
     * Set instance-specific state value
     * @param {string} key - State key
     * @param {*} value - Value to set
     * @param {boolean} emitEvent - Whether to emit state change event (default: true)
     */
    setInstanceState(key, value, emitEvent = true) {
        const windowId = this._currentWindowId;
        const instanceData = this.openWindows.get(windowId);
        if (instanceData) {
            const oldValue = instanceData.state[key];
            instanceData.state[key] = value;

            // Emit state change event if value changed
            if (emitEvent && oldValue !== value) {
                EventBus.emit(Events.APP_STATE_CHANGE, {
                    appId: this.id,
                    windowId: windowId,
                    key,
                    value,
                    oldValue
                });
            }
        }
    }

    /**
     * Get all instance state as an object
     * @returns {Object} The instance state object
     */
    getAllInstanceState() {
        const windowId = this._currentWindowId;
        const instanceData = this.openWindows.get(windowId);
        return instanceData ? { ...instanceData.state } : {};
    }

    /**
     * Update multiple instance state values at once
     * @param {Object} updates - Object of key-value pairs to update
     */
    updateInstanceState(updates) {
        const windowId = this._currentWindowId;
        const instanceData = this.openWindows.get(windowId);
        if (instanceData) {
            Object.assign(instanceData.state, updates);
        }
    }

    // ===== DOM HELPER METHODS =====
    // All automatically scoped to current window context

    /**
     * Get the window element for current context
     * @returns {HTMLElement|null}
     */
    getWindow() {
        const id = this._currentWindowId;
        return id ? document.getElementById(`window-${id}`) : null;
    }

    /**
     * Get element within current window by selector
     * @param {string} [selector] - CSS selector (optional, returns content if omitted)
     * @returns {HTMLElement|null}
     */
    getElement(selector) {
        const windowEl = this.getWindow();
        if (!windowEl) return null;

        if (!selector) {
            return windowEl.querySelector('.window-content');
        }

        return windowEl.querySelector(selector);
    }

    /**
     * Get all elements within current window by selector
     * @param {string} selector - CSS selector
     * @returns {NodeList}
     */
    getElements(selector) {
        const windowEl = this.getWindow();
        return windowEl ? windowEl.querySelectorAll(selector) : [];
    }

    /**
     * Update window content.
     *
     * Releases any DOM listeners registered via `addHandler()` whose target
     * lives inside (or is) the `.window-content` subtree before swapping the
     * HTML. Window-level / document-level / window-object listeners are kept
     * — they outlive content swaps by design.
     *
     * @param {string} html - New HTML content
     */
    setContent(html) {
        const windowEl = this.getWindow();
        const content = windowEl?.querySelector('.window-content');
        if (!content) return;

        const instanceData = this.openWindows.get(this._currentWindowId);
        if (instanceData?.boundHandlers) {
            for (const [target, handlers] of instanceData.boundHandlers) {
                const inSubtree =
                    target === content ||
                    (content.contains && target instanceof Node && content.contains(target));
                if (!inSubtree) continue;
                for (const { event, handler, options } of handlers) {
                    try { target.removeEventListener(event, handler, options); } catch (_) { /* detached */ }
                }
                instanceData.boundHandlers.delete(target);
            }
        }

        content.innerHTML = html;
        this.onMount(); // Re-run mount for new content
    }

    /**
     * Get the current window ID (for advanced use cases)
     * @returns {string|null}
     */
    getCurrentWindowId() {
        return this._currentWindowId;
    }

    // ===== EVENT HANDLING =====

    /**
     * Add event listener with automatic cleanup when window closes
     * @param {HTMLElement|Document|Window} target - Event target
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - Event options
     */
    addHandler(target, event, handler, options = {}) {
        const windowId = this._currentWindowId;
        const instanceData = this.openWindows.get(windowId);
        if (!instanceData) return;

        // Bind handler to this app instance AND capture windowId in closure
        const capturedWindowId = windowId;
        const boundHandler = (...args) => {
            // Set context before calling handler
            this._currentWindowId = capturedWindowId;
            return handler.call(this, ...args);
        };

        target.addEventListener(event, boundHandler, options);

        // Track for cleanup
        if (!instanceData.boundHandlers.has(target)) {
            instanceData.boundHandlers.set(target, []);
        }
        instanceData.boundHandlers.get(target).push({ event, handler: boundHandler, options });
    }

    /**
     * Subscribe to EventBus event with automatic cleanup
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    onEvent(event, handler) {
        const windowId = this._currentWindowId;
        const instanceData = this.openWindows.get(windowId);
        if (!instanceData) return;

        const capturedWindowId = windowId;
        const boundHandler = (...args) => {
            this._currentWindowId = capturedWindowId;
            return handler.call(this, ...args);
        };

        const unsubscribe = EventBus.on(event, boundHandler);
        instanceData.eventUnsubscribers.push(unsubscribe);
        return unsubscribe;
    }

    /**
     * Emit an event through the event bus
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        EventBus.emit(event, data);
    }

    /**
     * Subscribe to an event (legacy - prefer onEvent for auto-cleanup)
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
        return EventBus.on(event, handler);
    }

    // ===== GLOBAL STATE (shared across instances) =====

    /**
     * Get global state value
     * @param {string} path - State path
     * @returns {*}
     */
    getState(path) {
        return StateManager.getState(path);
    }

    /**
     * Set global state value
     * @param {string} path - State path
     * @param {*} value - New value
     * @param {boolean} persist - Persist to storage
     */
    setState(path, value, persist = false) {
        StateManager.setState(path, value, persist);
    }

    // ===== UTILITY METHODS =====

    /**
     * Play a sound effect by type (uses SoundSystem)
     * @param {string} type - Sound type (click, error, startup, etc.)
     * @param {boolean} force - Play even if sound is disabled
     */
    playSound(type, force = false) {
        EventBus.emit('sound:play', { type, force });
    }

    /**
     * Play an audio file (MP3, WAV, etc.)
     * @param {string} src - Path or URL to audio file
     * @param {Object} options - Playback options
     * @param {number} options.volume - Volume (0-1)
     * @param {boolean} options.loop - Loop the audio
     * @param {boolean} options.force - Play even if sound is disabled
     * @param {Function} options.onEnded - Callback when audio ends
     * @param {Function} options.onError - Callback on error
     */
    playAudio(src, options = {}) {
        EventBus.emit('audio:play', { src, ...options });
    }

    /**
     * Stop playing an audio file
     * @param {string} src - Source of audio to stop
     */
    stopAudio(src) {
        EventBus.emit('audio:stop', { src });
    }

    /**
     * Stop all currently playing audio
     */
    stopAllAudio() {
        EventBus.emit('audio:stopall');
    }

    /**
     * Show an alert dialog
     * @param {string} message - Alert message
     */
    alert(message) {
        EventBus.emit('dialog:alert', { message });
    }

    /**
     * Show a confirm dialog
     * @param {string} message - Confirm message
     * @param {string} title - Optional title
     * @returns {Promise<boolean>} Resolves to true/false
     */
    confirm(message, title = 'Confirm') {
        return new Promise((resolve) => {
            // Import dynamically to avoid circular dependency
            import('../features/SystemDialogs.js').then(module => {
                module.default.confirm(message, title).then(resolve);
            });
        });
    }

    /**
     * Show a prompt dialog
     * @param {string} message - Prompt message
     * @param {string} defaultValue - Default value
     * @param {string} title - Optional title
     * @returns {Promise<string|null>} Resolves to input value or null
     */
    prompt(message, defaultValue = '', title = 'Input') {
        return new Promise((resolve) => {
            // Import dynamically to avoid circular dependency
            import('../features/SystemDialogs.js').then(module => {
                module.default.prompt(message, defaultValue, title).then(resolve);
            });
        });
    }

    /**
     * Unlock an achievement
     * @param {string} id - Achievement ID
     */
    unlockAchievement(id) {
        StateManager.unlockAchievement(id);
    }

    // ===== SCRIPTING SUPPORT =====
    // Methods for making apps scriptable via semantic events

    /**
     * Register baseline scripting commands/queries that every app gets automatically.
     * This guarantees all apps are controllable from RetroScript for ARG/story flows
     * even when an app doesn't define custom command handlers.
     */
    registerCoreScriptApi() {
        const windowId = this._currentWindowId;
        const instanceData = this.openWindows.get(windowId);
        if (!instanceData || instanceData.coreScriptApiRegistered) {
            return;
        }

        instanceData.coreScriptApiRegistered = true;

        this.registerCommand('core.focus', () => {
            WindowManager.focus(windowId);
            return { windowId, focused: true };
        });

        this.registerCommand('core.minimize', () => {
            WindowManager.minimize(windowId);
            return { windowId, minimized: true };
        });

        this.registerCommand('core.maximize', () => {
            WindowManager.maximize(windowId);
            return { windowId, maximized: true };
        });

        this.registerCommand('core.restore', () => {
            WindowManager.restore(windowId);
            return { windowId, restored: true };
        });

        this.registerCommand('core.close', () => {
            this.close(windowId);
            return { windowId, closed: true };
        });

        this.registerCommand('core.setState', (payload = {}) => {
            if (!payload.key) {
                throw new Error('core.setState requires payload.key');
            }
            this.setInstanceState(payload.key, payload.value);
            return { key: payload.key, value: payload.value };
        });

        this.registerCommand('core.emitCue', (payload = {}) => {
            const cue = payload.cue || payload.name || 'narrativeCue';
            const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
            this.emitAppEvent(cue, {
                source: 'core.emitCue',
                ...data
            });
            return { cue, emitted: true };
        });

        this.registerQuery('core.window', () => {
            const windowEl = this.getWindow();
            return {
                appId: this.id,
                windowId,
                isOpen: this.openWindows.has(windowId),
                title: this.name,
                focused: windowEl?.classList.contains('active') || false,
                minimized: windowEl?.classList.contains('minimized') || false,
                maximized: windowEl?.classList.contains('maximized') || false
            };
        });

        this.registerQuery('core.state', () => this.getAllInstanceState());

        this.registerQuery('core.capabilities', () => ({
            appId: this.id,
            windowId,
            singleton: this.singleton,
            coreCommands: [
                'core.focus',
                'core.minimize',
                'core.maximize',
                'core.restore',
                'core.close',
                'core.setState',
                'core.emitCue'
            ],
            coreQueries: ['core.window', 'core.state', 'core.capabilities']
        }));
    }

    /**
     * Register a command handler for this app
     * Scripts can call: command:appId:action
     * @param {string} action - Action name (e.g., 'setText', 'save')
     * @param {Function} handler - Handler function (payload, windowId) => result
     */
    registerCommand(action, handler) {
        const commandName = `command:${this.id}:${action}`;
        const capturedWindowId = this._currentWindowId;

        const unsub = EventBus.on(commandName, (payload = {}) => {
            // Queue commands so app window context cannot leak between overlapping handlers
            this._commandExecutionChain = this._commandExecutionChain
                .catch(() => {
                    // Keep the chain alive if a previous command failed
                })
                .then(async () => {
                    // Check if this command targets a specific window
                    const targetWindowId = payload.windowId;
                    if (targetWindowId && targetWindowId !== capturedWindowId) {
                        // Not for this instance
                        return;
                    }

                    // Resolve effective window ID: use captured ID, or fall back
                    // to the first open window for constructor-registered commands
                    const effectiveWindowId = capturedWindowId
                        || targetWindowId
                        || this.openWindows.keys().next().value
                        || null;

                    if (!effectiveWindowId || !this.openWindows.has(effectiveWindowId)) {
                        // No open window to execute against — skip silently
                        return;
                    }

                    // Set context and execute
                    const previousWindowId = this._currentWindowId;
                    this._currentWindowId = effectiveWindowId;
                    try {
                        const result = await this._runWithCommandTimeout(
                            () => handler.call(this, payload),
                            action
                        );
                        if (payload.requestId) {
                            EventBus.emit('action:result', {
                                requestId: payload.requestId,
                                success: true,
                                data: result
                            });
                        }
                    } catch (error) {
                        const errorMessage = error?.message || String(error);
                        console.error(`[${this.id}] Command '${action}' failed:`, errorMessage);
                        EventBus.emit(Events.APP_ERROR, {
                            appId: this.id,
                            windowId: effectiveWindowId,
                            error: errorMessage,
                            command: action
                        });
                        if (payload.requestId) {
                            EventBus.emit('action:result', {
                                requestId: payload.requestId,
                                success: false,
                                error: errorMessage
                            });
                        }
                    } finally {
                        this._currentWindowId = previousWindowId;
                    }
                });
        });

        const instanceData = this.openWindows.get(capturedWindowId);
        if (instanceData) {
            instanceData.eventUnsubscribers.push(unsub);
        } else if (capturedWindowId === null) {
            // Registered in constructor (no window yet) — track globally for cleanup
            this._globalEventUnsubscribers.push(unsub);
        }
    }

    /**
     * Register a query handler for this app
     * Scripts can query: query:appId:property
     * @param {string} property - Property name (e.g., 'getText', 'getValue')
     * @param {Function} handler - Handler function (payload, windowId) => value
     */
    registerQuery(property, handler) {
        const queryName = `query:${this.id}:${property}`;
        const responseName = `query:${this.id}:${property}:response`;
        const capturedWindowId = this._currentWindowId;

        const unsub = EventBus.on(queryName, (payload) => {
            const targetWindowId = payload.windowId;
            if (targetWindowId && targetWindowId !== capturedWindowId) {
                return;
            }

            // Resolve effective window ID for constructor-registered queries
            const effectiveWindowId = capturedWindowId
                || targetWindowId
                || this.openWindows.keys().next().value
                || null;

            const previousWindowId = this._currentWindowId;
            this._currentWindowId = effectiveWindowId;
            try {
                const value = handler.call(this, payload);
                EventBus.emit(responseName, {
                    requestId: payload.requestId,
                    windowId: effectiveWindowId,
                    value
                });
            } catch (error) {
                EventBus.emit(responseName, {
                    requestId: payload.requestId,
                    windowId: effectiveWindowId,
                    value: null,
                    error: error.message
                });
            } finally {
                this._currentWindowId = previousWindowId;
            }
        });

        const instanceData = this.openWindows.get(capturedWindowId);
        if (instanceData) {
            instanceData.eventUnsubscribers.push(unsub);
        } else if (capturedWindowId === null) {
            this._globalEventUnsubscribers.push(unsub);
        }
    }

    /**
     * Emit an app-specific event
     * @param {string} action - Action name (e.g., 'textChanged', 'saved')
     * @param {object} payload - Event payload
     */
    emitAppEvent(action, payload = {}) {
        const eventName = `app:${this.id}:${action}`;
        EventBus.emit(eventName, {
            appId: this.id,
            windowId: this._currentWindowId,
            ...payload
        });
    }

    /**
     * Send a message to a specific app
     * @param {string} targetAppId - ID of the target app
     * @param {*} message - Message content
     * @param {string} messageType - Optional message type for routing
     */
    sendMessage(targetAppId, message, messageType = 'message') {
        EventBus.emit(Events.APP_MESSAGE, {
            fromAppId: this.id,
            fromWindowId: this._currentWindowId,
            toAppId: targetAppId,
            message,
            messageType
        });

        // Also emit a targeted event for the specific app
        EventBus.emit(`app:${targetAppId}:message`, {
            fromAppId: this.id,
            fromWindowId: this._currentWindowId,
            message,
            messageType
        });
    }

    /**
     * Broadcast a message to all apps
     * @param {*} message - Message content
     * @param {string} messageType - Optional message type for routing
     */
    broadcast(message, messageType = 'broadcast') {
        EventBus.emit(Events.APP_BROADCAST, {
            fromAppId: this.id,
            fromWindowId: this._currentWindowId,
            message,
            messageType
        });
    }

    /**
     * Listen for messages from other apps
     * @param {Function} handler - Handler function (message, fromAppId, messageType) => void
     * @returns {Function} Unsubscribe function
     */
    onMessage(handler) {
        return this.onEvent(`app:${this.id}:message`, (data) => {
            handler(data.message, data.fromAppId, data.messageType);
        });
    }

    /**
     * Listen for broadcasts from any app
     * @param {Function} handler - Handler function (message, fromAppId, messageType) => void
     * @returns {Function} Unsubscribe function
     */
    onBroadcast(handler) {
        return this.onEvent(Events.APP_BROADCAST, (data) => {
            handler(data.message, data.fromAppId, data.messageType);
        });
    }

    /**
     * Mark app as busy (processing)
     * @param {string} task - Optional task description
     */
    setBusy(task = null) {
        EventBus.emit(Events.APP_BUSY, {
            appId: this.id,
            windowId: this._currentWindowId,
            task
        });
    }

    /**
     * Mark app as idle (done processing)
     */
    setIdle() {
        EventBus.emit(Events.APP_IDLE, {
            appId: this.id,
            windowId: this._currentWindowId
        });
    }

    /**
     * Respond to a request event (for request/response pattern)
     * @param {string} eventName - Response event name
     * @param {string} requestId - Request ID from the original request
     * @param {object} data - Response data
     */
    respond(eventName, requestId, data = {}) {
        EventBus.respond(eventName, requestId, data);
    }

    /**
     * Subscribe to events with auto-cleanup (alias for onEvent)
     * @param {string} event - Event name (supports wildcards)
     * @param {Function} handler - Event handler
     * @returns {Function} Unsubscribe function
     */
    subscribe(event, handler) {
        return this.onEvent(event, handler);
    }

    // ===== PRIVATE METHODS =====

    /**
     * Setup focus/blur tracking
     * @param {string} windowId - The window ID to track
     */
    setupFocusTracking(windowId) {
        let hadFocus = false;

        const checkFocus = ({ id }) => {
            if (id === windowId) {
                this._currentWindowId = windowId;
                hadFocus = true;
                this._focusedWindowIds.add(windowId);

                // Emit app focus event
                EventBus.emit(Events.APP_FOCUS, {
                    appId: this.id,
                    windowId: windowId
                });

                this.onFocus();
            } else if (hadFocus && this.openWindows.has(windowId)) {
                // Another window got focus, we lost it
                hadFocus = false;
                this._focusedWindowIds.delete(windowId);
                const prevContext = this._currentWindowId;
                this._currentWindowId = windowId;

                // Emit app blur event
                EventBus.emit(Events.APP_BLUR, {
                    appId: this.id,
                    windowId: windowId
                });

                this.onBlur();
                this._currentWindowId = prevContext;
            }
        };

        const unsubscribe = EventBus.on('window:focus', checkFocus);

        const instanceData = this.openWindows.get(windowId);
        if (instanceData) {
            instanceData.eventUnsubscribers.push(unsubscribe);
        }
    }

    /**
     * Setup resize tracking
     * @param {string} windowId - The window ID to track
     */
    setupResizeTracking(windowId) {
        const handleResize = ({ id, width, height }) => {
            if (id === windowId) {
                this._currentWindowId = windowId;
                this.onResize({ width, height });
            }
        };

        const unsubscribe = EventBus.on('window:resize', handleResize);

        const instanceData = this.openWindows.get(windowId);
        if (instanceData) {
            instanceData.eventUnsubscribers.push(unsubscribe);
        }
    }
}

export default AppBase;
