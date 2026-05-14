/**
 * CommandBus - Command execution layer for scripting support
 *
 * @deprecated Use `SemanticEventBus.registerCommand()` and
 *             `SemanticEventBus.executeCommand()` directly. This file is now
 *             a thin facade that delegates to `SemanticEventBus.commandHandlers`
 *             and exists so existing imports keep working. It will be removed
 *             in Wave 4 of the unification roadmap.
 *
 * The `handlers` Map is intentionally a *reference* to
 * `SemanticEventBus.commandHandlers` — both objects see the same registrations,
 * so `CommandBus.execute('foo')` and `SemanticEventBus.executeCommand('foo')`
 * are equivalent. Timer/macro state remains here (those are CommandBus
 * features, not part of the unified bus surface).
 *
 * Original responsibility (now shared with SemanticEventBus):
 *   - Commands trigger actions (command:app:launch, command:fs:write, etc.)
 *   - Queries retrieve state (query:windows, query:fs:list, etc.)
 *   - All commands support requestId for async response tracking
 *
 * Usage (legacy — still works):
 *   import CommandBus from './CommandBus.js';
 *   CommandBus.initialize();
 *   CommandBus.execute('app:launch', { appId: 'notepad' });
 *
 * Usage (preferred for new code):
 *   import EventBus from './EventBus.js';
 *   EventBus.registerCommand('app:launch', async (payload) => { ... });
 *   await EventBus.executeCommand('app:launch', { appId: 'notepad' });
 */

import EventBus from './EventBus.js';
import StateManager from './StateManager.js';
import WindowManager from './WindowManager.js';
import FileSystemManager from './FileSystemManager.js';

class CommandBusClass {
    constructor() {
        // Share the command registry with SemanticEventBus so the two surfaces
        // see the same handler set. Any registration via CommandBus.register
        // is visible to SemanticEventBus.executeCommand and vice versa.
        this.handlers = EventBus.commandHandlers;
        this.timers = new Map();
        this.macros = new Map();
        this.isRecording = false;
        this.currentMacro = null;
        this.recordedEvents = [];
        this.initialized = false;
    }

    /**
     * Initialize CommandBus - register all command handlers
     */
    initialize() {
        if (this.initialized) return;
        this.initialized = true;

        // Register command handlers
        this._registerAppCommands();
        this._registerWindowCommands();
        this._registerFsCommands();
        this._registerDialogCommands();
        this._registerSystemCommands();
        this._registerTerminalCommands();
        this._registerQueryHandlers();
        this._registerTimerHandlers();
        this._registerMacroHandlers();

        // Listen for all command:* events and route to registered handlers.
        // App-specific commands (e.g. command:inbox:deliverMessage) are handled
        // directly by AppBase.registerCommand() via their own EventBus subscriptions,
        // so we only execute commands that CommandBus itself has registered.
        EventBus.on('command:*', (payload, metadata, event) => {
            const commandName = event.name.replace('command:', '');
            if (this.handlers.has(commandName)) {
                this.execute(commandName, payload);
            }
            // Silently ignore app-specific commands — they're handled by AppBase
        });

        console.log('[CommandBus] Initialized with handlers:', [...this.handlers.keys()]);
    }

    /**
     * Register a command handler.
     * @deprecated Use `EventBus.registerCommand(command, handler)` directly.
     *             Both surfaces share the same registry, so existing callers
     *             continue to work — this facade returns the unregister
     *             function from the unified API.
     * @param {string} command - Command name (without 'command:' prefix)
     * @param {Function} handler - Handler function (payload, requestId) => result
     * @returns {Function} Unregister function
     */
    register(command, handler) {
        return EventBus.registerCommand(command, handler);
    }

    /**
     * Execute a command.
     * @deprecated Use `EventBus.executeCommand(command, payload)` directly.
     * @param {string} command - Command name
     * @param {object} payload - Command payload
     * @returns {Promise} Result of the command
     */
    async execute(command, payload = {}) {
        return EventBus.executeCommand(command, payload);
    }

    /**
     * Execute a command and wait for result (Promise-based)
     * @param {string} command - Command name
     * @param {object} payload - Command payload
     * @param {number} timeout - Timeout in ms
     * @returns {Promise} Result of the command
     */
    async executeAsync(command, payload = {}, timeout = 5000) {
        const requestId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const requestPayload = { ...payload, requestId };

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                reject(new Error(`Command timeout: ${command}`));
            }, timeout);

            const unsubscribe = EventBus.on('action:result', (result) => {
                if (result.requestId === requestId) {
                    clearTimeout(timeoutId);
                    unsubscribe();
                    if (result.success) {
                        resolve(result.data);
                    } else {
                        reject(new Error(result.error));
                    }
                }
            });

            this.execute(command, requestPayload);
        });
    }

    /**
     * Send action result event
     * @private
     */
    _sendResult(requestId, success, data = null, error = null) {
        EventBus.emit('action:result', { requestId, success, data, error });
    }

    // ==========================================
    // APP COMMANDS
    // ==========================================
    _registerAppCommands() {
        this.register('app:launch', async (payload) => {
            const { appId, params } = payload;
            // Dynamic import to avoid circular dependency
            const AppRegistry = (await import('../apps/AppRegistry.js')).default;

            // Use AppRegistry.launch which handles everything
            const success = AppRegistry.launch(appId, params);
            if (!success) {
                throw new Error(`Failed to launch app: ${appId}`);
            }

            // Get the app to find window ID
            const app = AppRegistry.get(appId);
            const windowId = app?._currentWindowId || app?.windowId;

            return { appId, windowId, success: true };
        });

        this.register('app:close', async (payload) => {
            const { windowId } = payload;
            WindowManager.close(windowId);
            return { windowId };
        });
    }

    // ==========================================
    // WINDOW COMMANDS
    // ==========================================
    _registerWindowCommands() {
        this.register('window:focus', async (payload) => {
            const { windowId } = payload;
            WindowManager.focus(windowId);
            return { windowId };
        });

        this.register('window:minimize', async (payload) => {
            const { windowId } = payload;
            WindowManager.minimize(windowId);
            return { windowId };
        });

        this.register('window:maximize', async (payload) => {
            const { windowId } = payload;
            WindowManager.maximize(windowId);
            return { windowId };
        });

        this.register('window:restore', async (payload) => {
            const { windowId } = payload;
            WindowManager.restore(windowId);
            return { windowId };
        });

        this.register('window:close', async (payload) => {
            const { windowId } = payload;
            WindowManager.close(windowId);
            return { windowId };
        });
    }

    // ==========================================
    // FILESYSTEM COMMANDS
    // ==========================================
    _registerFsCommands() {
        this.register('fs:read', async (payload) => {
            const { path } = payload;
            const content = FileSystemManager.readFile(path);
            return { path, content };
        });

        this.register('fs:write', async (payload) => {
            const { path, content } = payload;
            FileSystemManager.writeFile(path, content);
            // Note: FileSystemManager already emits FS_FILE_WRITE — no duplicate emit here
            return { path, written: true };
        });

        this.register('fs:delete', async (payload) => {
            const { path } = payload;
            const node = FileSystemManager.getNode(path);
            if (!node) {
                throw new Error(`Path not found: ${path}`);
            }
            // Detect directories by presence of 'children' property (getNode returns raw FS nodes)
            if (node.children !== undefined || node.type === 'directory') {
                FileSystemManager.deleteDirectory(path);
            } else {
                FileSystemManager.deleteFile(path);
            }
            // Note: FileSystemManager already emits FS_FILE_DELETE — no duplicate emit here
            return { path, deleted: true };
        });

        this.register('fs:mkdir', async (payload) => {
            const { path } = payload;
            FileSystemManager.createDirectory(path);
            // Note: FileSystemManager already emits FS_DIR_CREATE — no duplicate emit here
            return { path, created: true };
        });

        this.register('fs:copy', async (payload) => {
            const { source, destination } = payload;
            FileSystemManager.copyItem(source, destination);
            return { source, destination, copied: true };
        });

        this.register('fs:move', async (payload) => {
            const { source, destination } = payload;
            FileSystemManager.moveItem(source, destination);
            return { source, destination, moved: true };
        });

        this.register('fs:reset', async () => {
            FileSystemManager.reset();
            return { reset: true };
        });
    }

    // ==========================================
    // DIALOG COMMANDS
    // ==========================================
    _registerDialogCommands() {
        this.register('dialog:show', async (payload) => {
            const { type, message, title, options } = payload;

            switch (type) {
                case 'alert':
                    EventBus.emit('dialog:alert', { message, title, ...options });
                    return { shown: true };
                case 'confirm':
                    return EventBus.request('dialog:confirm', { message, title, ...options });
                case 'prompt':
                    return EventBus.request('dialog:prompt', { message, title, ...options });
                default:
                    EventBus.emit('dialog:alert', { message, title });
                    return { shown: true };
            }
        });

        this.register('notification:show', async (payload) => {
            EventBus.emit('notification:show', payload);
            return { shown: true };
        });
    }

    // ==========================================
    // SYSTEM COMMANDS
    // ==========================================
    _registerSystemCommands() {
        this.register('sound:play', async (payload) => {
            EventBus.emit('sound:play', payload);
            return { played: true };
        });

        this.register('setting:set', async (payload) => {
            const { key, value } = payload;

            // Validate key to prevent path traversal out of settings namespace
            if (typeof key !== 'string' || !key || /[^a-zA-Z0-9._-]/.test(key) || key.includes('..')) {
                throw new Error(`Invalid setting key: ${key}`);
            }

            StateManager.setState(`settings.${key}`, value, true);
            EventBus.emit('setting:changed', { key, value });
            return { key, value, set: true };
        });

        this.register('desktop:refresh', async (payload) => {
            EventBus.emit('desktop:refresh');
            return { refreshed: true };
        });

        this.register('achievement:unlock', async (payload) => {
            const { achievementId } = payload;
            StateManager.unlockAchievement(achievementId);
            return { achievementId, unlocked: true };
        });
    }

    // ==========================================
    // TERMINAL COMMANDS
    // ==========================================
    _registerTerminalCommands() {
        /**
         * Helper to get Terminal instance
         */
        const getTerminal = async () => {
            const AppRegistry = (await import('../apps/AppRegistry.js')).default;
            const terminal = AppRegistry.get('terminal');
            if (terminal && terminal.openWindows && terminal.openWindows.size > 0) {
                const firstWindowId = terminal.openWindows.keys().next().value;
                terminal._currentWindowId = firstWindowId;
                return terminal;
            }
            return null;
        };

        /**
         * Ensure terminal is open
         */
        const ensureTerminal = async () => {
            let terminal = await getTerminal();
            if (!terminal) {
                const AppRegistry = (await import('../apps/AppRegistry.js')).default;
                AppRegistry.launch('terminal');
                await new Promise(resolve => setTimeout(resolve, 200));
                terminal = await getTerminal();
            }
            return terminal;
        };

        // Execute a command in terminal
        this.register('terminal:execute', async (payload) => {
            const { command, windowId } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            // If windowId specified, check it matches
            if (windowId && terminal._currentWindowId !== windowId) {
                throw new Error('Terminal window not found');
            }

            terminal.executeCommand(String(command));
            return {
                output: terminal.lastOutput,
                path: terminal.currentPath.join('\\')
            };
        });

        // Execute multiple commands in sequence
        this.register('terminal:executeSequence', async (payload) => {
            const { commands } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            const outputs = [];
            for (const cmd of commands) {
                terminal.executeCommand(String(cmd));
                outputs.push(terminal.lastOutput);
            }
            return { outputs };
        });

        // Print text to terminal
        this.register('terminal:print', async (payload) => {
            const { text, color } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.print(String(text), color || '#c0c0c0');
            return { printed: true };
        });

        // Print HTML to terminal
        this.register('terminal:printHtml', async (payload) => {
            const { html } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.printHtml(String(html));
            return { printed: true };
        });

        // Clear terminal screen
        this.register('terminal:clear', async (payload) => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.cmdClear();
            return { cleared: true };
        });

        // Change directory
        this.register('terminal:cd', async (payload) => {
            const { path } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.cmdCd([String(path)]);
            return { path: terminal.currentPath.join('\\') };
        });

        // Get current path
        this.register('terminal:getPath', async (payload) => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return {
                path: terminal.currentPath,
                pathString: terminal.currentPath.join('\\')
            };
        });

        // Get terminal state
        this.register('terminal:getState', async (payload) => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return {
                currentPath: terminal.currentPath,
                pathString: terminal.currentPath.join('\\'),
                godMode: terminal.godMode,
                hasActiveProcess: terminal.activeProcess !== null,
                activeProcessType: terminal.activeProcess,
                historyCount: terminal.commandHistory.length,
                windowId: terminal._currentWindowId
            };
        });

        // Get command history
        this.register('terminal:getHistory', async (payload) => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return { history: [...terminal.commandHistory] };
        });

        // Get last output
        this.register('terminal:getOutput', async (payload) => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return { output: terminal.lastOutput };
        });

        // Set environment variable
        this.register('terminal:setEnvVar', async (payload) => {
            const { name, value } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.envVars[String(name).toUpperCase()] = String(value);
            return { name: String(name).toUpperCase(), value: String(value) };
        });

        // Get environment variable
        this.register('terminal:getEnvVar', async (payload) => {
            const { name } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return {
                name: String(name).toUpperCase(),
                value: terminal.envVars[String(name).toUpperCase()] || null
            };
        });

        // Get all environment variables
        this.register('terminal:getEnvVars', async (payload) => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return { envVars: { ...terminal.envVars } };
        });

        // Create alias
        this.register('terminal:createAlias', async (payload) => {
            const { name, command } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.aliases[String(name).toLowerCase()] = String(command);
            return { name: String(name).toLowerCase(), command: String(command) };
        });

        // Get all aliases
        this.register('terminal:getAliases', async (payload) => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return { aliases: { ...terminal.aliases } };
        });

        // Enable god mode — requires the konami code to have been entered first
        // (terminal.godMode must already be true from user interaction)
        this.register('terminal:enableGodMode', async (payload) => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            // God mode can only be activated via the konami code in the terminal.
            // This command exists for querying status, not for programmatic activation.
            if (!terminal.godMode) {
                throw new Error('God mode can only be activated via the terminal');
            }

            return { godMode: terminal.godMode };
        });

        // Start matrix effect
        this.register('terminal:startMatrix', async (payload) => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.startMatrix();
            return { started: true };
        });

        // Run a script file
        this.register('terminal:runScript', async (payload) => {
            const { scriptPath } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            const filePath = terminal.resolvePath(String(scriptPath));
            if (String(scriptPath).endsWith('.retro')) {
                terminal.executeRetroScript(filePath);
            } else if (String(scriptPath).endsWith('.bat')) {
                terminal.executeBatchFile(filePath);
            } else {
                throw new Error('Unknown script type. Use .retro or .bat');
            }
            return { scriptPath: filePath };
        });

        // Open terminal (launch if not open)
        this.register('terminal:open', async (payload) => {
            const { initialCommand } = payload;
            const terminal = await ensureTerminal();

            if (!terminal) {
                throw new Error('Failed to open terminal');
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            if (initialCommand) {
                terminal.executeCommand(String(initialCommand));
            }

            return { windowId: terminal._currentWindowId };
        });

        // Focus terminal window
        this.register('terminal:focus', async (payload) => {
            const terminal = await getTerminal();

            if (!terminal || !terminal._currentWindowId) {
                throw new Error('No terminal window open');
            }

            WindowManager.focus(terminal._currentWindowId);
            return { focused: true };
        });

        // Check if terminal is open
        this.register('terminal:isOpen', async (payload) => {
            const terminal = await getTerminal();
            return { open: terminal !== null };
        });
    }

    // ==========================================
    // QUERY HANDLERS
    // ==========================================
    _registerQueryHandlers() {
        // Listen for query events
        EventBus.on('query:windows', (payload) => {
            const { requestId } = payload;
            const windows = StateManager.getState('windows') || [];
            EventBus.emit('query:windows:response', {
                requestId,
                windows: windows.map(w => ({
                    id: w.id,
                    title: w.title,
                    minimized: w.minimized,
                    maximized: w.maximized
                }))
            });
        });

        EventBus.on('query:apps', async (payload) => {
            const { requestId } = payload;
            const AppRegistry = (await import('../apps/AppRegistry.js')).default;
            const apps = AppRegistry.getAll().map(app => ({
                id: app.id,
                name: app.name,
                icon: app.icon,
                category: app.category
            }));
            EventBus.emit('query:apps:response', { requestId, apps });
        });

        EventBus.on('query:fs:list', (payload) => {
            const { path, requestId } = payload;
            try {
                const items = FileSystemManager.listDirectory(path);
                EventBus.emit('query:fs:list:response', { requestId, path, items });
            } catch (error) {
                EventBus.emit('query:fs:list:response', {
                    requestId, path, items: [], error: error.message
                });
            }
        });

        EventBus.on('query:fs:read', (payload) => {
            const { path, requestId } = payload;
            try {
                const content = FileSystemManager.readFile(path);
                EventBus.emit('query:fs:read:response', { requestId, path, content });
            } catch (error) {
                EventBus.emit('query:fs:read:response', {
                    requestId, path, content: null, error: error.message
                });
            }
        });

        EventBus.on('query:fs:exists', (payload) => {
            const { path, requestId } = payload;
            const node = FileSystemManager.getNode(path);
            EventBus.emit('query:fs:exists:response', {
                requestId,
                path,
                exists: !!node,
                type: node?.type || null
            });
        });

        EventBus.on('query:fs:tree', (payload) => {
            const { requestId } = payload;
            EventBus.emit('query:fs:tree:response', {
                requestId,
                filesystem: FileSystemManager.fileSystem
            });
        });

        EventBus.on('query:fs:desktop', (payload) => {
            const { requestId } = payload;
            EventBus.emit('query:fs:desktop:response', {
                requestId,
                items: FileSystemManager.getDesktopItems()
            });
        });

        EventBus.on('query:settings', (payload) => {
            const { key, requestId } = payload;
            let settings;
            if (key) {
                settings = { [key]: StateManager.getState(`settings.${key}`) };
            } else {
                settings = StateManager.getState('settings') || {};
            }
            EventBus.emit('query:settings:response', { requestId, settings });
        });

        EventBus.on('query:state', (payload) => {
            const { path, requestId } = payload;
            const value = StateManager.getState(path);
            EventBus.emit('query:state:response', { requestId, path, value });
        });
    }

    // ==========================================
    // TIMER HANDLERS
    // ==========================================

    /**
     * Validate that a timer-fired event name is safe to emit.
     * Blocks privileged event namespaces that scripts must not trigger
     * indirectly via delayed execution.
     * @param {string} eventName
     * @returns {boolean}
     * @private
     */
    _isTimerEventAllowed(eventName) {
        if (typeof eventName !== 'string' || !eventName.trim()) return false;
        // Block privileged namespaces that bypass normal command/auth checks
        const BLOCKED_PREFIXES = ['command:', 'macro:', 'system:', 'plugin:', 'app:'];
        const lower = eventName.toLowerCase();
        return !BLOCKED_PREFIXES.some(prefix => lower.startsWith(prefix));
    }

    _registerTimerHandlers() {
        EventBus.on('timer:set', (payload) => {
            const { timerId, delay, event, payload: eventPayload, repeat } = payload;

            // Validate the optional event name before scheduling to prevent
            // scripts from injecting privileged events via timer callbacks
            if (event && !this._isTimerEventAllowed(event)) {
                console.warn(`[CommandBus] timer:set blocked disallowed event name: "${event}"`);
                return;
            }

            // Clear existing timer with same ID
            if (this.timers.has(timerId)) {
                const existing = this.timers.get(timerId);
                if (existing.intervalId) clearInterval(existing.intervalId);
                if (existing.timeoutId) clearTimeout(existing.timeoutId);
            }

            if (repeat) {
                const intervalId = setInterval(() => {
                    EventBus.emit('timer:fired', { timerId });
                    if (event) {
                        EventBus.emit(event, eventPayload || {});
                    }
                }, delay);
                this.timers.set(timerId, { intervalId, event, repeat: true });
            } else {
                const timeoutId = setTimeout(() => {
                    EventBus.emit('timer:fired', { timerId });
                    if (event) {
                        EventBus.emit(event, eventPayload || {});
                    }
                    this.timers.delete(timerId);
                }, delay);
                this.timers.set(timerId, { timeoutId, event, repeat: false });
            }
        });

        EventBus.on('timer:clear', (payload) => {
            const { timerId } = payload;
            if (this.timers.has(timerId)) {
                const timer = this.timers.get(timerId);
                if (timer.intervalId) clearInterval(timer.intervalId);
                if (timer.timeoutId) clearTimeout(timer.timeoutId);
                this.timers.delete(timerId);
            }
        });
    }

    // ==========================================
    // MACRO HANDLERS
    // ==========================================
    _registerMacroHandlers() {
        EventBus.on('macro:record:start', (payload) => {
            const { macroId } = payload;
            this.isRecording = true;
            this.currentMacro = macroId || `macro_${Date.now()}`;
            this.recordedEvents = [];
            this.recordStartTime = Date.now();

            // Subscribe to recordable events
            this._macroSubscription = EventBus.on('*', (eventPayload, metadata, event) => {
                if (!this.isRecording) return;
                // Only record command events
                if (event.name.startsWith('command:')) {
                    this.recordedEvents.push({
                        event: event.name,
                        payload: eventPayload,
                        delay: Date.now() - this.recordStartTime
                    });
                    this.recordStartTime = Date.now();
                }
            });

            EventBus.emit('macro:recording', { macroId: this.currentMacro, started: true });
        });

        EventBus.on('macro:record:stop', () => {
            if (!this.isRecording) return;

            this.isRecording = false;
            if (this._macroSubscription) {
                this._macroSubscription();
                this._macroSubscription = null;
            }

            // Save the macro
            this.macros.set(this.currentMacro, [...this.recordedEvents]);

            EventBus.emit('macro:recorded', {
                macroId: this.currentMacro,
                eventCount: this.recordedEvents.length
            });

            this.currentMacro = null;
            this.recordedEvents = [];
        });

        EventBus.on('macro:play', async (payload) => {
            const { macroId, speed = 1.0 } = payload;
            const events = this.macros.get(macroId);

            if (!events || events.length === 0) {
                console.warn(`[CommandBus] Macro not found or empty: ${macroId}`);
                return;
            }

            EventBus.emit('macro:playing', { macroId, eventCount: events.length });

            for (const { event, payload: eventPayload, delay } of events) {
                await new Promise(resolve => setTimeout(resolve, delay / speed));
                EventBus.emit(event, eventPayload);
            }

            EventBus.emit('macro:complete', { macroId });
        });

        EventBus.on('macro:save', (payload) => {
            const { macroId, events } = payload;
            this.macros.set(macroId, events);
        });
    }

    // ==========================================
    // HELPER METHODS
    // ==========================================

    /**
     * Get list of registered commands
     * @returns {string[]} Command names
     */
    getCommands() {
        return [...this.handlers.keys()];
    }

    /**
     * Check if a command is registered
     * @param {string} command - Command name
     * @returns {boolean}
     */
    hasCommand(command) {
        return this.handlers.has(command);
    }

    /**
     * Get list of active timers
     * @returns {string[]} Timer IDs
     */
    getActiveTimers() {
        return [...this.timers.keys()];
    }

    /**
     * Get list of saved macros
     * @returns {string[]} Macro IDs
     */
    getSavedMacros() {
        return [...this.macros.keys()];
    }

    /**
     * Get a macro's recorded events
     * @param {string} macroId - Macro ID
     * @returns {Array|null} Recorded events
     */
    getMacro(macroId) {
        return this.macros.get(macroId) || null;
    }
}

// Create singleton instance
const CommandBus = new CommandBusClass();

// Add to global debug object
if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.commandBus = CommandBus;
}

export default CommandBus;
