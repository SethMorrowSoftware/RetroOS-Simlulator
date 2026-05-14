/**
 * ScriptEngine - Main coordinator for RetroScript execution
 *
 * This is the primary API for running RetroScript code.
 * It coordinates the lexer, parser, and interpreter.
 *
 * Supports concurrent execution: each call to run() creates its own
 * Interpreter instance with isolated scope. Scripts can be interleaved
 * via async/await (e.g., `wait 1000` yields control).
 *
 * Usage:
 *   import ScriptEngine from './core/script/ScriptEngine.js';
 *
 *   // Run a script
 *   const result = await ScriptEngine.run(`
 *     set $x = 10
 *     print Hello, World!
 *   `);
 *
 *   // Run from file
 *   await ScriptEngine.runFile('C:/Scripts/demo.retro');
 */

import { Lexer } from './lexer/Lexer.js';
import { Parser } from './parser/Parser.js';
import { Interpreter } from './interpreter/Interpreter.js';
import { SafetyLimits, DEFAULT_LIMITS } from './utils/SafetyLimits.js';
import { registerAllBuiltins } from './builtins/index.js';
import { ScriptError, ParseError, RuntimeError } from './errors/ScriptError.js';
import { validateScriptPath as _validateScriptPath } from './utils/PathValidation.js';

/**
 * ScriptEngine class - main API for script execution
 */
class ScriptEngineClass {
    constructor() {
        this.limits = new SafetyLimits();
        this.interpreter = null;
        this.context = {};
        this.isInitialized = false;

        // Track all active interpreter instances for concurrent execution
        this._activeInterpreters = new Set();
        this._nextInvocationId = 0;

        // Track persistent interpreters (e.g., autoexec session handlers)
        this._persistentInterpreters = new Map();
        this._nextPersistentId = 0;

        // Custom builtins registered via defineFunction/registerGlobalBuiltin
        // These persist across run() invocations and reset() calls
        this._customBuiltins = new Map();

        // Event callbacks
        this.outputCallback = null;
        this.errorCallback = null;
        this.completeCallback = null;
    }

    /**
     * Check if any script is currently running
     * @returns {boolean}
     */
    get isRunning() {
        return this._activeInterpreters.size > 0 || this._persistentInterpreters.size > 0;
    }

    /**
     * Validate that the runtime context exposes the services script builtins
     * rely on (W3.9). Builtins used to scatter `if (!context.X)` checks with
     * inconsistent fallback behavior (some warned, some silently no-op'd,
     * some threw) — making it impossible to tell at a glance which services
     * a script execution needed. This fails fast at init time when something
     * obvious is missing, returns a structured report otherwise.
     *
     * Returns `{ ok: boolean, missingRequired: string[], missingOptional: string[] }`.
     *
     * The required set is what NO builtin can usefully operate without
     * (FileSystemManager, EventBus). The optional set lists services that
     * specific namespaces need; builtins guarded by them should call
     * `requireContext('Foo', name)` themselves.
     */
    validateContext(context = this.context) {
        const required = ['FileSystemManager', 'EventBus'];
        const optional = [
            'StateManager', 'WindowManager', 'StorageManager',
            'AppRegistry', 'FeatureRegistry', 'TelemetryCollector',
            'ReplayEngine', 'NarrativeStateManager', 'MediaAssetManager'
        ];

        const missingRequired = required.filter(k => !context || !context[k]);
        const missingOptional = optional.filter(k => !context || !context[k]);

        if (missingRequired.length > 0) {
            console.error(
                `[ScriptEngine] validateContext FAILED — required services missing: ${missingRequired.join(', ')}. ` +
                `Scripts using fs.* or event-emitting builtins will throw at runtime.`
            );
        }

        return {
            ok: missingRequired.length === 0,
            missingRequired,
            missingOptional
        };
    }

    /**
     * Initialize the script engine
     * @param {Object} [context] - Optional system context
     */
    initialize(context = {}) {
        if (this.isInitialized) {
            console.log('[ScriptEngine] Already initialized');
            return;
        }

        // Store context references
        this.context = context;

        // W3.9 — surface missing services at init time rather than during
        // script execution. The result is non-fatal (the engine still
        // initializes so cosmetic builtins like math.* keep working), but
        // the log makes the boot-health diagnosis obvious.
        this.validateContext(context);

        // Create primary interpreter for getVariables(), defineFunction(), and reset()
        this.interpreter = new Interpreter({
            limits: this.limits,
            context: this.context,
            onOutput: (message) => this.emitOutput(message),
            onError: (error) => this.emitError(error)
        });

        // Register all built-in functions
        registerAllBuiltins(this.interpreter);

        this.isInitialized = true;
        console.log('[ScriptEngine] Initialized (modular architecture)');
    }

    /**
     * Set system context (for lazy initialization)
     * @param {Object} context - System context
     */
    setContext(context) {
        // Sanitize context: strip dangerous browser globals that could
        // allow sandbox escape if a script accesses them via context bridge
        const sanitized = { ...this.context, ...context };
        delete sanitized.window;
        delete sanitized.document;
        delete sanitized.globalThis;
        delete sanitized.eval;
        delete sanitized.Function;
        this.context = sanitized;
        if (this.interpreter) {
            this.interpreter.context = this.context;
        }
    }

    /**
     * Validate a script-driven file path against an allowlist of safe roots.
     * Public wrapper around utils/PathValidation.validateScriptPath so
     * external callers (admin tools, tests) can use the same boundary the
     * Interpreter applies internally to write/read/delete/mkdir.
     */
    validateScriptPath(path, options = {}) {
        return _validateScriptPath(path, options);
    }

    /**
     * Run a script from source code
     * Each invocation creates its own Interpreter for isolated execution.
     * @param {string} source - Script source code
     * @param {Object} [options] - Execution options
     * @param {number} [options.timeout] - Execution timeout in ms
     * @param {Object} [options.variables] - Initial variables
     * @param {Function} [options.onOutput] - Legacy callback for output (called for each print)
     * @param {Function} [options.onError] - Legacy callback for errors
     * @param {Function} [options.onVariables] - Legacy callback for variable updates
     * @returns {Object} Execution result
     */
    async run(source, options = {}) {
        if (!this.isInitialized) {
            this.initialize();
        }

        // Create per-invocation safety limits so timeout is isolated
        const invocationLimits = new SafetyLimits();
        if (options.timeout) {
            invocationLimits.setTimeout(options.timeout);
        }

        // Create a new Interpreter for this invocation (isolated scope)
        const interpreter = new Interpreter({
            limits: invocationLimits,
            context: this.context,
            onOutput: (message) => {
                if (options.onOutput) options.onOutput(message);
                this.emitOutput(message);
            },
            onError: (error) => {
                if (options.onError) options.onError(error);
                this.emitError(error);
            }
        });

        // Register all built-in functions on this instance
        registerAllBuiltins(interpreter);

        // Register custom builtins (from defineFunction/registerGlobalBuiltin)
        for (const [name, fn] of this._customBuiltins) {
            interpreter.registerBuiltin(name, fn);
        }

        // Assign an ID for targeted stop()
        const invocationId = ++this._nextInvocationId;
        interpreter._invocationId = invocationId;

        // Track active interpreter
        this._activeInterpreters.add(interpreter);

        try {
            // Set initial variables if provided
            if (options.variables) {
                for (const [name, value] of Object.entries(options.variables)) {
                    interpreter.globalEnv.set(name, value);
                }
            }

            // Tokenize
            const lexer = new Lexer(source);
            const tokens = lexer.tokenize();

            // Parse
            const parser = new Parser(tokens);
            const ast = parser.parse();

            // Execute
            const result = await interpreter.execute(ast);

            // Get final variables
            const variables = interpreter.getVariables();

            // Call legacy onVariables callback if provided
            if (options.onVariables) {
                options.onVariables(variables);
            }

            // Emit completion
            this.emitComplete({ success: true, result });

            return {
                success: true,
                result,
                variables
            };
        } catch (error) {
            const errorInfo = this.formatError(error);

            this.emitError(errorInfo.message);
            this.emitComplete({ success: false, error: errorInfo });

            // Include variables even on error for debugging
            const variables = interpreter.getVariables();

            return {
                success: false,
                error: errorInfo,
                variables
            };
        } finally {
            // Clean up this invocation's interpreter
            interpreter.cleanup();
            this._activeInterpreters.delete(interpreter);
        }
    }

    /**
     * Run a script and keep its event handlers alive after top-level execution.
     * Useful for long-lived automation (e.g., autoexec scripts with `on event` handlers).
     * @param {string} source - Script source code
     * @param {Object} [options] - Execution options
     * @returns {Object} Execution result with sessionId on success
     */
    async runPersistent(source, options = {}) {
        if (!this.isInitialized) {
            this.initialize();
        }

        const invocationLimits = new SafetyLimits();
        if (options.timeout) {
            invocationLimits.setTimeout(options.timeout);
        }

        const interpreter = new Interpreter({
            limits: invocationLimits,
            context: this.context,
            onOutput: (message) => {
                if (options.onOutput) options.onOutput(message);
                this.emitOutput(message);
            },
            onError: (error) => {
                if (options.onError) options.onError(error);
                this.emitError(error);
            }
        });

        registerAllBuiltins(interpreter);
        for (const [name, fn] of this._customBuiltins) {
            interpreter.registerBuiltin(name, fn);
        }

        const sessionId = `persistent_${++this._nextPersistentId}`;
        interpreter._persistentSessionId = sessionId;

        this._activeInterpreters.add(interpreter);

        try {
            if (options.variables) {
                for (const [name, value] of Object.entries(options.variables)) {
                    interpreter.globalEnv.set(name, value);
                }
            }

            const lexer = new Lexer(source);
            const tokens = lexer.tokenize();
            const parser = new Parser(tokens);
            const ast = parser.parse();

            const result = await interpreter.execute(ast);
            const variables = interpreter.getVariables();

            if (options.onVariables) {
                options.onVariables(variables);
            }

            this._persistentInterpreters.set(sessionId, {
                interpreter,
                startedAt: Date.now()
            });

            this.emitComplete({ success: true, result, persistent: true, sessionId });

            return {
                success: true,
                result,
                variables,
                sessionId
            };
        } catch (error) {
            const errorInfo = this.formatError(error);

            this.emitError(errorInfo.message);
            this.emitComplete({ success: false, error: errorInfo, persistent: true });

            const variables = interpreter.getVariables();
            interpreter.cleanup();

            return {
                success: false,
                error: errorInfo,
                variables
            };
        } finally {
            this._activeInterpreters.delete(interpreter);
        }
    }

    /**
     * Stop and cleanup a persistent script session.
     * @param {string} sessionId - Persistent session ID
     * @returns {boolean} True if session existed and was stopped
     */
    stopPersistent(sessionId) {
        const session = this._persistentInterpreters.get(sessionId);
        if (!session) return false;

        session.interpreter.stop();
        session.interpreter.cleanup();
        this._persistentInterpreters.delete(sessionId);
        return true;
    }

    /**
     * Stop and cleanup all persistent sessions.
     */
    stopAllPersistent() {
        for (const session of this._persistentInterpreters.values()) {
            session.interpreter.stop();
            session.interpreter.cleanup();
        }
        this._persistentInterpreters.clear();
    }

    /**
     * Run a script from a file path
     * @param {string} path - Virtual filesystem path
     * @param {Object} [options] - Execution options
     * @returns {Object} Execution result
     */
    async runFile(path, options = {}) {
        const FileSystemManager = this.context.FileSystemManager;

        if (!FileSystemManager) {
            return {
                success: false,
                error: 'FileSystemManager not available'
            };
        }

        try {
            const source = FileSystemManager.readFile(path);
            if (source === null || source === undefined) {
                return {
                    success: false,
                    error: `File not found: ${path}`
                };
            }

            return await this.run(source, options);
        } catch (error) {
            return {
                success: false,
                error: `Error reading file: ${error.message}`
            };
        }
    }

    /**
     * Stop running scripts
     * @param {number} [id] - Optional invocation ID to stop a specific script.
     *                         If omitted, stops all active scripts.
     */
    stop(id) {
        if (id !== undefined) {
            // Stop a specific invocation
            for (const interp of this._activeInterpreters) {
                if (interp._invocationId === id) {
                    interp.stop();
                    return;
                }
            }

            // Also allow stopping a persistent session by ID
            if (typeof id === 'string') {
                this.stopPersistent(id);
            }
        } else {
            // Stop all active interpreters
            this.stopAll();
        }
    }

    /**
     * Stop all running scripts
     */
    stopAll() {
        for (const interp of this._activeInterpreters) {
            interp.stop();
        }
        this.stopAllPersistent();
    }

    /**
     * Define a custom function available in all future script invocations.
     * @param {string} name - Function name
     * @param {Function} fn - Function implementation
     */
    defineFunction(name, fn) {
        this._customBuiltins.set(name, fn);
        if (this.interpreter) {
            this.interpreter.registerBuiltin(name, fn);
        }
    }

    /**
     * Register a global builtin function (plugin-facing API).
     * The function will be available in all script invocations, including
     * after reset(). Plugins should call this in their onLoad() hook.
     * @param {string} name - Function name (e.g., 'myPluginFunc')
     * @param {Function} fn - Function implementation
     */
    registerGlobalBuiltin(name, fn) {
        this.defineFunction(name, fn);
    }

    /**
     * Get current variables from the primary interpreter
     * @returns {Object} Variables object
     */
    getVariables() {
        return this.interpreter ? this.interpreter.getVariables() : {};
    }

    /**
     * Set output callback
     * @param {Function} callback - Callback for output messages
     */
    onOutput(callback) {
        this.outputCallback = callback;
    }

    /**
     * Set error callback
     * @param {Function} callback - Callback for errors
     */
    onError(callback) {
        this.errorCallback = callback;
    }

    /**
     * Set completion callback
     * @param {Function} callback - Callback for script completion
     */
    onComplete(callback) {
        this.completeCallback = callback;
    }

    /**
     * Emit output message
     * @param {string} message - Output message
     */
    emitOutput(message) {
        if (this.outputCallback) {
            this.outputCallback(message);
        }

        const EventBus = this.context.EventBus;
        if (EventBus) {
            EventBus.emit('script:output', { message });
        }
    }

    /**
     * Emit error
     * @param {string} error - Error message
     */
    emitError(error) {
        if (this.errorCallback) {
            this.errorCallback(error);
        }

        const EventBus = this.context.EventBus;
        if (EventBus) {
            EventBus.emit('script:error', { error });
        }
    }

    /**
     * Emit completion
     * @param {Object} result - Completion result
     */
    emitComplete(result) {
        if (this.completeCallback) {
            this.completeCallback(result);
        }

        const EventBus = this.context.EventBus;
        if (EventBus) {
            EventBus.emit('script:complete', {
                scriptId: result.sessionId || 'anonymous',
                ...result
            });
        }
    }

    /**
     * Format error for display
     * @param {Error} error - Error object
     * @returns {Object} Formatted error info
     */
    formatError(error) {
        if (error instanceof ScriptError) {
            return {
                type: error.name,
                message: error.message,
                line: error.line,
                column: error.column,
                hint: error.hint,
                toString: () => error.toString()
            };
        }

        return {
            type: 'Error',
            message: error.message || String(error),
            line: 0,
            column: 0,
            hint: '',
            toString: () => error.message || String(error)
        };
    }

    /**
     * Parse script without executing (for syntax checking)
     * @param {string} source - Script source code
     * @returns {Object} Parse result
     */
    parse(source) {
        try {
            const lexer = new Lexer(source);
            const tokens = lexer.tokenize();

            const parser = new Parser(tokens);
            const ast = parser.parse();

            return {
                success: true,
                ast,
                tokens
            };
        } catch (error) {
            return {
                success: false,
                error: this.formatError(error)
            };
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        // Stop and clean up all active interpreters
        for (const interp of this._activeInterpreters) {
            interp.stop();
            interp.cleanup();
        }
        this._activeInterpreters.clear();

        // Stop and clean up all persistent interpreters
        this.stopAllPersistent();

        if (this.interpreter) {
            this.interpreter.cleanup();
        }
    }

    /**
     * Reset the engine state
     */
    reset() {
        this.cleanup();
        this.interpreter = new Interpreter({
            limits: this.limits,
            context: this.context,
            onOutput: (message) => this.emitOutput(message),
            onError: (error) => this.emitError(error)
        });
        registerAllBuiltins(this.interpreter);

        // Re-register custom builtins on the new primary interpreter
        for (const [name, fn] of this._customBuiltins) {
            this.interpreter.registerBuiltin(name, fn);
        }
    }
}

// Export singleton instance
const ScriptEngine = new ScriptEngineClass();

if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.scriptEngine = ScriptEngine;
}

export default ScriptEngine;
export { ScriptEngineClass };
