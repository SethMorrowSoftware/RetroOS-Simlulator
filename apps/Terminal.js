/**
 * Terminal App - Retro Command Line Style
 * Features: File System, Network Sim, Easter Eggs
 * Classic 90s-era command prompt experience
 */

import AppBase from './AppBase.js';
import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import FileSystemManager from '../core/FileSystemManager.js';
import { PATHS } from '../core/Constants.js';
import ScriptEngine from '../core/script/ScriptEngine.js';
import { getConfig } from '../core/ConfigLoader.js';
import { escapeHtml } from '../core/Sanitize.js';
import MultiplayerClient from '../core/MultiplayerClient.js';

/**
 * W4.4 — Per-window state for Terminal.
 *
 * Each terminal window keeps its own `commandHistory`, `currentPath`,
 * `aliases`, `envVars`, etc. Opening two terminals previously made them
 * share that state (cd in one moved the other's prompt). The fix uses
 * `setInstanceState` / `getInstanceState` from AppBase, but the existing
 * 160+ references throughout this file are written as plain
 * `this.commandHistory` / `this.currentPath` etc. Rewriting every
 * reference is invasive; instead, we define accessor properties on the
 * prototype that proxy to instance state, so existing code reads/writes
 * `this.<field>` and gets per-window storage for free.
 *
 * Defaults are seeded in `onOpen()` for each new window so the first read
 * returns the right shape (mutating `this.commandHistory.push(...)` would
 * otherwise hit a fresh default array that's immediately discarded).
 *
 * The field list:
 *   commandHistory  []
 *   historyIndex    -1
 *   godMode         false
 *   activeProcess   null
 *   currentPath     [...PATHS.USER_HOME]
 *   lastOutput      ''
 *   aliases         {}
 *   batchCommands   []
 *   batchIndex      0
 *   pipeEnabled     true
 *   _mpSession      null
 *   _mpUnsubscribers []
 *   envVars         { PATH, PROMPT, COMSPEC, ... }
 */
const PER_WINDOW_FIELDS = [
    'commandHistory', 'historyIndex', 'godMode', 'activeProcess',
    'currentPath', 'lastOutput', 'aliases', 'batchCommands',
    'batchIndex', 'pipeEnabled', '_mpSession', '_mpUnsubscribers',
    'envVars'
];

function defaultEnvVars() {
    return {
        'PATH': 'C:\\WINDOWS;C:\\WINDOWS\\SYSTEM32;C:\\TOOLS',
        'PROMPT': '$P$G',
        'COMSPEC': 'C:\\WINDOWS\\SYSTEM32\\CMD.EXE',
        'TEMP': 'C:\\TEMP',
        'TMP': 'C:\\TEMP',
        'USERNAME': 'User',
        'COMPUTERNAME': getConfig('branding.computerName', 'ILLUMINATOS-PC'),
        'OS': getConfig('branding.osName', 'IlluminatOS!'),
        'WINDIR': 'C:\\WINDOWS'
    };
}

function defaultInstanceState() {
    return {
        commandHistory: [],
        historyIndex: -1,
        godMode: false,
        activeProcess: null,
        currentPath: [...PATHS.USER_HOME],
        lastOutput: '',
        aliases: {},
        batchCommands: [],
        batchIndex: 0,
        pipeEnabled: true,
        _mpSession: null,
        _mpUnsubscribers: [],
        envVars: defaultEnvVars()
    };
}

class Terminal extends AppBase {
    constructor() {
        super({
            id: 'terminal',
            name: 'Command Prompt',
            icon: '💻',
            width: 720,
            height: 500,
            minWidth: 480,
            minHeight: 320,
            resizable: true,
            category: 'systemtools'
            // No `singleton: true` anymore — each window owns its own state
            // via the per-window accessors defined below.
        });

        // Register semantic event commands for scriptability
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        // Execute a terminal command
        this.registerCommand('execute', (cmd) => {
            if (!cmd || typeof cmd !== 'string') {
                return { success: false, error: 'Command must be a string' };
            }
            try {
                this.executeCommand(cmd);
                EventBus.emit(Events.TERMINAL_COMMAND_EXECUTED, {
                    appId: this.id,
                    windowId: this.windowId,
                    command: cmd,
                    timestamp: Date.now()
                });
                return { success: true, command: cmd, output: this.lastOutput };
            } catch (error) {
                EventBus.emit(Events.TERMINAL_COMMAND_ERROR, {
                    appId: this.id,
                    command: cmd,
                    error: error.message
                });
                return { success: false, error: error.message };
            }
        });

        // Execute multiple commands in sequence
        this.registerCommand('executeSequence', (commands) => {
            if (!Array.isArray(commands)) {
                return { success: false, error: 'Commands must be an array' };
            }
            const outputs = [];
            for (const cmd of commands) {
                this.executeCommand(cmd);
                outputs.push(this.lastOutput);
            }
            return { success: true, outputs };
        });

        // Clear the terminal screen
        this.registerCommand('clear', () => {
            this.cmdClear();
            EventBus.emit(Events.TERMINAL_CLEARED, {
                appId: this.id,
                windowId: this.windowId,
                timestamp: Date.now()
            });
            return { success: true };
        });

        // Print text to terminal
        this.registerCommand('print', (text, color = null) => {
            if (text !== undefined && text !== null) {
                this.print(String(text), color);
                return { success: true, text: String(text) };
            }
            return { success: false, error: 'No text provided' };
        });

        // Print HTML to terminal
        this.registerCommand('printHtml', (html) => {
            if (html !== undefined && html !== null) {
                this.printHtml(String(html));
                return { success: true, html: String(html) };
            }
            return { success: false, error: 'No HTML provided' };
        });

        // Change directory
        this.registerCommand('cd', (path) => {
            if (!path) {
                return { success: false, error: 'Path required' };
            }
            try {
                this.cmdCd([path]);
                EventBus.emit(Events.TERMINAL_DIRECTORY_CHANGED, {
                    appId: this.id,
                    path: this.currentPath,
                    timestamp: Date.now()
                });
                return { success: true, path: this.currentPath };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // List directory contents
        this.registerCommand('dir', (path = null) => {
            try {
                const output = this.cmdDir(path ? [path] : []);
                return { success: true, output };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Read a file
        this.registerCommand('readFile', (filePath) => {
            if (!filePath) {
                return { success: false, error: 'File path required' };
            }
            try {
                const resolvedPath = this.resolvePath(filePath);
                const content = FileSystemManager.readFile(resolvedPath);
                return { success: true, content };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Write to a file
        this.registerCommand('writeFile', (filePath, content, extension = 'txt') => {
            if (!filePath || content === undefined) {
                return { success: false, error: 'File path and content required' };
            }
            try {
                const resolvedPath = this.resolvePath(filePath);
                FileSystemManager.writeFile(resolvedPath, content, extension);
                this.emitAppEvent('file:written', { path: resolvedPath });
                return { success: true, path: resolvedPath };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Set environment variable
        this.registerCommand('setEnvVar', (name, value) => {
            if (!name) {
                return { success: false, error: 'Variable name required' };
            }
            this.envVars[name.toUpperCase()] = String(value || '');
            return { success: true, name: name.toUpperCase(), value: this.envVars[name.toUpperCase()] };
        });

        // Get environment variable
        this.registerCommand('getEnvVar', (name) => {
            if (!name) {
                return { success: false, error: 'Variable name required' };
            }
            const value = this.envVars[name.toUpperCase()];
            return { success: true, name: name.toUpperCase(), value: value || null };
        });

        // Create an alias
        this.registerCommand('createAlias', (name, command) => {
            if (!name || !command) {
                return { success: false, error: 'Alias name and command required' };
            }
            this.aliases[name.toLowerCase()] = command;
            return { success: true, name: name.toLowerCase(), command };
        });

        // Remove an alias
        this.registerCommand('removeAlias', (name) => {
            if (!name) {
                return { success: false, error: 'Alias name required' };
            }
            const existed = !!this.aliases[name.toLowerCase()];
            delete this.aliases[name.toLowerCase()];
            return { success: true, existed };
        });

        // Run a script file
        this.registerCommand('runScript', (scriptPath) => {
            if (!scriptPath) {
                return { success: false, error: 'Script path required' };
            }
            try {
                const resolvedPath = this.resolvePath(scriptPath);
                if (scriptPath.endsWith('.retro')) {
                    this.executeRetroScript(resolvedPath);
                } else if (scriptPath.endsWith('.bat')) {
                    this.executeBatchFile(resolvedPath);
                } else {
                    return { success: false, error: 'Unknown script type. Use .retro or .bat' };
                }
                return { success: true, scriptPath: resolvedPath };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Focus the terminal window
        this.registerCommand('focus', () => {
            if (this.windowId) {
                EventBus.emit(Events.WINDOW_FOCUS, { windowId: this.windowId });
                return { success: true };
            }
            return { success: false, error: 'Window not available' };
        });

        // Minimize the terminal window
        this.registerCommand('minimize', () => {
            if (this.windowId) {
                EventBus.emit(Events.WINDOW_MINIMIZE, { windowId: this.windowId });
                return { success: true };
            }
            return { success: false, error: 'Window not available' };
        });

        // Maximize the terminal window
        this.registerCommand('maximize', () => {
            if (this.windowId) {
                EventBus.emit(Events.WINDOW_MAXIMIZE, { windowId: this.windowId });
                return { success: true };
            }
            return { success: false, error: 'Window not available' };
        });

        // Close the terminal
        this.registerCommand('closeTerminal', () => {
            this.close();
            return { success: true };
        });

        // Show a message in the terminal
        this.registerCommand('showMessage', (message, type = 'info') => {
            const colors = {
                'info': '#c0c0c0',
                'success': '#00ff00',
                'warning': '#ffff00',
                'error': '#ff0000',
                'cyan': '#00ffff',
                'magenta': '#ff00ff'
            };
            const color = colors[type] || '#c0c0c0';
            this.print(message, color);
            return { success: true, message, type };
        });

        // Create a file
        this.registerCommand('createFile', (filePath, content = '') => {
            try {
                const resolvedPath = this.resolvePath(filePath);
                const extension = filePath.split('.').pop() || 'txt';
                FileSystemManager.writeFile(resolvedPath, content, extension);
                this.emitAppEvent('file:created', { path: resolvedPath });
                return { success: true, path: resolvedPath };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Delete a file
        this.registerCommand('deleteFile', (filePath) => {
            try {
                const resolvedPath = this.resolvePath(filePath);
                FileSystemManager.deleteFile(resolvedPath);
                this.emitAppEvent('file:deleted', { path: resolvedPath });
                return { success: true, path: resolvedPath };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Check if file exists
        this.registerCommand('fileExists', (filePath) => {
            try {
                const resolvedPath = this.resolvePath(filePath);
                const exists = FileSystemManager.exists(resolvedPath);
                return { success: true, exists };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Launch an application
        this.registerCommand('launchApp', (appId, params = {}) => {
            if (!appId) {
                return { success: false, error: 'App ID required' };
            }
            import('./AppRegistry.js').then(module => {
                const AppRegistry = module.default;
                AppRegistry.launch(appId, params);
            });
            return { success: true, appId, params };
        });

        // Trigger matrix mode
        this.registerCommand('startMatrix', () => {
            this.startMatrix();
            return { success: true };
        });

        // Stop matrix mode
        this.registerCommand('stopMatrix', () => {
            if (this.activeProcess === 'matrix') {
                this.killProcess();
                return { success: true };
            }
            return { success: false, error: 'Matrix mode not active' };
        });

        // Query god mode status (activation only via konami code)
        this.registerCommand('enableGodMode', () => {
            if (!this.godMode) {
                return { success: false, error: 'God mode can only be activated via the terminal' };
            }
            return { success: true, godMode: this.godMode };
        });

        // Update prompt
        this.registerCommand('updatePrompt', () => {
            this.updatePrompt();
            return { success: true, prompt: this.getPrompt() };
        });
    }

    /**
     * Register queries for script inspection
     */
    registerQueries() {
        // Get current directory path
        this.registerQuery('getCurrentPath', () => {
            return {
                path: this.currentPath,
                pathString: this.currentPath.join('\\')
            };
        });

        // Get command history
        this.registerQuery('getHistory', () => {
            return { history: [...this.commandHistory] };
        });

        // Get last output
        this.registerQuery('getLastOutput', () => {
            return { output: this.lastOutput };
        });

        // Get environment variables
        this.registerQuery('getEnvVars', () => {
            return { envVars: { ...this.envVars } };
        });

        // Get all aliases
        this.registerQuery('getAliases', () => {
            return { aliases: { ...this.aliases } };
        });

        // Get terminal state
        this.registerQuery('getState', () => {
            return {
                currentPath: this.currentPath,
                pathString: this.currentPath.join('\\'),
                godMode: this.godMode,
                hasActiveProcess: this.activeProcess !== null,
                activeProcessType: this.activeProcess,
                historyCount: this.commandHistory.length,
                windowId: this.windowId
            };
        });

        // Get window information
        this.registerQuery('getWindowInfo', () => {
            return {
                windowId: this.windowId,
                appId: this.id,
                appName: this.name
            };
        });

        // Get full terminal output as text
        this.registerQuery('getAllOutput', () => {
            const output = this.getElement('#terminalOutput');
            return {
                outputText: output ? output.textContent : '',
                outputHtml: output ? output.innerHTML : ''
            };
        });

        // Check if god mode is active
        this.registerQuery('isGodMode', () => {
            return { godMode: this.godMode };
        });

        // Get batch execution state
        this.registerQuery('getBatchState', () => {
            return {
                isExecutingBatch: this.batchCommands.length > 0,
                batchCommandCount: this.batchCommands.length,
                currentBatchIndex: this.batchIndex
            };
        });
    }

    onOpen() {
        // W4.4 — seed this window's per-instance state with the defaults.
        // Subsequent reads of `this.commandHistory` etc. flow through the
        // accessors at the bottom of this file, which proxy to the
        // instance state map keyed by the current window id.
        const defaults = defaultInstanceState();
        for (const [key, value] of Object.entries(defaults)) {
            this.setInstanceState(key, value, false);
        }

        return `
            <div class="terminal-app" id="terminalApp">
                <canvas id="matrixCanvas"></canvas>
                <div class="terminal-scanlines"></div>
                <div class="terminal-vignette"></div>
                <div class="terminal-scroll" id="terminalScroller">
                    <div id="terminalOutput"></div>
                    <div class="terminal-input-line" id="inputLine">
                        <span class="terminal-prompt" id="promptText">C:\\Users\\User></span>
                        <input type="text" class="terminal-input" id="terminalInput" autocomplete="off" spellcheck="false">
                    </div>
                </div>
            </div>
            <style>
                #window-terminal .window-content {
                    padding: 0 !important;
                    margin: 0 !important;
                    overflow: hidden !important;
                }

                .terminal-app {
                    background: #0a0a0a;
                    color: #c0c0c0;
                    font-family: 'Consolas', 'Courier New', monospace;
                    font-size: 14px;
                    width: 100%;
                    height: 100%;
                    position: relative;
                    overflow: hidden;
                    box-sizing: border-box;
                }

                .terminal-app #matrixCanvas {
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    pointer-events: none;
                    display: none;
                    z-index: 1;
                }
                .terminal-app.matrix-mode #matrixCanvas {
                    display: block;
                }

                .terminal-scroll {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding: 8px;
                    z-index: 2;
                    box-sizing: border-box;
                }

                .terminal-app #terminalOutput {
                    white-space: pre-wrap;
                    word-break: break-word;
                }
                .terminal-app #terminalOutput > div {
                    margin-bottom: 1px;
                    line-height: 1.4;
                }

                .terminal-app .terminal-input-line {
                    display: flex;
                    align-items: center;
                    margin-top: 2px;
                }
                .terminal-app .terminal-prompt {
                    color: #c0c0c0;
                    margin-right: 0;
                    flex-shrink: 0;
                }
                .terminal-app .terminal-input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: #c0c0c0;
                    font-family: inherit;
                    font-size: inherit;
                    outline: none;
                    caret-color: #c0c0c0;
                    min-width: 0;
                    padding-left: 0;
                }
            </style>
        `;
    }

    onMount() {
        const input = this.getElement('#terminalInput');
        const scroller = this.getElement('#terminalScroller');

        if (scroller) {
            this.addHandler(scroller, 'click', () => {
                if (window.getSelection().toString().length === 0) {
                    input?.focus();
                }
            });
        }

        this.runBootSequence();

        // Emit terminal opened event for script handlers
        EventBus.emit(Events.APP_TERMINAL_OPENED, {
            appId: this.id,
            windowId: this.windowId,
            currentPath: this.currentPath,
            pathString: this.currentPath.join('\\'),
            timestamp: Date.now()
        });
    }

    runBootSequence() {
        const banner = getConfig('branding.terminalBanner', 'IlluminatOS! [Version 95.0.1995]');
        const osName = getConfig('branding.osName', 'IlluminatOS!');
        const biosVersion = getConfig('branding.biosVersion', 'IlluminatOS BIOS v2.1');

        const input = this.getElement('#terminalInput');
        const inputLine = this.getElement('#inputLine');
        if (inputLine) inputLine.style.display = 'none';

        // Realistic BIOS POST sequence
        const postLines = [
            { text: biosVersion, color: '#ffffff', delay: 80 },
            { text: `Copyright (C) 1995, ${osName} Team.`, color: '#c0c0c0', delay: 40 },
            { text: '', delay: 30 },
            { text: 'PENTIUM(R) PROCESSOR 133MHz', color: '#ffffff', delay: 60 },
            { text: '', delay: 20 },
            { text: 'Memory Test :   640K Base Memory', color: '#c0c0c0', delay: 50 },
            { text: '               15360K Extended Memory', color: '#c0c0c0', delay: 40 },
            { text: '               16000K OK', color: '#00ff00', delay: 60 },
            { text: '', delay: 30 },
            { text: 'Detecting Primary Master   ... C: 2048 MB', color: '#c0c0c0', delay: 70 },
            { text: 'Detecting Primary Slave    ... None', color: '#c0c0c0', delay: 40 },
            { text: 'Detecting Secondary Master ... D: CD-ROM', color: '#c0c0c0', delay: 50 },
            { text: 'Detecting Secondary Slave  ... None', color: '#c0c0c0', delay: 30 },
            { text: '', delay: 40 },
            { text: 'Press DEL to enter SETUP', color: '#808080', delay: 80 },
            { text: '', delay: 60 },
            { text: `Starting ${osName}...`, color: '#ffffff', delay: 100 },
            { text: '', delay: 40 },
            { text: 'HIMEM.SYS loaded.', color: '#c0c0c0', delay: 30 },
            { text: 'EMM386.EXE loaded.', color: '#c0c0c0', delay: 30 },
            { text: 'MSCDEX Version 2.25', color: '#c0c0c0', delay: 20 },
            { text: 'Drive D: = Driver OAKCDROM unit 0', color: '#c0c0c0', delay: 20 },
            { text: 'MOUSE.COM v9.01 loaded.', color: '#c0c0c0', delay: 30 },
            { text: 'Command history utility loaded.', color: '#c0c0c0', delay: 30 },
            { text: '', delay: 50 },
            { text: 'RetroOS Classic Shell', color: '#ffffff', delay: 60 },
            { text: `   ${banner}`, color: '#c0c0c0', delay: 40 },
            { text: `   (C) Copyright ${osName} Team 1995-${new Date().getFullYear()}.`, color: '#c0c0c0', delay: 40 },
            { text: '', delay: 20 },
            { text: 'C:\\>cd Users\\User', color: '#c0c0c0', delay: 40 },
            { text: '', delay: 20 },
        ];

        let totalDelay = 0;
        postLines.forEach((line, i) => {
            totalDelay += line.delay;
            setTimeout(() => {
                this.print(line.text, line.color);
                if (i === postLines.length - 1) {
                    if (inputLine) inputLine.style.display = 'flex';
                    input?.focus();
                    this.attachInputHandler();
                    // Emit sound event for boot complete
                    EventBus.emit(Events.SOUND_PLAY, { sound: 'startup' });
                }
            }, totalDelay);
        });
    }

    attachInputHandler() {
        const input = this.getElement('#terminalInput');
        if (!input) return;

        // Emit keyboard click sounds for immersive feel
        this.addHandler(input, 'keydown', (e) => {
            // Play subtle keyclick sound for printable keys
            if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Tab') {
                EventBus.emit(Events.SOUND_PLAY, { sound: 'click' });
            }
        });

        this.addHandler(input, 'keydown', (e) => {
            // Ctrl+C to kill process
            if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                if (this.activeProcess) {
                    this.killProcess();
                } else {
                    this.print('^C');
                }
                input.value = '';
                return;
            }

            // If a process is running, block input
            if (this.activeProcess && this.activeProcess !== 'more') {
                e.preventDefault();
                return;
            }

            // Handle 'more' process
            if (this.activeProcess === 'more') {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.continueMore();
                } else if (e.key === 'q' || e.key === 'Q') {
                    e.preventDefault();
                    this.killProcess();
                }
                return;
            }

            if (e.key === 'Enter') {
                const cmd = input.value;
                input.value = '';
                this.executeCommand(cmd);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(-1, input);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(1, input);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.tabComplete(input);
            }
        });
    }

    print(text, color = '#c0c0c0') {
        const output = this.getElement('#terminalOutput');
        if (!output) return;

        const div = document.createElement('div');
        div.style.color = color;
        div.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
        // Add phosphor glow animation for new lines
        div.classList.add('term-line-new');
        output.appendChild(div);
        this.scrollToBottom();

        // Remove the animation class after it completes to avoid re-triggering
        setTimeout(() => div.classList.remove('term-line-new'), 300);

        // Capture output for script access
        this.lastOutput = String(text);

        // Broadcast output to shared session
        this._mpBroadcastOutput(String(text), color);

        // Emit semantic event for output
        EventBus.emit(Events.TERMINAL_OUTPUT, {
            appId: this.id,
            windowId: this.windowId,
            text: String(text),
            color,
            timestamp: Date.now()
        });
    }

    printHtml(html) {
        const output = this.getElement('#terminalOutput');
        if (!output) return;

        // Sanitize using DOM-based approach instead of regex (which is bypassable).
        // Parse the HTML in an inert document, then allowlist safe tags/attributes.
        const sanitized = this._sanitizeHtml(String(html));

        const div = document.createElement('div');
        div.innerHTML = sanitized;
        output.appendChild(div);
        this.scrollToBottom();
    }

    /**
     * DOM-based HTML sanitizer. Parses HTML in an inert context, then
     * walks the tree keeping only allowlisted tags and attributes.
     * Much safer than regex-based stripping.
     */
    _sanitizeHtml(html) {
        const ALLOWED_TAGS = new Set([
            'b', 'i', 'u', 'em', 'strong', 'span', 'div', 'br', 'p',
            'code', 'pre', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
            'thead', 'tbody', 'a', 'sub', 'sup', 'hr', 'h1', 'h2', 'h3',
            'h4', 'h5', 'h6', 'small', 'mark', 'del', 'ins', 'abbr'
        ]);
        const ALLOWED_ATTRS = new Set([
            'class', 'style', 'title', 'colspan', 'rowspan'
        ]);

        // Parse in an inert document (no scripts execute)
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const clean = document.createDocumentFragment();

        const walkAndClean = (source, target) => {
            for (const node of source.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) {
                    target.appendChild(document.createTextNode(node.textContent));
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tag = node.tagName.toLowerCase();
                    if (ALLOWED_TAGS.has(tag)) {
                        const el = document.createElement(tag);
                        // Copy only safe attributes
                        for (const attr of node.attributes) {
                            const name = attr.name.toLowerCase();
                            if (ALLOWED_ATTRS.has(name)) {
                                // Block javascript: in style attribute
                                const val = attr.value.replace(/javascript\s*:/gi, '');
                                el.setAttribute(name, val);
                            }
                        }
                        walkAndClean(node, el);
                        target.appendChild(el);
                    } else {
                        // Skip disallowed tags but keep their text children
                        walkAndClean(node, target);
                    }
                }
            }
        };

        walkAndClean(doc.body, clean);

        // Serialize back to HTML string
        const wrapper = document.createElement('div');
        wrapper.appendChild(clean);
        return wrapper.innerHTML;
    }

    scrollToBottom() {
        if (this._scrollRafId) return; // Already scheduled
        this._scrollRafId = requestAnimationFrame(() => {
            this._scrollRafId = null;
            const scroller = this.getElement('#terminalScroller');
            if (scroller) {
                scroller.scrollTop = scroller.scrollHeight;
            }
        });
    }

    getPrompt() {
        return this.currentPath.join('\\') + '>';
    }

    updatePrompt() {
        const el = this.getElement('#promptText');
        if (el) el.textContent = this.getPrompt();
    }

    executeCommand(cmdLine) {
        const trimmed = cmdLine.trim();

        // Show what was typed
        this.print(this.getPrompt() + trimmed);

        if (!trimmed) return;

        // Broadcast command to shared session
        this._mpBroadcastCommand(trimmed);

        // Add to history
        this.commandHistory.push(trimmed);
        this.historyIndex = -1;

        // Variable interpolation - replace %VAR% with environment variable values
        let interpolated = this.interpolateVariables(trimmed);

        // Handle pipe operators
        if (this.pipeEnabled && interpolated.includes('|') && !interpolated.match(/echo.*>>/)) {
            return this.executePipedCommands(interpolated);
        }

        // Parse command and arguments (handle quoted strings)
        const parts = this.parseCommandLine(interpolated);
        let cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        // Resolve aliases
        if (this.aliases[cmd]) {
            const aliasCmd = this.aliases[cmd];
            return this.executeCommand(aliasCmd + ' ' + args.join(' '));
        }

        // Konami code easter egg
        if (trimmed.replace(/\s/g, '').toLowerCase() === 'uuddlrlrba') {
            this.godMode = true;
            FileSystemManager.godMode = true;
            this.print('*** GOD MODE ACTIVATED ***', '#ff00ff');
            return;
        }

        const commands = {
            // File system commands
            'help': () => this.cmdHelp(),
            '?': () => this.cmdHelp(),
            'cls': () => this.cmdClear(),
            'clear': () => this.cmdClear(),
            'dir': () => this.cmdDir(args),
            'ls': () => this.cmdDir(args),
            'cd': () => this.cmdCd(args),
            'chdir': () => this.cmdCd(args),
            'type': () => this.cmdType(args),
            'cat': () => this.cmdType(args),
            'more': () => this.cmdMore(args),
            'mkdir': () => this.cmdMkdir(args),
            'md': () => this.cmdMkdir(args),
            'rmdir': () => this.cmdRmdir(args),
            'rd': () => this.cmdRmdir(args),
            'del': () => this.cmdDel(args),
            'rm': () => this.cmdDel(args),
            'erase': () => this.cmdDel(args),
            'copy': () => this.cmdCopy(args),
            'cp': () => this.cmdCopy(args),
            'move': () => this.cmdMove(args),
            'mv': () => this.cmdMove(args),
            'ren': () => this.cmdRename(args),
            'rename': () => this.cmdRename(args),
            'tree': () => this.cmdTree(args),
            'find': () => this.cmdFind(args),
            'attrib': () => this.cmdAttrib(args),
            'edit': () => this.cmdEdit(args),
            'notepad': () => this.cmdEdit(args),
            'start': () => this.cmdStart(args),
            'open': () => this.cmdStart(args),

            // System commands
            'ver': () => this.cmdVer(),
            'vol': () => this.cmdVol(args),
            'label': () => this.cmdLabel(args),
            'date': () => this.cmdDate(),
            'time': () => this.cmdTime(),
            'whoami': () => this.cmdWhoami(),
            'hostname': () => 'RETROS-PC',
            'set': () => this.cmdSet(args),
            'path': () => this.cmdPath(args),
            'prompt': () => this.cmdPrompt(args),
            'echo': () => this.cmdEcho(args, trimmed),
            'mem': () => this.cmdMem(),
            'chkdsk': () => this.cmdChkdsk(args),
            'format': () => this.cmdFormat(args),
            'sys': () => this.cmdSys(),
            'systeminfo': () => this.cmdSystemInfo(),

            // Network commands
            'ipconfig': () => this.cmdIpConfig(),
            'ifconfig': () => this.cmdIpConfig(),
            'ping': () => this.cmdPing(args),
            'netstat': () => this.cmdNetstat(),
            'tracert': () => this.cmdTracert(args),
            'nslookup': () => this.cmdNslookup(args),

            // Fun commands
            'matrix': () => this.startMatrix(),
            'cowsay': () => this.cmdCowsay(args),
            'fortune': () => this.cmdFortune(),
            'disco': () => this.startDisco(),
            'party': () => this.startParty(),
            'color': () => this.cmdColor(args),

            // Scripting commands
            'retro': () => this.cmdRetro(args),
            'script': () => this.cmdRetro(args),
            'call': () => this.cmdCall(args),
            'bat': () => this.cmdCall(args),
            'newscript': () => this.cmdNewScript(args),
            'newbatch': () => this.cmdNewBatch(args),

            // Additional file commands
            'grep': () => this.cmdGrep(args),
            'touch': () => this.cmdTouch(args),
            'wget': () => this.cmdWget(args),
            'curl': () => this.cmdWget(args),
            'head': () => this.cmdHead(args),
            'tail': () => this.cmdTail(args),
            'wc': () => this.cmdWordCount(args),
            'diff': () => this.cmdDiff(args),
            'alias': () => this.cmdAlias(args),
            'unalias': () => this.cmdUnalias(args),

            // Other commands
            'sudo': () => this.cmdSudo(args),
            'bsod': () => this.triggerBSOD(),
            'share': () => this.cmdShareSession(args),
            'exit': () => { this.close(); return null; },
            'quit': () => { this.close(); return null; },
            'about': () => this.cmdAbout(),
            'credits': () => this.cmdCredits(),
            'xyzzy': () => 'Nothing happens.',
            '42': () => 'The Answer to Life, the Universe, and Everything.',

            // Enhanced retro commands
            'scanreg': () => this.cmdScanreg(),
            'scandisk': () => this.cmdScandisk(args),
            'defrag': () => this.cmdDefragSim(args),
            'tasklist': () => this.cmdTasklist(),
            'taskkill': () => this.cmdTaskkill(args),
            'sfc': () => this.cmdSfc(),
            'debug': () => this.cmdDebug(),
            'fdisk': () => this.cmdFdisk(),
            'mode': () => this.cmdMode(args),
            'title': () => this.cmdTitle(args),
            'choice': () => this.cmdChoice(args),
            'pause': () => this.cmdPause(),
            'shutdown': () => this.cmdShutdown(args),
            'reboot': () => this.cmdShutdown(['/r']),
            'logoff': () => this.cmdShutdown(['/l']),
        };

        // Handle drive switching (e.g., "C:" or "D:")
        if (cmd.match(/^[a-z]:$/)) {
            return this.cmdSwitchDrive(cmd.toUpperCase());
        }

        if (commands[cmd]) {
            const result = commands[cmd]();
            if (result) this.print(result);
        } else {
            // Try to open the command as a file in the current directory
            const fileResult = this.tryOpenFile(trimmed);
            if (!fileResult) {
                this.print(`'${cmd}' is not recognized as an internal or external command,`);
                this.print('operable program or batch file.');
            }
        }

        // Emit command executed event for script handlers
        EventBus.emit(Events.APP_TERMINAL_COMMAND, {
            appId: this.id,
            windowId: this.windowId,
            command: trimmed,
            cmd: cmd,
            args: args,
            output: this.lastOutput,
            currentPath: this.currentPath,
            pathString: this.currentPath.join('\\'),
            timestamp: Date.now()
        });
    }

    /**
     * Try to open a file by name in the current directory
     * Supports .lnk (shortcuts), .exe (executables), .txt/.md/.log (text), images
     * @param {string} fileName - The filename to try to open
     * @returns {boolean} True if file was found and opened
     */
    tryOpenFile(fileName) {
        // Try to resolve the file path
        const filePath = this.resolvePath(fileName);

        // Check if file exists
        const node = FileSystemManager.getNode(filePath);
        if (!node) return false;

        // If it's a directory, cd into it
        if (node.type === 'directory') {
            this.currentPath = filePath;
            this.updatePrompt();
            return true;
        }

        // Must be a file
        if (node.type !== 'file') return false;

        const extension = node.extension || fileName.split('.').pop().toLowerCase();

        // Handle different file types
        if (extension === 'lnk') {
            // Shortcut file - open the target
            return this.openShortcut(node);
        } else if (extension === 'exe') {
            // Executable - launch the app
            return this.openExecutable(node);
        } else if (extension === 'retro') {
            // RetroScript file - execute it
            this.executeRetroScript(filePath);
            return true;
        } else if (extension === 'bat') {
            // Batch file - execute it
            this.executeBatchFile(filePath);
            return true;
        } else if (['txt', 'md', 'log'].includes(extension)) {
            // Text file - open in Notepad
            this.openInNotepad(filePath);
            return true;
        } else if (['png', 'jpg', 'bmp', 'gif'].includes(extension)) {
            // Image file - open in Paint
            this.openInPaint(filePath);
            return true;
        }

        return false;
    }

    /**
     * Open a shortcut (.lnk) file
     * @param {Object} node - The file node
     * @returns {boolean} True if opened successfully
     */
    openShortcut(node) {
        if (node.shortcutType === 'link' && node.shortcutTarget) {
            // External link - open in browser
            this.print(`Opening ${node.shortcutTarget}...`);
            import('./AppRegistry.js').then(module => {
                const AppRegistry = module.default;
                AppRegistry.launch('browser', { url: node.shortcutTarget });
            });
            return true;
        } else if (node.shortcutTarget) {
            // App shortcut - launch the app
            this.print(`Launching ${node.shortcutTarget}...`);
            import('./AppRegistry.js').then(module => {
                const AppRegistry = module.default;
                AppRegistry.launch(node.shortcutTarget);
            });
            return true;
        }
        return false;
    }

    /**
     * Open an executable (.exe) file
     * @param {Object} node - The file node
     * @returns {boolean} True if opened successfully
     */
    openExecutable(node) {
        if (node.appId) {
            this.print(`Launching ${node.appId}...`);
            import('./AppRegistry.js').then(module => {
                const AppRegistry = module.default;
                AppRegistry.launch(node.appId);
            });
            return true;
        }
        return false;
    }

    /**
     * Open a text file in Notepad
     * @param {string[]} filePath - The file path array
     */
    openInNotepad(filePath) {
        this.print(`Opening in Notepad...`);
        import('./AppRegistry.js').then(module => {
            const AppRegistry = module.default;
            AppRegistry.launch('notepad', { filePath });
        });
    }

    /**
     * Open an image file in Paint
     * @param {string[]} filePath - The file path array
     */
    openInPaint(filePath) {
        this.print(`Opening in Paint...`);
        import('./AppRegistry.js').then(module => {
            const AppRegistry = module.default;
            AppRegistry.launch('paint', { filePath });
        });
    }

    /**
     * START command - opens a file or launches an application
     * @param {string[]} args - Command arguments
     * @returns {string} Result message
     */
    cmdStart(args) {
        if (args.length === 0) {
            return 'Usage: START <filename or app name>';
        }

        const target = args.join(' ');

        // Try to open as a file first
        if (this.tryOpenFile(target)) {
            return null;
        }

        // Try to launch as an app by name (case-insensitive)
        const appId = target.toLowerCase().replace(/\s+/g, '').replace('.exe', '');
        import('./AppRegistry.js').then(module => {
            const AppRegistry = module.default;
            const apps = AppRegistry.getAll();
            const app = apps.find(a =>
                a.id.toLowerCase() === appId ||
                a.name.toLowerCase() === target.toLowerCase()
            );

            if (app) {
                this.print(`Launching ${app.name}...`);
                AppRegistry.launch(app.id);
            } else {
                this.print(`Cannot find '${target}'`);
            }
        });

        return null;
    }

    parseCommandLine(line) {
        const parts = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ' ' && !inQuotes) {
                if (current) {
                    parts.push(current);
                    current = '';
                }
            } else {
                current += char;
            }
        }
        if (current) parts.push(current);
        return parts;
    }

    // === FILE SYSTEM COMMANDS ===

    cmdHelp() {
        return `
For more information on a specific command, type HELP command-name

FILE SYSTEM COMMANDS:
  ATTRIB     Displays file attributes.
  CD         Displays or changes the current directory.
  COPY       Copies files to another location.
  DEL        Deletes files.
  DIR        Displays a list of files and subdirectories.
  EDIT       Starts Notepad to edit a file.
  FIND       Searches for a text string in a file.
  MD         Creates a directory.
  MORE       Displays output one screen at a time.
  MOVE       Moves files from one directory to another.
  RD         Removes a directory.
  REN        Renames a file or directory.
  TREE       Displays directory structure graphically.
  TYPE       Displays the contents of a text file.

ADVANCED FILE COMMANDS:
  DIFF       Compares two files and shows differences.
  GREP       Searches for patterns in files (with options).
  HEAD       Displays the first lines of a file.
  TAIL       Displays the last lines of a file.
  TOUCH      Creates an empty file or updates timestamp.
  WC         Counts lines, words, and characters in a file.

SCRIPTING COMMANDS:
  RETRO      Executes a RetroScript file (.retro).
  SCRIPT     Alias for RETRO command.
  CALL       Executes a batch file (.bat).
  BAT        Alias for CALL command.
  NEWSCRIPT  Creates a new RetroScript template file.
  NEWBATCH   Creates a new batch file template.
  ALIAS      Creates command aliases.
  UNALIAS    Removes a command alias.

SYSTEM COMMANDS:
  CHKDSK     Checks a disk and displays a status report.
  CLS        Clears the screen.
  DATE       Displays the date.
  ECHO       Displays messages, or turns command echoing on/off.
  FORMAT     Formats a disk (simulated).
  HELP       Provides help information.
  MEM        Displays memory usage.
  PATH       Displays or sets the search path.
  SET        Displays or sets environment variables.
  START      Starts an application or opens a file.
  SYSTEMINFO Displays system configuration.
  TIME       Displays the system time.
  VER        Displays the operating system version.
  VOL        Displays the disk volume label.

NETWORK COMMANDS:
  IPCONFIG   Displays network configuration.
  PING       Tests network connectivity.
  NETSTAT    Displays network statistics.
  TRACERT    Traces route to destination.
  NSLOOKUP   DNS lookup.
  WGET       Downloads files from URL (simulated).
  CURL       Alias for WGET.

DIAGNOSTIC COMMANDS:
  CHKDSK     Checks a disk and displays a status report.
  DEFRAG     Defragments a disk drive (visual simulation).
  SCANDISK   Scans disk surface for errors.
  SCANREG    Checks the system registry for errors.
  SFC        System File Checker - verifies system files.

PROCESS MANAGEMENT:
  TASKLIST   Displays a list of running processes.
  TASKKILL   Terminates a running process.

TERMINAL MODES:
  MODE       Switch phosphor display mode (green/amber/white).
  TITLE      Sets the terminal window title.

POWER MANAGEMENT:
  SHUTDOWN   Shuts down the system (/S, /R, /L, /T).

FEATURES:
  - Variable interpolation: Use %VAR% in commands
  - Pipe operators: Chain commands with | (e.g., dir | grep txt)
  - Type any .retro or .bat filename to execute it
  - Phosphor modes: mode green, mode amber, mode white

TIP: Type a filename to open it (e.g. "snake.lnk" or "welcome.txt")

FUN:       matrix, disco, party, cowsay, fortune, color, debug, fdisk`;
    }

    cmdClear() {
        const output = this.getElement('#terminalOutput');
        if (output) output.innerHTML = '';
        return null;
    }

    cmdDir(args) {
        try {
            // Parse options
            let showWide = false;
            let showBare = false;
            let targetPath = this.currentPath;

            for (const arg of args) {
                if (arg.toLowerCase() === '/w') showWide = true;
                else if (arg.toLowerCase() === '/b') showBare = true;
                else if (!arg.startsWith('/')) {
                    targetPath = this.resolvePath(arg);
                }
            }

            const items = FileSystemManager.listDirectory(targetPath);
            const pathStr = targetPath.join('\\');

            if (showBare) {
                // Bare format - just names
                let out = '';
                for (const item of items) {
                    out += item.name + '\n';
                }
                return out;
            }

            // Get volume info
            const drive = targetPath[0];
            const driveNode = FileSystemManager.getNode([drive]);
            const volumeLabel = driveNode?.label || 'LOCAL DISK';

            let out = `\n Volume in drive ${drive.charAt(0)} is ${volumeLabel.toUpperCase()}`;
            out += `\n Volume Serial Number is 1995-1225`;
            out += `\n\n Directory of ${pathStr}\n\n`;

            if (showWide) {
                // Wide format - multiple columns
                let col = 0;
                for (const item of items) {
                    const name = item.type === 'directory' ? `[${item.name}]` : item.name;
                    out += name.padEnd(20);
                    col++;
                    if (col >= 3) {
                        out += '\n';
                        col = 0;
                    }
                }
                if (col !== 0) out += '\n';
            } else {
                // Standard format with dates and sizes
                let fileCount = 0;
                let dirCount = 0;
                let totalSize = 0;

                for (const item of items) {
                    const date = item.modified ? new Date(item.modified) : new Date();
                    const dateStr = date.toLocaleDateString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: 'numeric'
                    }).replace(/\//g, '-');
                    const timeStr = date.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });

                    if (item.type === 'directory' || item.type === 'drive') {
                        out += `${dateStr}  ${timeStr}    <DIR>          ${item.name}\n`;
                        dirCount++;
                    } else {
                        const sizeStr = String(item.size || 0).padStart(14);
                        out += `${dateStr}  ${timeStr} ${sizeStr} ${item.name}\n`;
                        fileCount++;
                        totalSize += item.size || 0;
                    }
                }

                out += `\n               ${fileCount} File(s)    ${totalSize.toLocaleString()} bytes`;
                out += `\n               ${dirCount} Dir(s)   ${this.getFreeSpace(targetPath[0])} bytes free`;
            }

            return out;
        } catch (e) {
            return 'File Not Found';
        }
    }

    cmdCd(args) {
        if (!args[0]) {
            return this.currentPath.join('\\');
        }

        const target = args.join(' ');

        if (target === '..') {
            if (this.currentPath.length > 1) {
                this.currentPath.pop();
            }
        } else if (target === '\\' || target === '/') {
            this.currentPath = [this.currentPath[0]];
        } else if (target === '.') {
            // Stay in current directory
        } else {
            const newPath = this.resolvePath(target);
            const node = FileSystemManager.getNode(newPath);

            if (node && (node.type === 'directory' || node.type === 'drive' || node.children)) {
                this.currentPath = newPath;
            } else {
                return 'The system cannot find the path specified.';
            }
        }
        this.updatePrompt();
        return '';
    }

    cmdSwitchDrive(drive) {
        const node = FileSystemManager.getNode([drive]);
        if (node) {
            this.currentPath = [drive];
            this.updatePrompt();
            return '';
        }
        return 'The system cannot find the drive specified.';
    }

    cmdType(args) {
        if (!args[0]) return 'The syntax of the command is incorrect.';

        try {
            const filePath = this.resolvePath(args[0]);
            const content = FileSystemManager.readFile(filePath);
            return content;
        } catch (e) {
            return 'The system cannot find the file specified.';
        }
    }

    cmdMore(args) {
        if (!args[0]) return 'The syntax of the command is incorrect.';

        try {
            const filePath = this.resolvePath(args[0]);
            const content = FileSystemManager.readFile(filePath);
            const lines = content.split('\n');

            this.moreBuffer = lines;
            this.moreIndex = 0;
            this.activeProcess = 'more';

            this.showMorePage();
            return null;
        } catch (e) {
            return 'The system cannot find the file specified.';
        }
    }

    showMorePage() {
        const pageSize = 20;
        const endIndex = Math.min(this.moreIndex + pageSize, this.moreBuffer.length);

        for (let i = this.moreIndex; i < endIndex; i++) {
            this.print(this.moreBuffer[i]);
        }

        this.moreIndex = endIndex;

        if (this.moreIndex >= this.moreBuffer.length) {
            this.activeProcess = null;
            this.moreBuffer = null;
        } else {
            this.print('-- More -- (Press SPACE or ENTER for more, Q to quit)', '#ffff00');
        }
    }

    continueMore() {
        if (this.moreBuffer) {
            this.showMorePage();
        }
    }

    cmdMkdir(args) {
        if (!args[0]) return 'The syntax of the command is incorrect.';

        try {
            const dirPath = this.resolvePath(args[0]);
            FileSystemManager.createDirectory(dirPath);
            return '';
        } catch (e) {
            if (e.message.includes('already exists')) {
                return 'A subdirectory or file already exists.';
            }
            return `Unable to create directory - ${e.message}`;
        }
    }

    cmdRmdir(args) {
        if (!args[0]) return 'The syntax of the command is incorrect.';

        const recursive = args.includes('/s') || args.includes('/S');
        const target = args.find(a => !a.startsWith('/'));

        if (!target) return 'The syntax of the command is incorrect.';

        try {
            const dirPath = this.resolvePath(target);
            FileSystemManager.deleteDirectory(dirPath, recursive);
            return '';
        } catch (e) {
            if (e.message.includes('not empty')) {
                return 'The directory is not empty.';
            }
            return 'The system cannot find the file specified.';
        }
    }

    cmdDel(args) {
        if (!args[0]) return 'The syntax of the command is incorrect.';

        try {
            const filePath = this.resolvePath(args[0]);
            FileSystemManager.deleteFile(filePath);
            return '';
        } catch (e) {
            return 'The system cannot find the file specified.';
        }
    }

    cmdCopy(args) {
        if (args.length < 2) return 'The syntax of the command is incorrect.';

        try {
            const srcPath = this.resolvePath(args[0]);
            let destPath = this.resolvePath(args[1]);

            // Check if destination is a directory
            const destNode = FileSystemManager.getNode(destPath);
            if (destNode && (destNode.type === 'directory' || destNode.children)) {
                // Copy into directory
                FileSystemManager.copyItem(srcPath, destPath);
            } else {
                // Copy as new filename
                const content = FileSystemManager.readFile(srcPath);
                const srcInfo = FileSystemManager.getInfo(srcPath);
                FileSystemManager.writeFile(destPath, content, srcInfo.extension);
            }
            return '        1 file(s) copied.';
        } catch (e) {
            return 'The system cannot find the file specified.';
        }
    }

    cmdMove(args) {
        if (args.length < 2) return 'The syntax of the command is incorrect.';

        try {
            const srcPath = this.resolvePath(args[0]);
            const destPath = this.resolvePath(args[1]);

            // Check if destination is a directory
            const destNode = FileSystemManager.getNode(destPath);
            if (destNode && (destNode.type === 'directory' || destNode.children)) {
                FileSystemManager.moveItem(srcPath, destPath);
            } else {
                // Move as rename
                const content = FileSystemManager.readFile(srcPath);
                const srcInfo = FileSystemManager.getInfo(srcPath);
                FileSystemManager.writeFile(destPath, content, srcInfo.extension);
                FileSystemManager.deleteFile(srcPath);
            }
            return '        1 file(s) moved.';
        } catch (e) {
            return 'The system cannot find the file specified.';
        }
    }

    cmdRename(args) {
        if (args.length < 2) return 'The syntax of the command is incorrect.';

        try {
            const srcPath = this.resolvePath(args[0]);
            const newName = args[1];
            const parentPath = srcPath.slice(0, -1);
            const destPath = [...parentPath, newName];

            const content = FileSystemManager.readFile(srcPath);
            const srcInfo = FileSystemManager.getInfo(srcPath);
            FileSystemManager.writeFile(destPath, content, srcInfo.extension);
            FileSystemManager.deleteFile(srcPath);
            return '';
        } catch (e) {
            return 'The system cannot find the file specified.';
        }
    }

    cmdTree(args) {
        const targetPath = args[0] ? this.resolvePath(args[0]) : this.currentPath;

        try {
            let out = `Folder PATH listing for volume ${targetPath[0]}\n`;
            out += `${targetPath.join('\\')}\n`;
            out += this.buildTree(targetPath, '');
            return out;
        } catch (e) {
            return 'Invalid path';
        }
    }

    buildTree(path, prefix) {
        let out = '';
        try {
            const items = FileSystemManager.listDirectory(path);
            const dirs = items.filter(i => i.type === 'directory');

            for (let i = 0; i < dirs.length; i++) {
                const dir = dirs[i];
                const isLast = i === dirs.length - 1;
                const connector = isLast ? '└───' : '├───';
                const newPrefix = prefix + (isLast ? '    ' : '│   ');

                out += `${prefix}${connector}${dir.name}\n`;
                out += this.buildTree([...path, dir.name], newPrefix);
            }
        } catch (e) {
            // Directory access error, skip
        }
        return out;
    }

    cmdFind(args) {
        if (args.length < 1) return 'FIND: Parameter format not correct';

        // Parse: find "string" filename
        let searchStr = '';
        let fileName = '';

        for (const arg of args) {
            if (arg.startsWith('"') && arg.endsWith('"')) {
                searchStr = arg.slice(1, -1);
            } else if (!arg.startsWith('/')) {
                fileName = arg;
            }
        }

        if (!searchStr) return 'FIND: Parameter format not correct';
        if (!fileName) return 'FIND: Parameter format not correct';

        try {
            const filePath = this.resolvePath(fileName);
            const content = FileSystemManager.readFile(filePath);
            const lines = content.split('\n');

            let out = `\n---------- ${fileName}\n`;
            let found = false;

            for (const line of lines) {
                if (line.toLowerCase().includes(searchStr.toLowerCase())) {
                    out += line + '\n';
                    found = true;
                }
            }

            if (!found) {
                out += '(no matches found)\n';
            }

            return out;
        } catch (e) {
            return `File not found - ${fileName}`;
        }
    }

    cmdAttrib(args) {
        if (!args[0]) {
            // Show attributes for all files in current directory
            try {
                const items = FileSystemManager.listDirectory(this.currentPath);
                let out = '';
                for (const item of items) {
                    const attrs = item.type === 'directory' ? 'D' : 'A';
                    out += `     ${attrs}     ${this.currentPath.join('\\')}\\${item.name}\n`;
                }
                return out;
            } catch (e) {
                return 'File not found';
            }
        }

        const filePath = this.resolvePath(args[0]);
        try {
            const info = FileSystemManager.getInfo(filePath);
            const attrs = info.type === 'directory' ? 'D' : 'A';
            return `     ${attrs}     ${filePath.join('\\')}`;
        } catch (e) {
            return 'File not found - ' + args[0];
        }
    }

    cmdEdit(args) {
        if (!args[0]) return 'The syntax of the command is incorrect.';

        const filePath = this.resolvePath(args[0]);

        import('./AppRegistry.js').then(module => {
            const AppRegistry = module.default;
            AppRegistry.launch('notepad', { filePath });
        });

        return '';
    }

    // === SYSTEM COMMANDS ===

    cmdVer() {
        const banner = getConfig('branding.terminalBanner', 'IlluminatOS! [Version 95.0.1995]');
        return `\n${banner}`;
    }

    cmdVol(args) {
        const drive = args[0] ? args[0].toUpperCase().replace(':', '') + ':' : this.currentPath[0];
        const node = FileSystemManager.getNode([drive]);

        if (!node) {
            return 'The system cannot find the drive specified.';
        }

        const label = node.label || 'NO NAME';
        return ` Volume in drive ${drive.charAt(0)} is ${label.toUpperCase()}\n Volume Serial Number is 1995-1225`;
    }

    cmdLabel(args) {
        return 'Access Denied - Volume label modification not supported.';
    }

    cmdDate() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
            weekday: 'short',
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        });
        return `The current date is: ${dateStr}`;
    }

    cmdTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        return `The current time is: ${timeStr}`;
    }

    cmdWhoami() {
        const computerName = getConfig('branding.computerName', 'ILLUMINATOS-PC');
        if (this.godMode) {
            return `${computerName}\\Administrator (GOD MODE)`;
        }
        return `${computerName}\\User`;
    }

    cmdSet(args) {
        if (!args[0]) {
            // Show all environment variables
            let out = '';
            for (const [key, value] of Object.entries(this.envVars)) {
                out += `${key}=${value}\n`;
            }
            return out;
        }

        // Set a variable
        const match = args.join(' ').match(/^(\w+)=(.*)$/);
        if (match) {
            this.envVars[match[1].toUpperCase()] = match[2];
            return '';
        }

        // Show specific variable
        const varName = args[0].toUpperCase();
        if (this.envVars[varName]) {
            return `${varName}=${this.envVars[varName]}`;
        }
        return `Environment variable ${args[0]} not defined`;
    }

    cmdPath(args) {
        if (!args[0]) {
            return `PATH=${this.envVars.PATH}`;
        }
        this.envVars.PATH = args.join(' ');
        return '';
    }

    cmdPrompt(args) {
        if (!args[0]) {
            return `PROMPT=${this.envVars.PROMPT}`;
        }
        this.envVars.PROMPT = args.join(' ');
        return '';
    }

    cmdEcho(args, fullCommand) {
        // Check for output redirection
        const redirectMatch = fullCommand.match(/^echo\s+(.*?)\s*(?:(>>?)\s*(.+))$/i);

        if (redirectMatch) {
            const text = redirectMatch[1].trim();
            const appendMode = redirectMatch[2] === '>>';
            const fileName = redirectMatch[3].trim();

            try {
                const filePath = this.resolvePath(fileName);

                if (appendMode && FileSystemManager.exists(filePath)) {
                    const existingContent = FileSystemManager.readFile(filePath);
                    FileSystemManager.writeFile(filePath, existingContent + '\n' + text);
                } else {
                    FileSystemManager.writeFile(filePath, text);
                }
                return null;
            } catch (e) {
                return `The system cannot find the path specified.`;
            }
        }

        // Check for ECHO ON/OFF
        if (args[0]?.toLowerCase() === 'on' || args[0]?.toLowerCase() === 'off') {
            return `ECHO is ${args[0].toLowerCase()}.`;
        }

        // Just echo the text
        if (!args.length) {
            return 'ECHO is on.';
        }
        return args.join(' ');
    }

    cmdMem() {
        return `
Memory Type         Total      Used       Free
---------------  --------  --------  --------
Conventional         640K      425K      215K
Upper                  0K        0K        0K
Reserved               0K        0K        0K
Extended (XMS)    15,360K   12,288K    3,072K
---------------  --------  --------  --------
Total memory     16,000K   12,713K    3,287K

Total under 1 MB      640K      425K      215K

Largest executable program size        214K (219,648 bytes)
Largest free upper memory block          0K       (0 bytes)
Command shell is resident in the high memory area.`;
    }

    cmdChkdsk(args) {
        const drive = args[0] ? args[0].toUpperCase().replace(':', '') + ':' : this.currentPath[0];

        this.print(`\nChecking ${drive}...`);

        // Simulate disk check
        setTimeout(() => {
            const totalSize = this.getDriveSize(drive);
            const usedSize = FileSystemManager.getDirectorySize([drive]);
            const freeSize = totalSize - usedSize;

            this.print(`\n  Volume Serial Number is 1995-1225`);
            this.print(`\n  ${totalSize.toLocaleString()} bytes total disk space.`);
            this.print(`  ${usedSize.toLocaleString()} bytes in user files.`);
            this.print(`  ${freeSize.toLocaleString()} bytes available on disk.`);
            this.print(`\n  512 bytes in each allocation unit.`);
            this.print(`  ${Math.floor(totalSize / 512).toLocaleString()} total allocation units on disk.`);
            this.print(`  ${Math.floor(freeSize / 512).toLocaleString()} allocation units available on disk.`);
        }, 500);

        return null;
    }

    cmdFormat(args) {
        if (!args[0]) return 'Required parameter missing';

        const drive = args[0].toUpperCase();
        if (drive === 'C:') {
            return `\nFormat cannot be done on the system drive.\nThis is your main disk drive - formatting it would destroy the operating system!`;
        }

        return `\nWARNING: ALL DATA ON NON-REMOVABLE DISK\nDRIVE ${drive} WILL BE LOST!\nProceed with Format (Y/N)? _\n\n(Format simulation - no actual formatting will occur)`;
    }

    cmdSys() {
        return 'System transferred';
    }

    cmdSystemInfo() {
        const bootTime = new Date(Date.now() - Math.random() * 86400000);
        const uptime = Date.now() - bootTime.getTime();
        const uptimeHrs = Math.floor(uptime / 3600000);
        const uptimeMins = Math.floor((uptime % 3600000) / 60000);
        const osName = getConfig('branding.osName', 'IlluminatOS!');
        const version = getConfig('branding.version', '95.0');
        const buildNumber = getConfig('branding.buildNumber', '1995');
        const biosVersion = getConfig('branding.biosVersion', 'IlluminatOS BIOS v2.1');
        const windows = StateManager.getState('windows') || [];

        const computerName = getConfig('branding.computerName', 'ILLUMINATOS-PC');
        return `
Host Name:                 ${computerName}
OS Name:                   ${osName} 95
OS Version:                ${version}.${buildNumber} Build ${buildNumber}
OS Manufacturer:           ${osName} Team
OS Configuration:          Standalone Workstation
OS Build Type:             Multiprocessor Free
Registered Owner:          User
Product ID:                12345-OEM-0012345-67890
Original Install Date:     12/25/1995, 12:00:00 AM
System Boot Time:          ${bootTime.toLocaleString()}
System Uptime:             ${uptimeHrs} Hours, ${uptimeMins} Minutes
System Manufacturer:       Generic PC Corp.
System Model:              IBM PC/AT Compatible
System Type:               x86-based PC
Processor(s):              1 Processor(s) Installed.
                           [01]: Intel Pentium(R) Processor 133MHz
BIOS Version:              ${biosVersion}
Windows Directory:         C:\\WINDOWS
System Directory:          C:\\WINDOWS\\SYSTEM32
Boot Device:               \\Device\\HarddiskVolume1
System Locale:             en-us;English (United States)
Input Locale:              en-us;English (United States)
Time Zone:                 (UTC) Coordinated Universal Time
Total Physical Memory:     16,384 KB
Available Physical Memory: 12,288 KB
Virtual Memory: Max Size:  32,768 KB
Virtual Memory: Available: 24,576 KB
Virtual Memory: In Use:    8,192 KB
Page File Location(s):    C:\\pagefile.sys
Domain:                    WORKGROUP
Logon Server:              \\\\${computerName}
Hotfix(s):                 3 Hotfix(s) Installed.
                           [01]: KB1995001
                           [02]: KB1995042
                           [03]: KB1996001
Network Card(s):           1 NIC(s) Installed.
                           [01]: Realtek RTL8029 Ethernet Adapter
                                 Connection Name: Local Area Connection
                                 Status:          Media connected
                                 IP address(es)
                                 [01]: 192.168.1.42
Running Processes:         ${9 + windows.length}`;
    }

    // === NETWORK COMMANDS ===

    cmdIpConfig() {
        return `
Windows IP Configuration

Ethernet adapter Local Area Connection:

   Connection-specific DNS Suffix  . :
   IPv4 Address. . . . . . . . . . . : 192.168.1.42
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.1.1

Ethernet adapter Local Area Connection:

   Media State . . . . . . . . . . . : Media disconnected
   Connection-specific DNS Suffix  . :`;
    }

    cmdPing(args) {
        const host = args[0] || 'localhost';
        this.activeProcess = 'ping';
        this.print(`\nPinging ${host} with 32 bytes of data:\n`);

        let count = 0;
        const interval = setInterval(() => {
            if (count >= 4 || this.activeProcess !== 'ping') {
                clearInterval(interval);
                if (this.activeProcess === 'ping') {
                    this.print(`\nPing statistics for ${host}:`);
                    this.print('    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),');
                    this.print('Approximate round trip times in milli-seconds:');
                    this.print('    Minimum = 10ms, Maximum = 35ms, Average = 22ms');
                    this.activeProcess = null;
                }
                return;
            }
            const ms = Math.floor(Math.random() * 25) + 10;
            const ttl = host === 'localhost' || host === '127.0.0.1' ? 128 : 64 - Math.floor(Math.random() * 10);
            this.print(`Reply from ${host}: bytes=32 time=${ms}ms TTL=${ttl}`);
            count++;
        }, 600);

        return null;
    }

    cmdNetstat() {
        return `
Active Connections

  Proto  Local Address          Foreign Address        State
  TCP    0.0.0.0:80             0.0.0.0:0              LISTENING
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING
  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING
  TCP    192.168.1.42:139       0.0.0.0:0              LISTENING
  TCP    192.168.1.42:49234     142.250.80.46:443      ESTABLISHED
  TCP    192.168.1.42:49235     151.101.1.69:443       ESTABLISHED
  UDP    0.0.0.0:123            *:*
  UDP    0.0.0.0:500            *:*
  UDP    192.168.1.42:137       *:*
  UDP    192.168.1.42:138       *:*`;
    }

    cmdTracert(args) {
        if (!args[0]) return 'The syntax of the command is incorrect.';

        const host = args[0];
        this.activeProcess = 'tracert';
        this.print(`\nTracing route to ${host}`);
        this.print('over a maximum of 30 hops:\n');

        const hops = [
            '192.168.1.1',
            '10.0.0.1',
            '172.16.0.1',
            '209.85.143.1',
            host
        ];

        let hop = 0;
        const interval = setInterval(() => {
            if (hop >= hops.length || this.activeProcess !== 'tracert') {
                clearInterval(interval);
                if (this.activeProcess === 'tracert') {
                    this.print('\nTrace complete.');
                    this.activeProcess = null;
                }
                return;
            }
            const ms1 = Math.floor(Math.random() * 20) + 5;
            const ms2 = Math.floor(Math.random() * 20) + 5;
            const ms3 = Math.floor(Math.random() * 20) + 5;
            this.print(`  ${(hop + 1).toString().padStart(2)}    ${ms1} ms    ${ms2} ms    ${ms3} ms  ${hops[hop]}`);
            hop++;
        }, 400);

        return null;
    }

    cmdNslookup(args) {
        if (!args[0]) {
            return `Default Server:  dns.local\nAddress:  192.168.1.1\n\n> `;
        }

        const host = args[0];
        const fakeIP = `${Math.floor(Math.random() * 200) + 50}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        return `Server:  dns.local\nAddress:  192.168.1.1\n\nNon-authoritative answer:\nName:    ${host}\nAddress: ${fakeIP}`;
    }

    // === FUN COMMANDS ===

    startMatrix() {
        this.activeProcess = 'matrix';
        const container = this.getElement('#terminalApp');
        const canvas = this.getElement('#matrixCanvas');
        if (!canvas || !container) return 'Matrix unavailable.';

        const ctx = canvas.getContext('2d');
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
        container.classList.add('matrix-mode');

        const cols = Math.floor(canvas.width / 20);
        const drops = Array(cols).fill(1);

        this.matrixInterval = setInterval(() => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#0f0';
            ctx.font = '15px monospace';

            drops.forEach((y, i) => {
                const char = String.fromCharCode(0x30A0 + Math.random() * 96);
                ctx.fillText(char, i * 20, y * 20);
                if (y * 20 > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            });
        }, 50);

        StateManager.unlockAchievement('matrix_mode');
        this.print('Entering the Matrix... (Ctrl+C to exit)', '#00ff00');
        return null;
    }

    cmdCowsay(args) {
        const msg = args.join(' ') || 'Moo!';
        const border = '-'.repeat(msg.length + 2);
        return `
 ${border}
< ${msg} >
 ${border}
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`;
    }

    cmdFortune() {
        const fortunes = [
            "A computer once beat me at chess, but it was no match for kickboxing.",
            "There are 10 types of people: those who understand binary and those who don't.",
            "It's not a bug, it's a feature.",
            "Have you tried turning it off and on again?",
            "The best thing about a boolean is even if you are wrong, you are only off by a bit.",
            "In a world without walls and fences, who needs Windows and Gates?",
            "There's no place like 127.0.0.1",
            "To err is human... to really foul things up requires a computer.",
            "Artificial Intelligence usually beats natural stupidity.",
            "A user interface is like a joke. If you have to explain it, it's not that good.",
            "The cloud is just someone else's computer.",
            "I would love to change the world, but they won't give me the source code."
        ];
        return fortunes[Math.floor(Math.random() * fortunes.length)];
    }

    startDisco() {
        document.body.classList.add('disco-mode');
        setTimeout(() => document.body.classList.remove('disco-mode'), 10000);
        StateManager.unlockAchievement('disco_fever');
        return 'DISCO MODE ACTIVATED!';
    }

    startParty() {
        document.body.classList.add('disco-mode');
        EventBus.emit(Events.PET_TOGGLE, { enabled: true });
        setTimeout(() => document.body.classList.remove('disco-mode'), 10000);
        return 'PARTY TIME!';
    }

    cmdColor(args) {
        const colors = {
            '0': '#000000', '1': '#000080', '2': '#008000', '3': '#008080',
            '4': '#800000', '5': '#800080', '6': '#808000', '7': '#c0c0c0',
            '8': '#808080', '9': '#0000ff', 'a': '#00ff00', 'b': '#00ffff',
            'c': '#ff0000', 'd': '#ff00ff', 'e': '#ffff00', 'f': '#ffffff'
        };

        if (!args[0]) {
            return 'Sets the default console foreground and background colors.\n\nCOLOR [attr]\n\n  attr  Specifies two hex digits: background + foreground\n        0 = Black    8 = Gray\n        1 = Blue     9 = Light Blue\n        2 = Green    A = Light Green\n        3 = Aqua     B = Light Aqua\n        4 = Red      C = Light Red\n        5 = Purple   D = Light Purple\n        6 = Yellow   E = Light Yellow\n        7 = White    F = Bright White\n\n  Examples: COLOR 0A (green on black)\n            COLOR 1F (bright white on blue)\n            COLOR 07 (default)';
        }

        const code = args[0].toLowerCase();

        if (code.length === 2) {
            // Two-character code: background + foreground (authentic legacy style)
            const bg = colors[code.charAt(0)];
            const fg = colors[code.charAt(1)];
            if (bg && fg) {
                const container = this.getElement('#terminalApp');
                if (container) container.style.backgroundColor = bg;
                this.setTerminalColors(fg);
            }
        } else if (code.length === 1) {
            const fg = colors[code];
            if (fg) {
                this.setTerminalColors(fg);
            }
        }
        return '';
    }

    // === OTHER COMMANDS ===

    cmdSudo(args) {
        if (args.join(' ') === 'make me a sandwich') {
            return 'Okay.';
        }
        return this.godMode
            ? 'Command executed with elevated privileges.'
            : "This incident will be reported.";
    }

    triggerBSOD() {
        EventBus.emit(Events.BSOD_SHOW, {
            title: 'KERNEL_PANIC',
            msg: 'System halted. Just kidding!'
        });
        StateManager.unlockAchievement('bsod_master');
        return '';
    }

    cmdAbout() {
        const banner = getConfig('branding.terminalBanner', 'IlluminatOS! [Version 95.0.1995]');
        const aboutText = getConfig('branding.aboutText', '(C) Copyright IlluminatOS Team 1995-2025');
        const tagline = getConfig('branding.tagline', 'Made with nostalgia and JavaScript');
        const websiteUrl = getConfig('branding.websiteUrl', '');
        let result = `
${banner}
${aboutText}

${tagline}`;
        if (websiteUrl) {
            result += `\nVisit: ${websiteUrl}`;
        }
        return result;
    }

    cmdCredits() {
        const creditsTitle = getConfig('branding.creditsTitle', 'ILLUMINATOS! - CREDITS');
        return `
${creditsTitle}
${'='.repeat(creditsTitle.length)}

Engine: Vanilla JavaScript
Inspiration: Classic 90s desktop systems

Special Thanks:
- Everyone who remembers the 90s
- Coffee

"Where do you want to go today?"`;
    }

    // === ENHANCED RETRO COMMANDS ===

    /**
     * SCANREG - Windows Registry Checker simulation
     */
    cmdScanreg() {
        this.activeProcess = 'scanreg';
        this.print('\nRegistry Checker');
        this.print('=========================\n');
        this.print('Windows encountered an error accessing the system registry.');
        this.print('Registry Checker will now scan and fix the system registry.\n');

        const steps = [
            { text: 'Scanning system registry...', delay: 600 },
            { text: '  Checking HKEY_LOCAL_MACHINE...', delay: 400 },
            { text: '  Checking HKEY_CURRENT_USER...', delay: 350 },
            { text: '  Checking HKEY_CLASSES_ROOT...', delay: 300 },
            { text: '  Checking HKEY_USERS...', delay: 250 },
            { text: '  Checking HKEY_CURRENT_CONFIG...', delay: 200 },
            { text: '', delay: 100 },
            { text: 'Validating registry structure...', delay: 500 },
            { text: '  Verifying key integrity...       OK', delay: 400 },
            { text: '  Verifying value data...          OK', delay: 350 },
            { text: '  Checking for orphaned entries...  OK', delay: 300 },
            { text: '', delay: 100 },
            { text: 'Registry scan completed successfully.', delay: 200 },
            { text: 'No errors found.', delay: 100 },
            { text: '\nRegistry backup created: rb001.cab', delay: 200 },
        ];

        let totalDelay = 0;
        steps.forEach((step, i) => {
            totalDelay += step.delay;
            setTimeout(() => {
                if (this.activeProcess !== 'scanreg') return;
                const color = step.text.includes('OK') ? '#00ff00' : '#c0c0c0';
                this.print(step.text, color);
                if (i === steps.length - 1) {
                    this.activeProcess = null;
                }
            }, totalDelay);
        });

        return null;
    }

    /**
     * SCANDISK - Disk surface scan simulation
     */
    cmdScandisk(args) {
        const drive = args[0] ? args[0].toUpperCase().replace(':', '') + ':' : this.currentPath[0];
        this.activeProcess = 'scandisk';

        this.print(`\nDisk Scanner`);
        this.print(`==================\n`);
        this.print(`ScanDisk is now checking drive ${drive} for errors.\n`);

        let progress = 0;
        const interval = setInterval(() => {
            if (this.activeProcess !== 'scandisk') {
                clearInterval(interval);
                return;
            }

            progress += Math.floor(Math.random() * 8) + 3;
            if (progress > 100) progress = 100;

            const filled = Math.floor(progress / 2);
            const empty = 50 - filled;
            const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);

            // Clear and reprint progress
            this.printHtml(`<div style="color:#00ff00">  Checking: [${bar}] ${progress}%</div>`);

            if (progress >= 100) {
                clearInterval(interval);
                this.print('');
                this.print('ScanDisk did not find any errors on this drive.', '#00ff00');
                this.print(`\n  ${this.getDriveSize(drive).toLocaleString()} bytes total disk space`);
                this.print(`  0 bytes in bad sectors`);
                this.print(`  ${this.getFreeSpace(drive)} bytes available on disk`);
                this.print(`\n  512 bytes in each allocation unit`);
                this.activeProcess = null;
            }
        }, 200);

        return null;
    }

    /**
     * DEFRAG - Disk defragmenter simulation with visual blocks
     */
    cmdDefragSim(args) {
        const drive = args[0] ? args[0].toUpperCase().replace(':', '') + ':' : this.currentPath[0];
        this.activeProcess = 'defrag';

        this.print(`\nDisk Defragmenter`);
        this.print(`==========================\n`);
        this.print(`Defragmenting drive ${drive}...\n`);

        // Generate a visual block map like real defrag
        const totalBlocks = 200;
        const blockRows = 10;
        const blocksPerRow = totalBlocks / blockRows;

        // Generate random block states
        const blocks = [];
        for (let i = 0; i < totalBlocks; i++) {
            const r = Math.random();
            if (r < 0.6) blocks.push('used');
            else if (r < 0.8) blocks.push('fragmented');
            else if (r < 0.9) blocks.push('system');
            else blocks.push('free');
        }

        // Display legend
        this.printHtml('<div style="color:#c0c0c0">  Legend:  <span style="color:#00ff00">\u2588</span>=Used  <span style="color:#ff0000">\u2588</span>=Fragmented  <span style="color:#0000ff">\u2588</span>=System  <span style="color:#808080">\u2591</span>=Free</div>');
        this.print('');

        // Display initial block map
        const blockColors = { 'used': '#00ff00', 'fragmented': '#ff0000', 'system': '#6666ff', 'free': '#808080' };
        const blockChars = { 'used': '\u2588', 'fragmented': '\u2588', 'system': '\u2588', 'free': '\u2591' };

        for (let row = 0; row < blockRows; row++) {
            let rowHtml = '  ';
            for (let col = 0; col < blocksPerRow; col++) {
                const idx = row * blocksPerRow + col;
                const block = blocks[idx];
                rowHtml += `<span style="color:${blockColors[block]}">${blockChars[block]}</span>`;
            }
            this.printHtml(`<div>${rowHtml}</div>`);
        }

        this.print('');

        // Simulate defragmentation progress
        let progress = 0;
        let fragCount = blocks.filter(b => b === 'fragmented').length;
        const totalFrag = fragCount;

        const interval = setInterval(() => {
            if (this.activeProcess !== 'defrag') {
                clearInterval(interval);
                return;
            }

            progress += Math.floor(Math.random() * 5) + 2;
            if (progress > 100) progress = 100;

            // "Fix" some fragmented blocks
            if (fragCount > 0 && Math.random() > 0.5) {
                const fragIdx = blocks.findIndex(b => b === 'fragmented');
                if (fragIdx !== -1) {
                    blocks[fragIdx] = 'used';
                    fragCount--;
                }
            }

            const filled = Math.floor(progress / 2);
            const empty = 50 - filled;
            const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
            this.printHtml(`<div style="color:#00ff00">  Optimizing: [${bar}] ${progress}%  (${totalFrag - fragCount}/${totalFrag} clusters)</div>`);

            if (progress >= 100) {
                clearInterval(interval);
                this.print('');
                this.print(`Defragmentation of drive ${drive} is complete.`, '#00ff00');
                this.print(`  ${totalFrag} fragmented clusters optimized.`);
                this.print(`  Disk is now ${Math.floor(95 + Math.random() * 5)}% contiguous.`);
                this.activeProcess = null;
            }
        }, 300);

        return null;
    }

    /**
     * TASKLIST - Show running processes (simulated from open windows)
     */
    cmdTasklist() {
        const windows = StateManager.getState('windows') || [];

        let out = '\nImage Name                     PID Session Name     Mem Usage\n';
        out += '========================= ======== ================ =========\n';

        // System processes (always present)
        const systemProcs = [
            { name: 'System Idle Process', pid: 0, mem: 16 },
            { name: 'System', pid: 4, mem: 236 },
            { name: 'smss.exe', pid: 184, mem: 432 },
            { name: 'csrss.exe', pid: 216, mem: 3284 },
            { name: 'winlogon.exe', pid: 240, mem: 5120 },
            { name: 'services.exe', pid: 268, mem: 3780 },
            { name: 'lsass.exe', pid: 280, mem: 6432 },
            { name: 'svchost.exe', pid: 392, mem: 4864 },
            { name: 'explorer.exe', pid: 512, mem: 18432 },
        ];

        for (const proc of systemProcs) {
            out += `${proc.name.padEnd(26)}${String(proc.pid).padStart(8)} Console          ${(proc.mem + ' K').padStart(9)}\n`;
        }

        // Add running apps as processes
        let pid = 1024;
        for (const win of windows) {
            const procName = (win.appId || 'unknown').toLowerCase() + '.exe';
            const mem = Math.floor(Math.random() * 20000) + 2048;
            out += `${procName.padEnd(26)}${String(pid).padStart(8)} Console          ${(mem + ' K').padStart(9)}\n`;
            pid += Math.floor(Math.random() * 100) + 10;
        }

        return out;
    }

    /**
     * TASKKILL - Kill a process by name (close an app)
     */
    cmdTaskkill(args) {
        if (!args.length) {
            return 'Usage: TASKKILL /IM <process_name>\n\nExamples:\n  taskkill /im notepad.exe\n  taskkill /im snake.exe';
        }

        let targetName = '';
        for (let i = 0; i < args.length; i++) {
            if (args[i].toLowerCase() === '/im' && args[i + 1]) {
                targetName = args[i + 1].replace('.exe', '');
                break;
            }
        }

        if (!targetName) {
            targetName = args[args.length - 1].replace('.exe', '');
        }

        // Try to close the matching app
        import('./AppRegistry.js').then(module => {
            const AppRegistry = module.default;
            const apps = AppRegistry.getAll();
            const app = apps.find(a => a.id.toLowerCase() === targetName.toLowerCase());

            if (app) {
                AppRegistry.close(app.id);
                this.print(`SUCCESS: The process "${targetName}.exe" has been terminated.`, '#00ff00');
            } else {
                this.print(`ERROR: The process "${targetName}.exe" not found.`, '#ff0000');
            }
        });

        return null;
    }

    /**
     * SFC - System File Checker simulation
     */
    cmdSfc() {
        this.activeProcess = 'sfc';
        this.print('\nSystem File Checker');
        this.print('===================\n');
        this.print('Beginning system scan. This process will take some time.\n');

        const files = [
            'C:\\WINDOWS\\SYSTEM32\\KERNEL32.DLL',
            'C:\\WINDOWS\\SYSTEM32\\USER32.DLL',
            'C:\\WINDOWS\\SYSTEM32\\GDI32.DLL',
            'C:\\WINDOWS\\SYSTEM32\\ADVAPI32.DLL',
            'C:\\WINDOWS\\SYSTEM32\\SHELL32.DLL',
            'C:\\WINDOWS\\SYSTEM32\\COMCTL32.DLL',
            'C:\\WINDOWS\\SYSTEM32\\MSVCRT.DLL',
            'C:\\WINDOWS\\SYSTEM32\\OLE32.DLL',
            'C:\\WINDOWS\\SYSTEM32\\WININET.DLL',
            'C:\\WINDOWS\\SYSTEM32\\NTDLL.DLL',
            'C:\\WINDOWS\\SYSTEM32\\RPCRT4.DLL',
            'C:\\WINDOWS\\SYSTEM32\\WS2_32.DLL',
            'C:\\WINDOWS\\SYSTEM\\VMM32.VXD',
            'C:\\WINDOWS\\WIN.COM',
            'C:\\WINDOWS\\EXPLORER.EXE',
        ];

        let index = 0;
        const scanInterval = setInterval(() => {
            if (this.activeProcess !== 'sfc' || index >= files.length) {
                clearInterval(scanInterval);
                if (this.activeProcess === 'sfc') {
                    const pct = Math.floor(((index) / files.length) * 100);
                    this.print('');
                    this.print(`Verification ${pct}% complete.`);
                    this.print('\nWindows Resource Protection did not find any integrity violations.', '#00ff00');
                    this.activeProcess = null;
                }
                return;
            }

            const pct = Math.floor((index / files.length) * 100);
            this.print(`  Verifying ${files[index]}... OK`, '#c0c0c0');
            index++;
        }, 250);

        return null;
    }

    /**
     * DEBUG - Legacy debug utility simulation
     */
    cmdDebug() {
        this.print('\nDebug Utility v1.0');
        this.print('Type assembly instructions, or Q to quit.\n');

        // Show a simulated memory dump
        const hexChars = '0123456789ABCDEF';
        let out = '-d 0100\n';

        for (let row = 0; row < 8; row++) {
            const addr = (0x0100 + row * 16).toString(16).toUpperCase().padStart(4, '0');
            let hexPart = '';
            let ascPart = '';

            for (let col = 0; col < 16; col++) {
                const byte = Math.floor(Math.random() * 256);
                hexPart += byte.toString(16).toUpperCase().padStart(2, '0') + ' ';
                ascPart += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
                if (col === 7) hexPart += ' ';
            }

            out += `${addr}:${addr}  ${hexPart} ${ascPart}\n`;
        }

        out += '\n-q';
        return out;
    }

    /**
     * FDISK - Fixed Disk Setup simulation
     */
    cmdFdisk() {
        return `
Fixed Disk Setup Program
===================================

FDISK Options:

  1. Create partition or logical drive
  2. Set active partition
  3. Delete partition or logical drive
  4. Display partition information

Current fixed disk drive: 1

Partition  Status  Type       Volume Label  Mbytes  System   Usage
C: 1          A   PRIMARY    LOCAL DISK     2048    FAT32     100%

Total disk space is 2048 Mbytes (1 Mbyte = 1048576 bytes)

Press Esc to return to FDISK Options...
(Simulation only - no changes will be made)`;
    }

    /**
     * MODE - Display/set console mode (used for phosphor color switching)
     */
    cmdMode(args) {
        if (!args.length) {
            return `Displays or configures system devices.\n\nMODE CON[:] [COLS=c] [LINES=n]\nMODE [device] [/STATUS]\n\nTerminal Modes:\n  mode green    - Green phosphor (VT100)\n  mode amber    - Amber phosphor (Hercules)\n  mode white    - White phosphor (IBM PC)\n  mode default  - Default gray (CMD.EXE)`;
        }

        const mode = args[0].toLowerCase();
        const container = this.getElement('#terminalApp');

        if (!container) return 'Error: Terminal not available.';

        // Remove all mode classes
        container.classList.remove('amber-mode', 'white-mode');

        switch (mode) {
            case 'green':
                // Green phosphor - update all colors
                this.setTerminalColors('#00ff00');
                this.print('Terminal mode set to: Green Phosphor (VT100)', '#00ff00');
                return null;
            case 'amber':
                container.classList.add('amber-mode');
                this.setTerminalColors('#ffb000');
                this.print('Terminal mode set to: Amber Phosphor (Hercules)', '#ffb000');
                return null;
            case 'white':
                container.classList.add('white-mode');
                this.setTerminalColors('#e0e0e0');
                this.print('Terminal mode set to: White Phosphor (IBM PC)', '#e0e0e0');
                return null;
            case 'default':
                this.setTerminalColors('#c0c0c0');
                this.print('Terminal mode set to: Default (CMD.EXE)', '#c0c0c0');
                return null;
            default:
                return `Invalid mode: ${mode}`;
        }
    }

    /**
     * Helper: Set terminal text colors for phosphor modes
     */
    setTerminalColors(color) {
        const output = this.getElement('#terminalOutput');
        const input = this.getElement('#terminalInput');
        const prompt = this.getElement('#promptText');
        if (output) output.style.color = color;
        if (input) {
            input.style.color = color;
            input.style.caretColor = color;
        }
        if (prompt) prompt.style.color = color;
    }

    /**
     * TITLE - Set the terminal window title
     */
    cmdTitle(args) {
        if (!args.length) {
            return 'Sets the window title for the terminal window.\n\nTITLE [string]';
        }

        const title = args.join(' ');
        const win = this.getWindow();
        if (win) {
            const titleEl = win.querySelector('.window-title');
            if (titleEl) {
                titleEl.textContent = title;
            }
        }
        return '';
    }

    /**
     * CHOICE - Prompt user with a choice (simulated)
     */
    cmdChoice(args) {
        const message = args.join(' ') || 'Are you sure?';
        return `${message} [Y,N]?Y`;
    }

    /**
     * PAUSE - Pause and wait for a keypress
     */
    cmdPause() {
        return 'Press any key to continue . . .';
    }

    /**
     * SHUTDOWN - System shutdown simulation
     */
    cmdShutdown(args) {
        const flag = args[0]?.toLowerCase();

        if (flag === '/r' || flag === '-r') {
            // Reboot
            this.print('\nThe system is rebooting...\n', '#ffff00');
            setTimeout(() => {
                EventBus.emit(Events.BSOD_SHOW, {
                    title: 'SYSTEM_RESTART',
                    msg: 'Windows is restarting...\n\nJust kidding! Refresh the page for a real restart.'
                });
            }, 1500);
            return null;
        }

        if (flag === '/l' || flag === '-l') {
            // Logoff
            this.print('\nLogging off...\n', '#ffff00');
            return null;
        }

        if (flag === '/s' || flag === '-s' || !flag) {
            // Shutdown
            this.print('\nInitiating system shutdown...\n', '#ffff00');
            setTimeout(() => {
                EventBus.emit('system:shutdown', {});
            }, 1500);
            return null;
        }

        if (flag === '/t' && args[1]) {
            const seconds = parseInt(args[1]);
            if (!isNaN(seconds)) {
                this.print(`\nSystem will shut down in ${seconds} seconds...`, '#ffff00');
                this.activeProcess = 'shutdown';

                let remaining = seconds;
                const countdownInterval = setInterval(() => {
                    remaining--;
                    if (remaining <= 0 || this.activeProcess !== 'shutdown') {
                        clearInterval(countdownInterval);
                        if (this.activeProcess === 'shutdown') {
                            this.activeProcess = null;
                            EventBus.emit('system:shutdown', {});
                        }
                        return;
                    }
                    if (remaining <= 5) {
                        this.print(`  ${remaining}...`, '#ff0000');
                    }
                }, 1000);
                return null;
            }
        }

        return `Usage: SHUTDOWN [/S | /R | /L | /T seconds]\n  /S  Shutdown\n  /R  Restart\n  /L  Log off\n  /T  Shutdown after specified seconds`;
    }

    // === HELPER METHODS ===

    resolvePath(pathStr) {
        if (!pathStr) return [...this.currentPath];

        // Handle absolute paths
        if (pathStr.match(/^[A-Za-z]:/)) {
            return FileSystemManager.parsePath(pathStr);
        }

        // Handle root
        if (pathStr === '\\' || pathStr === '/') {
            return [this.currentPath[0]];
        }

        // Handle relative paths
        const parts = pathStr.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
        let result = [...this.currentPath];

        for (const part of parts) {
            if (part === '..') {
                if (result.length > 1) result.pop();
            } else if (part !== '.') {
                result.push(part);
            }
        }

        return result;
    }

    getCurrentDir() {
        try {
            const items = FileSystemManager.listDirectory(this.currentPath);
            const dir = {};
            for (const item of items) {
                dir[item.name] = item.type === 'file' ? item.content : {};
            }
            return dir;
        } catch (e) {
            return null;
        }
    }

    getDriveSize(drive) {
        const sizes = {
            'C:': 2147483648,  // 2GB
            'D:': 681574400,   // 650MB
            'A:': 1474560      // 1.44MB
        };
        return sizes[drive] || 1073741824;
    }

    getFreeSpace(drive) {
        const total = this.getDriveSize(drive);
        const used = FileSystemManager.getDirectorySize([drive]);
        return (total - used).toLocaleString();
    }

    killProcess() {
        if (this.activeProcess === 'matrix') {
            clearInterval(this.matrixInterval);
            const canvas = this.getElement('#matrixCanvas');
            const container = this.getElement('#terminalApp');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            if (container) {
                container.classList.remove('matrix-mode');
            }
        } else if (this.activeProcess === 'more') {
            this.moreBuffer = null;
            this.moreIndex = 0;
        } else if (this.activeProcess === 'ping' || this.activeProcess === 'tracert') {
            // These will clean up on next interval tick
        }
        // scanreg, scandisk, defrag, sfc, shutdown all clean up on next tick
        // when they check activeProcess !== their type

        this.print('^C');
        this.activeProcess = null;
    }

    navigateHistory(dir, input) {
        if (!this.commandHistory.length) return;

        this.historyIndex += dir;
        this.historyIndex = Math.max(-1, Math.min(this.historyIndex, this.commandHistory.length - 1));

        if (this.historyIndex === -1) {
            input.value = '';
        } else {
            input.value = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
        }
    }

    tabComplete(input) {
        const val = input.value.trim();
        const parts = val.split(/\s+/);

        // Command completion
        if (parts.length === 1 && !val.includes('\\') && !val.includes('/')) {
            const cmds = ['help','cls','dir','cd','type','more','whoami','date','time','ping','ipconfig',
                         'tree','copy','move','del','mkdir','rmdir','ren','find','attrib','set','path',
                         'ver','vol','mem','chkdsk','systeminfo','netstat','tracert','nslookup',
                         'matrix','cowsay','fortune','disco','color','exit','about',
                         'scanreg','scandisk','defrag','tasklist','taskkill','sfc','debug','fdisk',
                         'mode','title','shutdown','reboot','grep','head','tail','touch','alias'];
            const match = cmds.find(c => c.startsWith(parts[0].toLowerCase()));
            if (match) input.value = match + ' ';
            return;
        }

        // File/directory completion
        const lastPart = parts[parts.length - 1];
        const dirPath = lastPart.includes('\\') || lastPart.includes('/')
            ? this.resolvePath(lastPart.substring(0, lastPart.lastIndexOf(/[\\\/]/) + 1))
            : this.currentPath;

        const searchTerm = lastPart.includes('\\') || lastPart.includes('/')
            ? lastPart.substring(lastPart.lastIndexOf(/[\\\/]/) + 1)
            : lastPart;

        try {
            const items = FileSystemManager.listDirectory(dirPath);
            const match = items.find(item =>
                item.name.toLowerCase().startsWith(searchTerm.toLowerCase())
            );
            if (match) {
                const prefix = parts.slice(0, -1).join(' ');
                input.value = (prefix ? prefix + ' ' : '') + match.name;
            }
        } catch (e) {
            // Tab complete failed, ignore
        }
    }

    // === SCRIPTING SUPPORT ===

    /**
     * Interpolate environment variables in command line
     * Replaces %VAR% with the value of environment variable VAR
     */
    interpolateVariables(cmdLine) {
        return cmdLine.replace(/%(\w+)%/g, (match, varName) => {
            return this.envVars[varName.toUpperCase()] || match;
        });
    }

    /**
     * Execute piped commands (cmd1 | cmd2 | cmd3)
     */
    executePipedCommands(cmdLine) {
        const commands = cmdLine.split('|').map(c => c.trim());
        let output = '';

        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];

            if (i === 0) {
                // First command - execute normally and capture output
                this.executeCommandSilent(cmd, (result) => {
                    output = result;
                });
            } else {
                // Subsequent commands - use previous output as input
                // For now, we'll simulate pipe by passing output to commands that support it
                if (cmd.toLowerCase().startsWith('grep ')) {
                    // Grep from piped input
                    output = this.grepFromString(output, cmd.substring(5).trim());
                } else if (cmd.toLowerCase().startsWith('head ')) {
                    output = this.headFromString(output, cmd.substring(5).trim());
                } else if (cmd.toLowerCase().startsWith('tail ')) {
                    output = this.tailFromString(output, cmd.substring(5).trim());
                } else if (cmd.toLowerCase().startsWith('wc')) {
                    output = this.wcFromString(output);
                } else {
                    // Command doesn't support piped input
                    this.print(`'${cmd.split(' ')[0]}' does not support piped input`);
                    return;
                }
            }
        }

        if (output) {
            this.print(output);
        }
    }

    /**
     * Execute a command silently and capture output
     */
    executeCommandSilent(cmdLine, callback) {
        const parts = this.parseCommandLine(cmdLine);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        let result = '';

        // Execute common commands that produce output
        if (cmd === 'dir' || cmd === 'ls') {
            result = this.cmdDir(args);
        } else if (cmd === 'type' || cmd === 'cat') {
            result = this.cmdType(args);
        } else if (cmd === 'echo') {
            result = args.join(' ');
        } else if (cmd === 'find') {
            result = this.cmdFind(args);
        } else if (cmd === 'grep') {
            result = this.cmdGrep(args);
        } else {
            result = `'${cmd}' cannot be used in a pipe`;
        }

        callback(result);
    }

    /**
     * Execute a RetroScript file
     */
    async executeRetroScript(filePath) {
        try {
            const content = FileSystemManager.readFile(filePath);
            const fileName = filePath[filePath.length - 1];

            this.print(`Executing RetroScript: ${fileName}...`, '#00ff00');

            // Execute the script using the legacy ScriptEngine (same as ScriptRunner)
            const result = await ScriptEngine.run(content, {
                onOutput: (msg) => this.print(msg),
                onError: (err, line) => {
                    const location = line ? ` at line ${line}` : '';
                    this.print(`Error${location}: ${err}`, '#ff0000');
                }
            });

            if (result.success) {
                this.print(`Script completed successfully.`, '#00ff00');
            } else {
                // Format error with location info if available
                const error = result.error;
                const line = result.line;
                if (line) {
                    this.print(`Script error at line ${line}: ${error}`, '#ff0000');
                } else if (error && typeof error === 'object') {
                    const location = error.line ? ` at line ${error.line}` : '';
                    this.print(`Script error${location}: ${error.message || error}`, '#ff0000');
                } else {
                    this.print(`Script error: ${error}`, '#ff0000');
                }
            }
        } catch (e) {
            this.print(`Error executing script: ${e.message}`, '#ff0000');
        }
    }

    /**
     * Execute a batch file (.bat)
     */
    executeBatchFile(filePath) {
        try {
            const content = FileSystemManager.readFile(filePath);
            const fileName = filePath[filePath.length - 1];

            this.print(`Executing batch file: ${fileName}...`);

            // Parse batch file into commands
            const lines = content.split('\n');
            const commands = [];

            for (let line of lines) {
                line = line.trim();

                // Skip empty lines and comments
                if (!line || line.startsWith('REM ') || line.startsWith('::')) {
                    continue;
                }

                // Remove @ECHO OFF directive (just skip it)
                if (line.toUpperCase() === '@ECHO OFF' || line.toUpperCase() === 'ECHO OFF') {
                    continue;
                }

                commands.push(line);
            }

            // Execute commands sequentially
            this.batchCommands = commands;
            this.batchIndex = 0;
            this.executeBatchNext();
        } catch (e) {
            this.print(`Error executing batch file: ${e.message}`, '#ff0000');
        }
    }

    /**
     * Execute next command in batch file
     */
    executeBatchNext() {
        if (this.batchIndex >= this.batchCommands.length) {
            this.batchCommands = [];
            this.batchIndex = 0;
            return;
        }

        const cmd = this.batchCommands[this.batchIndex];
        this.batchIndex++;

        // Execute the command (without showing the prompt again)
        const parts = this.parseCommandLine(cmd);
        const cmdName = parts[0].toLowerCase();
        const args = parts.slice(1);

        // Show the command being executed
        this.print(cmd, '#808080');

        // Find and execute the command
        const commands = this.getCommandMap();
        if (commands[cmdName]) {
            const result = commands[cmdName](args);
            if (result) this.print(result);
        }

        // Continue with next command
        setTimeout(() => this.executeBatchNext(), 50);
    }

    /**
     * Get command map for batch execution
     */
    getCommandMap() {
        return {
            'dir': (args) => this.cmdDir(args),
            'ls': (args) => this.cmdDir(args),
            'cd': (args) => this.cmdCd(args),
            'type': (args) => this.cmdType(args),
            'cat': (args) => this.cmdType(args),
            'echo': (args) => this.cmdEcho(args, 'echo ' + args.join(' ')),
            'mkdir': (args) => this.cmdMkdir(args),
            'del': (args) => this.cmdDel(args),
            'copy': (args) => this.cmdCopy(args),
            'move': (args) => this.cmdMove(args),
            'cls': () => this.cmdClear(),
            'clear': () => this.cmdClear(),
            'ver': () => this.cmdVer(),
            'date': () => this.cmdDate(),
            'time': () => this.cmdTime(),
            'set': (args) => this.cmdSet(args),
        };
    }

    // === SCRIPTING COMMANDS ===

    /**
     * RETRO/SCRIPT command - Execute a RetroScript file
     */
    cmdRetro(args) {
        if (!args[0]) {
            return 'Usage: RETRO <script.retro>\n\nExecutes a RetroScript file.\n\nExample: retro test.retro';
        }

        const filePath = this.resolvePath(args[0]);

        // Check if file exists
        if (!FileSystemManager.exists(filePath)) {
            return 'Script file not found.';
        }

        this.executeRetroScript(filePath);
        return null;
    }

    /**
     * CALL/BAT command - Execute a batch file
     */
    cmdCall(args) {
        if (!args[0]) {
            return 'Usage: CALL <script.bat>\n\nExecutes a batch file.\n\nExample: call startup.bat';
        }

        const filePath = this.resolvePath(args[0]);

        // Check if file exists
        if (!FileSystemManager.exists(filePath)) {
            return 'Batch file not found.';
        }

        this.executeBatchFile(filePath);
        return null;
    }

    // === ADDITIONAL FILE COMMANDS ===

    /**
     * GREP command - Search for patterns in files
     */
    cmdGrep(args) {
        if (args.length < 2) {
            return 'Usage: GREP <pattern> <file>\n\nSearches for a pattern in a file.\n\nOptions:\n  -i  Case insensitive\n  -n  Show line numbers\n  -v  Invert match (show non-matching lines)';
        }

        let caseInsensitive = false;
        let showLineNumbers = false;
        let invertMatch = false;
        let pattern = '';
        let fileName = '';

        // Parse options
        for (const arg of args) {
            if (arg === '-i') {
                caseInsensitive = true;
            } else if (arg === '-n') {
                showLineNumbers = true;
            } else if (arg === '-v') {
                invertMatch = true;
            } else if (!pattern) {
                pattern = arg;
            } else {
                fileName = arg;
            }
        }

        if (!pattern || !fileName) {
            return 'GREP: Missing pattern or filename';
        }

        try {
            const filePath = this.resolvePath(fileName);
            const content = FileSystemManager.readFile(filePath);

            return this.grepContent(content, pattern, caseInsensitive, showLineNumbers, invertMatch);
        } catch (e) {
            return `File not found - ${fileName}`;
        }
    }

    /**
     * Grep helper for content
     */
    grepContent(content, pattern, caseInsensitive, showLineNumbers, invertMatch) {
        const lines = content.split('\n');
        let output = '';
        let lineNum = 0;

        for (const line of lines) {
            lineNum++;
            const searchLine = caseInsensitive ? line.toLowerCase() : line;
            const searchPattern = caseInsensitive ? pattern.toLowerCase() : pattern;
            const matches = searchLine.includes(searchPattern);

            if ((matches && !invertMatch) || (!matches && invertMatch)) {
                if (showLineNumbers) {
                    output += `${lineNum}: ${line}\n`;
                } else {
                    output += `${line}\n`;
                }
            }
        }

        return output || '(no matches found)';
    }

    /**
     * Grep from piped string
     */
    grepFromString(input, argsStr) {
        const args = argsStr.split(/\s+/);
        let caseInsensitive = false;
        let showLineNumbers = false;
        let invertMatch = false;
        let pattern = '';

        for (const arg of args) {
            if (arg === '-i') caseInsensitive = true;
            else if (arg === '-n') showLineNumbers = true;
            else if (arg === '-v') invertMatch = true;
            else if (!pattern) pattern = arg;
        }

        if (!pattern) return input;

        return this.grepContent(input, pattern, caseInsensitive, showLineNumbers, invertMatch);
    }

    /**
     * TOUCH command - Create an empty file
     */
    cmdTouch(args) {
        if (!args[0]) {
            return 'Usage: TOUCH <filename>\n\nCreates an empty file or updates timestamp.';
        }

        try {
            const filePath = this.resolvePath(args[0]);

            if (FileSystemManager.exists(filePath)) {
                // File exists - update timestamp (simulated)
                return '';
            } else {
                // Create new empty file
                const extension = args[0].split('.').pop();
                FileSystemManager.writeFile(filePath, '', extension);
                return '';
            }
        } catch (e) {
            return `Unable to create file - ${e.message}`;
        }
    }

    /**
     * WGET/CURL command - Download files (simulated)
     */
    cmdWget(args) {
        if (!args[0]) {
            return 'Usage: WGET <url> [output_file]\n\nDownloads a file from a URL (simulated).\n\nExample: wget http://example.com/file.txt';
        }

        const url = args[0];
        const fileName = args[1] || url.split('/').pop() || 'download.txt';

        this.print(`Connecting to ${url}...`);
        this.print('HTTP request sent, awaiting response... 200 OK');
        this.print(`Length: 1024 bytes`);
        this.print(`Saving to: '${fileName}'`);
        this.print('');
        this.print('100%[===================>] 1,024      --.-KB/s    in 0.001s');
        this.print('');

        // Create a simulated downloaded file
        try {
            const filePath = this.resolvePath(fileName);
            const content = `# Downloaded from ${url}\n\nThis is a simulated download.\nIn a real implementation, this would contain the actual file content.`;
            FileSystemManager.writeFile(filePath, content, 'txt');
            return `'${fileName}' saved [1024/1024]`;
        } catch (e) {
            return `Unable to save file - ${e.message}`;
        }
    }

    /**
     * HEAD command - Show first lines of a file
     */
    cmdHead(args) {
        const lines = 10;
        let numLines = lines;
        let fileName = args[0];

        // Check for -n option
        if (args[0] === '-n' && args[1]) {
            numLines = parseInt(args[1]);
            fileName = args[2];
        }

        if (!fileName) {
            return 'Usage: HEAD [-n lines] <file>\n\nDisplays the first lines of a file (default: 10).';
        }

        try {
            const filePath = this.resolvePath(fileName);
            const content = FileSystemManager.readFile(filePath);
            return this.headFromString(content, numLines.toString());
        } catch (e) {
            return `File not found - ${fileName}`;
        }
    }

    /**
     * Head helper for string
     */
    headFromString(content, numLinesStr) {
        const numLines = parseInt(numLinesStr) || 10;
        const lines = content.split('\n');
        return lines.slice(0, numLines).join('\n');
    }

    /**
     * TAIL command - Show last lines of a file
     */
    cmdTail(args) {
        const lines = 10;
        let numLines = lines;
        let fileName = args[0];

        // Check for -n option
        if (args[0] === '-n' && args[1]) {
            numLines = parseInt(args[1]);
            fileName = args[2];
        }

        if (!fileName) {
            return 'Usage: TAIL [-n lines] <file>\n\nDisplays the last lines of a file (default: 10).';
        }

        try {
            const filePath = this.resolvePath(fileName);
            const content = FileSystemManager.readFile(filePath);
            return this.tailFromString(content, numLines.toString());
        } catch (e) {
            return `File not found - ${fileName}`;
        }
    }

    /**
     * Tail helper for string
     */
    tailFromString(content, numLinesStr) {
        const numLines = parseInt(numLinesStr) || 10;
        const lines = content.split('\n');
        return lines.slice(-numLines).join('\n');
    }

    /**
     * WC command - Count words, lines, and characters
     */
    cmdWordCount(args) {
        if (!args[0]) {
            return 'Usage: WC <file>\n\nCounts lines, words, and characters in a file.';
        }

        try {
            const filePath = this.resolvePath(args[0]);
            const content = FileSystemManager.readFile(filePath);
            return this.wcFromString(content);
        } catch (e) {
            return `File not found - ${args[0]}`;
        }
    }

    /**
     * WC helper for string
     */
    wcFromString(content) {
        const lines = content.split('\n').length;
        const words = content.split(/\s+/).filter(w => w.length > 0).length;
        const chars = content.length;
        return `  ${lines} lines, ${words} words, ${chars} characters`;
    }

    /**
     * DIFF command - Compare two files
     */
    cmdDiff(args) {
        if (args.length < 2) {
            return 'Usage: DIFF <file1> <file2>\n\nCompares two files and shows differences.';
        }

        try {
            const filePath1 = this.resolvePath(args[0]);
            const filePath2 = this.resolvePath(args[1]);

            const content1 = FileSystemManager.readFile(filePath1);
            const content2 = FileSystemManager.readFile(filePath2);

            const lines1 = content1.split('\n');
            const lines2 = content2.split('\n');

            let output = `Comparing ${args[0]} and ${args[1]}:\n\n`;
            let hasDifferences = false;

            const maxLines = Math.max(lines1.length, lines2.length);

            for (let i = 0; i < maxLines; i++) {
                const line1 = lines1[i] || '';
                const line2 = lines2[i] || '';

                if (line1 !== line2) {
                    hasDifferences = true;
                    output += `Line ${i + 1}:\n`;
                    output += `< ${line1}\n`;
                    output += `> ${line2}\n`;
                    output += '\n';
                }
            }

            if (!hasDifferences) {
                return 'Files are identical.';
            }

            return output;
        } catch (e) {
            return `Error comparing files: ${e.message}`;
        }
    }

    /**
     * ALIAS command - Create command aliases
     */
    cmdAlias(args) {
        if (args.length === 0) {
            // Show all aliases
            if (Object.keys(this.aliases).length === 0) {
                return 'No aliases defined.';
            }

            let output = 'Current aliases:\n';
            for (const [name, cmd] of Object.entries(this.aliases)) {
                output += `  ${name} = ${cmd}\n`;
            }
            return output;
        }

        // Parse alias definition: alias name=command
        const aliasStr = args.join(' ');
        const match = aliasStr.match(/^(\w+)=(.+)$/);

        if (!match) {
            return 'Usage: ALIAS <name>=<command>\n\nExamples:\n  alias ll=dir /w\n  alias cls=clear';
        }

        const name = match[1].toLowerCase();
        const command = match[2];

        this.aliases[name] = command;
        return `Alias created: ${name} = ${command}`;
    }

    /**
     * UNALIAS command - Remove an alias
     */
    cmdUnalias(args) {
        if (!args[0]) {
            return 'Usage: UNALIAS <name>\n\nRemoves a command alias.';
        }

        const name = args[0].toLowerCase();

        if (this.aliases[name]) {
            delete this.aliases[name];
            return `Alias '${name}' removed.`;
        }

        return `Alias '${name}' not found.`;
    }

    /**
     * NEWSCRIPT command - Create a new RetroScript template
     */
    cmdNewScript(args) {
        if (!args[0]) {
            return 'Usage: NEWSCRIPT <filename.retro>\n\nCreates a new RetroScript template file.';
        }

        const fileName = args[0];
        if (!fileName.endsWith('.retro')) {
            return 'Error: Filename must end with .retro';
        }

        const template = `# RetroScript Example
# Created: ${new Date().toLocaleDateString()}

# Print a message
print "Hello from RetroScript!"

# Set a variable
set $name = "User"
print "Welcome, " + $name

# Loop example
print "Counting to 5:"
loop 5 {
    print "  " + $i
}

# File operations example
# write "Sample content" to "C:/test.txt"
# read "C:/test.txt" into $content
# print "File contents: " + $content

# Event handling example
# on app:notepad:saved {
#     print "Notepad file saved!"
# }

print "Script completed!"
`;

        try {
            const filePath = this.resolvePath(fileName);
            FileSystemManager.writeFile(filePath, template, 'retro');
            return `Created template script: ${fileName}\nUse 'edit ${fileName}' to modify it.`;
        } catch (e) {
            return `Unable to create script: ${e.message}`;
        }
    }

    /**
     * NEWBATCH command - Create a new batch file template
     */
    cmdNewBatch(args) {
        if (!args[0]) {
            return 'Usage: NEWBATCH <filename.bat>\n\nCreates a new batch file template.';
        }

        const fileName = args[0];
        if (!fileName.endsWith('.bat')) {
            return 'Error: Filename must end with .bat';
        }

        const template = `@ECHO OFF
REM Batch File Example
REM Created: ${new Date().toLocaleDateString()}

ECHO Starting batch script...
ECHO.

REM Display current directory
ECHO Current directory:
CD

REM List files
ECHO.
ECHO Files in current directory:
DIR

REM Set environment variable
SET MYVAR=Hello World
ECHO Environment variable MYVAR = %MYVAR%

REM Display system info
ECHO.
ECHO System Information:
VER

ECHO.
ECHO Batch script completed!
`;

        try {
            const filePath = this.resolvePath(fileName);
            FileSystemManager.writeFile(filePath, template, 'bat');
            return `Created template batch file: ${fileName}\nUse 'edit ${fileName}' to modify it.`;
        } catch (e) {
            return `Unable to create batch file: ${e.message}`;
        }
    }

    onClose() {
        // Clean up multiplayer session
        this._mpStopSharing();

        if (this.activeProcess) {
            this.killProcess();
        }

        // Emit terminal closed event for script handlers
        EventBus.emit(Events.APP_TERMINAL_CLOSED, {
            appId: this.id,
            windowId: this.windowId,
            commandHistory: [...this.commandHistory],
            historyCount: this.commandHistory.length,
            timestamp: Date.now()
        });
    }

    // ===== MULTIPLAYER SHARED TERMINAL SESSION =====

    cmdShareSession(args) {
        if (!MultiplayerClient.isConnected()) {
            this.print('Error: Not connected to multiplayer server.', '#ff5555');
            return;
        }

        const subCmd = (args[0] || '').toLowerCase();

        if (subCmd === 'stop') {
            if (!this._mpSession) {
                this.print('No active shared session.', '#ffff55');
                return;
            }
            this._mpStopSharing();
            this.print('Shared session ended.', '#55ff55');
            return;
        }

        if (subCmd === 'join' && args[1]) {
            this._mpJoinSession(args[1]);
            return;
        }

        if (this._mpSession) {
            this.print(`Already sharing session: ${this._mpSession}`, '#ffff55');
            this.print('Use "share stop" to end the session.', '#c0c0c0');
            return;
        }

        // Start a new shared session
        const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        this._mpSession = `app:terminal:${sessionId}`;
        MultiplayerClient.joinRoom(this._mpSession);

        this._mpSetupListeners();

        this.print(`Shared terminal session started: ${this._mpSession}`, '#55ff55');
        this.print('Others can join with: share join ' + this._mpSession, '#c0c0c0');
    }

    _mpJoinSession(roomId) {
        if (this._mpSession) {
            this._mpStopSharing();
        }
        this._mpSession = roomId;
        MultiplayerClient.joinRoom(roomId);
        this._mpSetupListeners();
        this.print(`Joined shared session: ${roomId}`, '#55ff55');
    }

    _mpSetupListeners() {
        const unsubEvent = MultiplayerClient.on('event', (msg) => {
            const data = msg.payload || {};
            if (data.channel !== this._mpSession) return;
            if (data.data && data.data._self) return;

            const event = msg.event || data.event;
            const payload = data.data || data;
            const senderName = msg.senderName || payload.senderName || 'Remote';

            if (event === 'terminal:command') {
                this.print(`[${senderName}] ${this.getPrompt()}${payload.command}`, '#55aaff');
            }
            if (event === 'terminal:output') {
                this.print(`[${senderName}] ${payload.text}`, payload.color || '#55aaff');
            }
        });
        this._mpUnsubscribers.push(unsubEvent);
    }

    _mpBroadcastCommand(command) {
        if (!this._mpSession || !MultiplayerClient.isConnected()) return;
        MultiplayerClient.sendEvent(this._mpSession, 'terminal:command', {
            command,
            senderName: MultiplayerClient.getUserInfo().displayName,
            _self: true
        });
    }

    _mpBroadcastOutput(text, color) {
        if (!this._mpSession || !MultiplayerClient.isConnected()) return;
        MultiplayerClient.sendEvent(this._mpSession, 'terminal:output', {
            text,
            color,
            senderName: MultiplayerClient.getUserInfo().displayName,
            _self: true
        });
    }

    _mpStopSharing() {
        if (this._mpSession) {
            MultiplayerClient.leaveRoom(this._mpSession);
        }
        for (const unsub of this._mpUnsubscribers) {
            if (typeof unsub === 'function') unsub();
        }
        this._mpUnsubscribers = [];
        this._mpSession = null;
    }
}

// W4.4 — define per-window accessor properties on Terminal.prototype.
//
// `setInstanceState` and `getInstanceState` from AppBase route to a Map
// keyed by `this._currentWindowId`, which AppBase sets before every
// lifecycle callback. The accessors below let the existing ~160
// references throughout this file (`this.commandHistory.push(...)`,
// `this.currentPath = [...]`, etc.) keep working unchanged while
// reading and writing per-window storage.
//
// If the current context has no instance data yet (e.g. someone reads
// a field before `onOpen` runs), the getter returns `undefined` and
// callers fall through to their default-handling code paths. The
// defaults seeded in `onOpen` cover the steady-state.
for (const field of PER_WINDOW_FIELDS) {
    Object.defineProperty(Terminal.prototype, field, {
        get() { return this.getInstanceState(field); },
        set(value) { this.setInstanceState(field, value, false); },
        configurable: true,
        enumerable: false
    });
}

export default Terminal;
