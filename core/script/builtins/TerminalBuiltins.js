/**
 * TerminalBuiltins - Terminal integration functions for RetroScript
 *
 * Provides functions to interact with the Terminal app from scripts.
 * These functions work with any open terminal, or launch one if needed.
 */

/**
 * Get the active terminal instance
 * @param {Object} context - Interpreter context
 * @returns {Object|null} Terminal app instance or null
 */
async function getTerminalInstance(context) {
    const AppRegistry = context.AppRegistry;
    if (!AppRegistry) return null;

    const terminal = AppRegistry.get('terminal');
    if (!terminal) return null;

    // Check if terminal has an open window
    if (terminal.openWindows && terminal.openWindows.size > 0) {
        // Set the current window context to the first open terminal
        const firstWindowId = terminal.openWindows.keys().next().value;
        terminal._currentWindowId = firstWindowId;
        return terminal;
    }

    return null;
}

/**
 * Launch terminal if not already open
 * @param {Object} context - Interpreter context
 * @returns {Object|null} Terminal app instance
 */
async function ensureTerminalOpen(context) {
    let terminal = await getTerminalInstance(context);

    if (!terminal || terminal.openWindows.size === 0) {
        // Launch terminal
        const AppRegistry = context.AppRegistry;
        if (AppRegistry) {
            AppRegistry.launch('terminal');
            // Wait for terminal to open
            await new Promise(resolve => setTimeout(resolve, 200));
            terminal = await getTerminalInstance(context);
        }
    }

    return terminal;
}

export function registerTerminalBuiltins(interpreter) {
    /**
     * Print text to the terminal
     * @param {string} text - Text to print
     * @param {string} [color] - Optional color (hex or name)
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalPrint', async (text, color = null) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) {
            console.warn('[TerminalBuiltins] No terminal open');
            return false;
        }

        terminal.print(String(text), color);
        return true;
    });

    /**
     * Print HTML to the terminal (sanitized to prevent XSS)
     * Allows basic formatting tags but strips scripts and event handlers.
     * @param {string} html - HTML to print
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalPrintHtml', async (html) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        // DOM-based sanitization: parse into a document fragment, then
        // walk nodes keeping only safe tags and attributes.
        const SAFE_TAGS = new Set([
            'b', 'i', 'u', 'em', 'strong', 'code', 'pre', 'span', 'div',
            'br', 'hr', 'p', 'ul', 'ol', 'li', 'a', 'table', 'tr', 'td',
            'th', 'thead', 'tbody', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'sub', 'sup', 'small', 'mark', 'del', 'ins', 'blockquote'
        ]);
        const SAFE_ATTRS = new Set(['class', 'style', 'title', 'colspan', 'rowspan']);

        const doc = new DOMParser().parseFromString(String(html), 'text/html');
        const walk = (node) => {
            const frag = document.createDocumentFragment();
            for (const child of Array.from(node.childNodes)) {
                if (child.nodeType === Node.TEXT_NODE) {
                    frag.appendChild(document.createTextNode(child.textContent));
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    const tag = child.tagName.toLowerCase();
                    if (SAFE_TAGS.has(tag)) {
                        const el = document.createElement(tag);
                        for (const attr of Array.from(child.attributes)) {
                            const name = attr.name.toLowerCase();
                            if (SAFE_ATTRS.has(name)) {
                                el.setAttribute(name, attr.value);
                            } else if (tag === 'a' && name === 'href' && /^(https?:|#|\/)/i.test(attr.value)) {
                                el.setAttribute('href', attr.value);
                                el.setAttribute('rel', 'noopener noreferrer');
                            }
                        }
                        el.appendChild(walk(child));
                        frag.appendChild(el);
                    } else {
                        frag.appendChild(walk(child));
                    }
                }
            }
            return frag;
        };

        const safeFrag = walk(doc.body);
        const wrapper = document.createElement('div');
        wrapper.appendChild(safeFrag);
        terminal.printHtml(wrapper.innerHTML);
        return true;
    });

    /**
     * Clear the terminal screen
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalClear', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        terminal.cmdClear();
        return true;
    });

    /**
     * Execute a terminal command
     * @param {string} command - Command to execute
     * @returns {Object} Result with output
     */
    interpreter.registerBuiltin('terminalExecute', async (command) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) {
            return { success: false, error: 'No terminal open' };
        }

        terminal.executeCommand(String(command));
        return {
            success: true,
            output: terminal.lastOutput,
            path: terminal.currentPath.join('\\')
        };
    });

    /**
     * Execute multiple terminal commands in sequence
     * @param {Array} commands - Array of commands to execute
     * @returns {Object} Result with outputs
     */
    interpreter.registerBuiltin('terminalExecuteSequence', async (commands) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) {
            return { success: false, error: 'No terminal open' };
        }

        if (!Array.isArray(commands)) {
            commands = [String(commands)];
        }

        const outputs = [];
        for (const cmd of commands) {
            terminal.executeCommand(String(cmd));
            outputs.push(terminal.lastOutput);
        }

        return { success: true, outputs };
    });

    /**
     * Change directory in the terminal
     * @param {string} path - Path to change to
     * @returns {Object} Result with new path
     */
    interpreter.registerBuiltin('terminalCd', async (path) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) {
            return { success: false, error: 'No terminal open' };
        }

        terminal.cmdCd([String(path)]);
        return {
            success: true,
            path: terminal.currentPath.join('\\')
        };
    });

    /**
     * Get the current terminal path
     * @returns {string|null} Current path or null
     */
    interpreter.registerBuiltin('terminalGetPath', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return null;

        return terminal.currentPath.join('\\');
    });

    /**
     * Get the last output from terminal
     * @returns {string|null} Last output or null
     */
    interpreter.registerBuiltin('terminalGetOutput', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return null;

        return terminal.lastOutput;
    });

    /**
     * Get the full terminal output content
     * @returns {string|null} All terminal output or null
     */
    interpreter.registerBuiltin('terminalGetAllOutput', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return null;

        const output = terminal.getElement('#terminalOutput');
        return output ? output.textContent : '';
    });

    /**
     * Get terminal command history
     * @returns {Array} Command history
     */
    interpreter.registerBuiltin('terminalGetHistory', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return [];

        return [...terminal.commandHistory];
    });

    /**
     * Get terminal environment variables
     * @returns {Object} Environment variables
     */
    interpreter.registerBuiltin('terminalGetEnvVars', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return {};

        return { ...terminal.envVars };
    });

    /**
     * Set terminal environment variable
     * @param {string} name - Variable name
     * @param {string} value - Variable value
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalSetEnvVar', async (name, value) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        terminal.envVars[String(name).toUpperCase()] = String(value);
        return true;
    });

    /**
     * Get terminal environment variable
     * @param {string} name - Variable name
     * @returns {string|null} Variable value or null
     */
    interpreter.registerBuiltin('terminalGetEnvVar', async (name) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return null;

        return terminal.envVars[String(name).toUpperCase()] || null;
    });

    /**
     * Create a command alias in the terminal
     * @param {string} name - Alias name
     * @param {string} command - Command to alias
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalAlias', async (name, command) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        terminal.aliases[String(name).toLowerCase()] = String(command);
        return true;
    });

    /**
     * Get all terminal aliases
     * @returns {Object} Aliases
     */
    interpreter.registerBuiltin('terminalGetAliases', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return {};

        return { ...terminal.aliases };
    });

    /**
     * Check if terminal is open
     * @returns {boolean} True if terminal is open
     */
    interpreter.registerBuiltin('isTerminalOpen', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        return terminal !== null && terminal.openWindows && terminal.openWindows.size > 0;
    });

    /**
     * Get terminal state
     * @returns {Object|null} Terminal state or null
     */
    interpreter.registerBuiltin('terminalGetState', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return null;

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

    /**
     * Launch terminal if not open, optionally with initial command
     * @param {string} [initialCommand] - Optional command to run after launch
     * @returns {Object} Result with windowId
     */
    interpreter.registerBuiltin('terminalOpen', async (initialCommand = null) => {
        const terminal = await ensureTerminalOpen(interpreter.context);
        if (!terminal) {
            return { success: false, error: 'Failed to open terminal' };
        }

        // Wait a bit for terminal to fully initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        if (initialCommand) {
            terminal.executeCommand(String(initialCommand));
        }

        return {
            success: true,
            windowId: terminal._currentWindowId
        };
    });

    /**
     * Focus the terminal window
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalFocus', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal || !terminal._currentWindowId) return false;

        const EventBus = interpreter.context.EventBus;
        if (EventBus) {
            EventBus.emit('window:focus', { windowId: terminal._currentWindowId });
        }
        return true;
    });

    /**
     * Minimize the terminal window
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalMinimize', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal || !terminal._currentWindowId) return false;

        const EventBus = interpreter.context.EventBus;
        if (EventBus) {
            EventBus.emit('window:minimize', { windowId: terminal._currentWindowId });
        }
        return true;
    });

    /**
     * Close the terminal window
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalClose', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        terminal.close();
        return true;
    });

    /**
     * Enable god mode in terminal
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalGodMode', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        // God mode can only be activated via the konami code in the terminal.
        // Scripts cannot programmatically enable it.
        if (!terminal.godMode) {
            terminal.print('God mode can only be activated via the terminal.', '#ff0000');
            return false;
        }
        return terminal.godMode;
    });

    /**
     * Check if god mode is active
     * @returns {boolean} God mode status
     */
    interpreter.registerBuiltin('terminalIsGodMode', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        return terminal.godMode;
    });

    /**
     * Start matrix effect in terminal
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalMatrix', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        terminal.startMatrix();
        return true;
    });

    /**
     * Run a RetroScript file from terminal
     * @param {string} scriptPath - Path to .retro file
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalRunScript', async (scriptPath) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        const filePath = terminal.resolvePath(String(scriptPath));
        terminal.executeRetroScript(filePath);
        return true;
    });

    /**
     * Read file content from terminal's perspective (uses terminal path resolution)
     * @param {string} filePath - File path (can be relative to terminal's current dir)
     * @returns {string|null} File content or null
     */
    interpreter.registerBuiltin('terminalReadFile', async (filePath) => {
        const terminal = await getTerminalInstance(interpreter.context);
        const FileSystemManager = interpreter.context.FileSystemManager;

        if (!FileSystemManager) return null;

        let resolvedPath;
        if (terminal) {
            resolvedPath = terminal.resolvePath(String(filePath));
        } else {
            resolvedPath = FileSystemManager.parsePath(String(filePath));
        }

        try {
            return FileSystemManager.readFile(resolvedPath);
        } catch (e) {
            return null;
        }
    });

    /**
     * Write file from terminal's perspective
     * @param {string} filePath - File path
     * @param {string} content - File content
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalWriteFile', async (filePath, content) => {
        const terminal = await getTerminalInstance(interpreter.context);
        const FileSystemManager = interpreter.context.FileSystemManager;

        if (!FileSystemManager) return false;

        let resolvedPath;
        if (terminal) {
            resolvedPath = terminal.resolvePath(String(filePath));
        } else {
            resolvedPath = FileSystemManager.parsePath(String(filePath));
        }

        try {
            const extension = String(filePath).split('.').pop() || 'txt';
            FileSystemManager.writeFile(resolvedPath, String(content), extension);
            return true;
        } catch (e) {
            return false;
        }
    });

    /**
     * List directory from terminal's perspective
     * @param {string} [path] - Directory path (optional, uses current if not specified)
     * @returns {Array} Directory contents
     */
    interpreter.registerBuiltin('terminalDir', async (path = null) => {
        const terminal = await getTerminalInstance(interpreter.context);
        const FileSystemManager = interpreter.context.FileSystemManager;

        if (!FileSystemManager) return [];

        let resolvedPath;
        if (terminal) {
            resolvedPath = path ? terminal.resolvePath(String(path)) : terminal.currentPath;
        } else if (path) {
            resolvedPath = FileSystemManager.parsePath(String(path));
        } else {
            resolvedPath = ['C:', 'Users', 'User'];
        }

        try {
            return FileSystemManager.listDirectory(resolvedPath);
        } catch (e) {
            return [];
        }
    });

    /**
     * Check if file exists from terminal's perspective
     * @param {string} filePath - File path
     * @returns {boolean} True if file exists
     */
    interpreter.registerBuiltin('terminalFileExists', async (filePath) => {
        const terminal = await getTerminalInstance(interpreter.context);
        const FileSystemManager = interpreter.context.FileSystemManager;

        if (!FileSystemManager) return false;

        let resolvedPath;
        if (terminal) {
            resolvedPath = terminal.resolvePath(String(filePath));
        } else {
            resolvedPath = FileSystemManager.parsePath(String(filePath));
        }

        return FileSystemManager.exists(resolvedPath);
    });

    /**
     * Show a cowsay message in terminal
     * @param {string} message - Message to display
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalCowsay', async (message) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        const output = terminal.cmdCowsay([String(message)]);
        if (output) terminal.print(output);
        return true;
    });

    /**
     * Show a fortune in terminal
     * @returns {string|null} Fortune text or null
     */
    interpreter.registerBuiltin('terminalFortune', async () => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return null;

        const fortune = terminal.cmdFortune();
        terminal.print(fortune);
        return fortune;
    });

    /**
     * Set terminal color
     * @param {string} colorCode - Color code (0-F)
     * @returns {boolean} Success status
     */
    interpreter.registerBuiltin('terminalColor', async (colorCode) => {
        const terminal = await getTerminalInstance(interpreter.context);
        if (!terminal) return false;

        terminal.cmdColor([String(colorCode)]);
        return true;
    });
}

export default registerTerminalBuiltins;
