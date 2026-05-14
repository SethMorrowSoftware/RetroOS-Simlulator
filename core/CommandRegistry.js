/**
 * CommandRegistry - Registers platform command handlers and owns timer +
 * macro lifecycle state for the RetroScript engine.
 *
 * The unified command/query registry lives on `SemanticEventBus` —
 * `EventBus.registerCommand(name, handler)` / `EventBus.executeCommand(name, payload)`
 * are the public API. This module is the wiring layer: it groups every
 * platform-level handler (`command:fs:*`, `command:window:*`,
 * `command:terminal:*`, `command:dialog:*`, `command:app:*`,
 * `command:setting:*`, etc.) plus the `query:*` listeners and the
 * `timer:*` / `macro:*` lifecycle handlers in one place so they can be
 * initialised once at boot.
 *
 * Usage:
 *   import CommandRegistry from './CommandRegistry.js';
 *   CommandRegistry.initialize();
 *
 *   // Anywhere in the codebase:
 *   import EventBus from './EventBus.js';
 *   await EventBus.executeCommand('fs:read', { path: 'C:/Users/User/foo.txt' });
 */

import EventBus from './EventBus.js';
import StateManager from './StateManager.js';
import WindowManager from './WindowManager.js';
import FileSystemManager from './FileSystemManager.js';
import { validateScriptPath } from './script/utils/PathValidation.js';

/**
 * Validate a path passed to a `command:fs:*` handler against the same
 * allowlist that script-driven file ops use.
 *
 * Without this guard, a script could escape the script-engine path check by
 * emitting `command:fs:write { path: "C:/anything" }` instead of using the
 * `write` statement — the handler reached straight into `FileSystemManager`
 * with no validation. The script and command surfaces share one boundary.
 *
 * The underlying validator throws a RuntimeError; we rethrow as a plain
 * Error so the command error envelope ({ success: false, error }) carries a
 * clean message instead of a ScriptError with line:0 column:0.
 *
 * @param {string} path
 * @param {string} commandName - e.g. 'fs:write', for the error message
 * @returns {string} normalized path
 */
function validateCommandFsPath(path, commandName) {
    try {
        return validateScriptPath(path);
    } catch (err) {
        const msg = err && err.message ? err.message : `Invalid path for ${commandName}`;
        throw new Error(`[${commandName}] ${msg}`);
    }
}

class CommandRegistryClass {
    constructor() {
        this.timers = new Map();
        this.macros = new Map();
        this.isRecording = false;
        this.currentMacro = null;
        this.recordedEvents = [];
        this.recordStartTime = 0;
        this._macroSubscription = null;
        this.initialized = false;
    }

    /**
     * Register every platform-level command, query, timer, and macro
     * handler with the unified registry on `SemanticEventBus`.
     */
    initialize() {
        if (this.initialized) return;
        this.initialized = true;

        this._registerAppCommands();
        this._registerWindowCommands();
        this._registerFsCommands();
        this._registerDialogCommands();
        this._registerSystemCommands();
        this._registerTerminalCommands();
        this._registerQueryHandlers();
        this._registerTimerHandlers();
        this._registerMacroHandlers();

        // Route `command:<name>` events emitted via EventBus.emit() into the
        // unified registry. App-scoped commands (e.g. `command:inbox:deliverMessage`)
        // are handled directly by their owning app via AppBase.registerCommand
        // and are silently ignored here.
        EventBus.on('command:*', (payload, metadata, event) => {
            const commandName = event.name.replace('command:', '');
            if (EventBus.commandHandlers.has(commandName)) {
                EventBus.executeCommand(commandName, payload);
            }
        });

        console.log('[CommandRegistry] Initialized with handlers:', [...EventBus.commandHandlers.keys()]);
    }

    // ==========================================
    // APP COMMANDS
    // ==========================================
    _registerAppCommands() {
        EventBus.registerCommand('app:launch', async (payload) => {
            const { appId, params } = payload;
            const AppRegistry = (await import('../apps/AppRegistry.js')).default;

            const success = AppRegistry.launch(appId, params);
            if (!success) {
                throw new Error(`Failed to launch app: ${appId}`);
            }

            const app = AppRegistry.get(appId);
            const windowId = app?._currentWindowId || app?.windowId;

            return { appId, windowId, success: true };
        });

        EventBus.registerCommand('app:close', async (payload) => {
            const { windowId } = payload;
            WindowManager.close(windowId);
            return { windowId };
        });
    }

    // ==========================================
    // WINDOW COMMANDS
    // ==========================================
    _registerWindowCommands() {
        EventBus.registerCommand('window:focus', async (payload) => {
            const { windowId } = payload;
            WindowManager.focus(windowId);
            return { windowId };
        });

        EventBus.registerCommand('window:minimize', async (payload) => {
            const { windowId } = payload;
            WindowManager.minimize(windowId);
            return { windowId };
        });

        EventBus.registerCommand('window:maximize', async (payload) => {
            const { windowId } = payload;
            WindowManager.maximize(windowId);
            return { windowId };
        });

        EventBus.registerCommand('window:restore', async (payload) => {
            const { windowId } = payload;
            WindowManager.restore(windowId);
            return { windowId };
        });

        EventBus.registerCommand('window:close', async (payload) => {
            const { windowId } = payload;
            WindowManager.close(windowId);
            return { windowId };
        });
    }

    // ==========================================
    // FILESYSTEM COMMANDS
    // ==========================================
    _registerFsCommands() {
        EventBus.registerCommand('fs:read', async (payload) => {
            const path = validateCommandFsPath(payload.path, 'fs:read');
            const content = FileSystemManager.readFile(path);
            return { path, content };
        });

        EventBus.registerCommand('fs:write', async (payload) => {
            const path = validateCommandFsPath(payload.path, 'fs:write');
            FileSystemManager.writeFile(path, payload.content);
            return { path, written: true };
        });

        EventBus.registerCommand('fs:delete', async (payload) => {
            const path = validateCommandFsPath(payload.path, 'fs:delete');
            const node = FileSystemManager.getNode(path);
            if (!node) {
                throw new Error(`Path not found: ${path}`);
            }
            if (node.children !== undefined || node.type === 'directory') {
                FileSystemManager.deleteDirectory(path);
            } else {
                FileSystemManager.deleteFile(path);
            }
            return { path, deleted: true };
        });

        EventBus.registerCommand('fs:mkdir', async (payload) => {
            const path = validateCommandFsPath(payload.path, 'fs:mkdir');
            FileSystemManager.createDirectory(path);
            return { path, created: true };
        });

        EventBus.registerCommand('fs:copy', async (payload) => {
            // Validate both endpoints so an attacker can't smuggle a write by
            // validating one path and operating on another.
            const source = validateCommandFsPath(payload.source, 'fs:copy(source)');
            const destination = validateCommandFsPath(payload.destination, 'fs:copy(destination)');
            FileSystemManager.copyItem(source, destination);
            return { source, destination, copied: true };
        });

        EventBus.registerCommand('fs:move', async (payload) => {
            const source = validateCommandFsPath(payload.source, 'fs:move(source)');
            const destination = validateCommandFsPath(payload.destination, 'fs:move(destination)');
            FileSystemManager.moveItem(source, destination);
            return { source, destination, moved: true };
        });

        EventBus.registerCommand('fs:reset', async () => {
            FileSystemManager.reset();
            return { reset: true };
        });
    }

    // ==========================================
    // DIALOG COMMANDS
    // ==========================================
    _registerDialogCommands() {
        EventBus.registerCommand('dialog:show', async (payload) => {
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

        EventBus.registerCommand('notification:show', async (payload) => {
            EventBus.emit('notification:show', payload);
            return { shown: true };
        });
    }

    // ==========================================
    // SYSTEM COMMANDS
    // ==========================================
    _registerSystemCommands() {
        EventBus.registerCommand('sound:play', async (payload) => {
            EventBus.emit('sound:play', payload);
            return { played: true };
        });

        EventBus.registerCommand('setting:set', async (payload) => {
            const { key, value } = payload;

            // Reject keys that could traverse out of the settings namespace.
            if (typeof key !== 'string' || !key || /[^a-zA-Z0-9._-]/.test(key) || key.includes('..')) {
                throw new Error(`Invalid setting key: ${key}`);
            }

            StateManager.setState(`settings.${key}`, value, true);
            EventBus.emit('setting:changed', { key, value });
            return { key, value, set: true };
        });

        EventBus.registerCommand('desktop:refresh', async () => {
            EventBus.emit('desktop:refresh');
            return { refreshed: true };
        });

        EventBus.registerCommand('achievement:unlock', async (payload) => {
            const { achievementId } = payload;
            StateManager.unlockAchievement(achievementId);
            return { achievementId, unlocked: true };
        });
    }

    // ==========================================
    // TERMINAL COMMANDS
    // ==========================================
    _registerTerminalCommands() {
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

        EventBus.registerCommand('terminal:execute', async (payload) => {
            const { command, windowId } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            if (windowId && terminal._currentWindowId !== windowId) {
                throw new Error('Terminal window not found');
            }

            terminal.executeCommand(String(command));
            return {
                output: terminal.lastOutput,
                path: terminal.currentPath.join('\\')
            };
        });

        EventBus.registerCommand('terminal:executeSequence', async (payload) => {
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

        EventBus.registerCommand('terminal:print', async (payload) => {
            const { text, color } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.print(String(text), color || '#c0c0c0');
            return { printed: true };
        });

        EventBus.registerCommand('terminal:printHtml', async (payload) => {
            const { html } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.printHtml(String(html));
            return { printed: true };
        });

        EventBus.registerCommand('terminal:clear', async () => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.cmdClear();
            return { cleared: true };
        });

        EventBus.registerCommand('terminal:cd', async (payload) => {
            const { path } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.cmdCd([String(path)]);
            return { path: terminal.currentPath.join('\\') };
        });

        EventBus.registerCommand('terminal:getPath', async () => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return {
                path: terminal.currentPath,
                pathString: terminal.currentPath.join('\\')
            };
        });

        EventBus.registerCommand('terminal:getState', async () => {
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

        EventBus.registerCommand('terminal:getHistory', async () => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return { history: [...terminal.commandHistory] };
        });

        EventBus.registerCommand('terminal:getOutput', async () => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return { output: terminal.lastOutput };
        });

        EventBus.registerCommand('terminal:setEnvVar', async (payload) => {
            const { name, value } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.envVars[String(name).toUpperCase()] = String(value);
            return { name: String(name).toUpperCase(), value: String(value) };
        });

        EventBus.registerCommand('terminal:getEnvVar', async (payload) => {
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

        EventBus.registerCommand('terminal:getEnvVars', async () => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return { envVars: { ...terminal.envVars } };
        });

        EventBus.registerCommand('terminal:createAlias', async (payload) => {
            const { name, command } = payload;
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.aliases[String(name).toLowerCase()] = String(command);
            return { name: String(name).toLowerCase(), command: String(command) };
        });

        EventBus.registerCommand('terminal:getAliases', async () => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            return { aliases: { ...terminal.aliases } };
        });

        // God mode can only be activated via the konami code in the terminal;
        // this command exists for status queries, not programmatic activation.
        EventBus.registerCommand('terminal:enableGodMode', async () => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            if (!terminal.godMode) {
                throw new Error('God mode can only be activated via the terminal');
            }

            return { godMode: terminal.godMode };
        });

        EventBus.registerCommand('terminal:startMatrix', async () => {
            const terminal = await getTerminal();

            if (!terminal) {
                throw new Error('No terminal window open');
            }

            terminal.startMatrix();
            return { started: true };
        });

        EventBus.registerCommand('terminal:runScript', async (payload) => {
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

        EventBus.registerCommand('terminal:open', async (payload) => {
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

        EventBus.registerCommand('terminal:focus', async () => {
            const terminal = await getTerminal();

            if (!terminal || !terminal._currentWindowId) {
                throw new Error('No terminal window open');
            }

            WindowManager.focus(terminal._currentWindowId);
            return { focused: true };
        });

        EventBus.registerCommand('terminal:isOpen', async () => {
            const terminal = await getTerminal();
            return { open: terminal !== null };
        });
    }

    // ==========================================
    // QUERY HANDLERS
    // ==========================================
    _registerQueryHandlers() {
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
     * Block scripts from indirectly emitting privileged event namespaces via
     * delayed `timer:set` callbacks.
     */
    _isTimerEventAllowed(eventName) {
        if (typeof eventName !== 'string' || !eventName.trim()) return false;
        const BLOCKED_PREFIXES = ['command:', 'macro:', 'system:', 'plugin:', 'app:'];
        const lower = eventName.toLowerCase();
        return !BLOCKED_PREFIXES.some(prefix => lower.startsWith(prefix));
    }

    _registerTimerHandlers() {
        EventBus.on('timer:set', (payload) => {
            const { timerId, delay, event, payload: eventPayload, repeat } = payload;

            if (event && !this._isTimerEventAllowed(event)) {
                console.warn(`[CommandRegistry] timer:set blocked disallowed event name: "${event}"`);
                return;
            }

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

            this._macroSubscription = EventBus.on('*', (eventPayload, metadata, event) => {
                if (!this.isRecording) return;
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
                console.warn(`[CommandRegistry] Macro not found or empty: ${macroId}`);
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
    // INTROSPECTION HELPERS
    // ==========================================

    getActiveTimers() {
        return [...this.timers.keys()];
    }

    getSavedMacros() {
        return [...this.macros.keys()];
    }

    getMacro(macroId) {
        return this.macros.get(macroId) || null;
    }
}

const CommandRegistry = new CommandRegistryClass();

if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.commandRegistry = CommandRegistry;
}

export default CommandRegistry;
