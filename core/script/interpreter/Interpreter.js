/**
 * Interpreter - Visitor-based AST interpreter for RetroScript
 *
 * Executes AST nodes using the visitor pattern.
 * Handles all statement and expression types with proper async execution.
 */

import Environment from './Environment.js';
import { SafetyLimits } from '../utils/SafetyLimits.js';
import { RuntimeError, TimeoutError, RecursionError, ScriptReferenceError } from '../errors/ScriptError.js';
import * as AST from '../ast/index.js';

/**
 * Control flow signals
 */
const ControlFlow = {
    NONE: 'none',
    BREAK: 'break',
    CONTINUE: 'continue',
    RETURN: 'return'
};

/**
 * Interpreter class - executes AST
 */
export class Interpreter {
    /**
     * @param {Object} options - Interpreter options
     * @param {SafetyLimits} [options.limits] - Safety limits
     * @param {Object} [options.builtins] - Built-in function registry
     * @param {Object} [options.context] - Execution context (EventBus, CommandBus, etc.)
     */
    constructor(options = {}) {
        this.limits = options.limits || new SafetyLimits();
        this.builtins = options.builtins || new Map();
        this.userFunctions = new Map();
        this.eventHandlers = new Map();
        this.context = options.context || {};

        // Execution state
        this.globalEnv = new Environment();
        this.currentEnv = this.globalEnv;
        this.callStack = [];
        this.controlFlow = ControlFlow.NONE;
        this.returnValue = undefined;
        this.isRunning = false;
        this.shouldStop = false;

        // Output callbacks
        this.onOutput = options.onOutput || (() => {});
        this.onError = options.onError || (() => {});
    }

    /**
     * Execute a list of statements
     * @param {AST.Statement[]} statements - Statements to execute
     * @param {Environment} [env] - Environment to use
     * @returns {*} Result of execution
     */
    async execute(statements, env = null) {
        const previousEnv = this.currentEnv;
        if (env) {
            this.currentEnv = env;
        }

        try {
            this.limits.startExecution();
            this.isRunning = true;
            this.shouldStop = false;
            this.controlFlow = ControlFlow.NONE;
            this.returnValue = undefined;

            for (const stmt of statements) {
                if (this.shouldStop) {
                    break;
                }

                this.limits.checkTimeout();
                await this.visitStatement(stmt);

                if (this.controlFlow !== ControlFlow.NONE) {
                    break;
                }
            }

            return this.returnValue;
        } finally {
            this.isRunning = false;
            this.currentEnv = previousEnv;
            this.limits.stopExecution();
        }
    }

    /**
     * Stop script execution
     */
    stop() {
        this.shouldStop = true;
    }

    /**
     * Visit a statement node
     */
    async visitStatement(stmt) {
        if (!stmt) return;
        return await stmt.accept(this);
    }

    /**
     * Visit an expression node
     */
    async visitExpression(expr) {
        if (!expr) return null;
        return await expr.accept(this);
    }

    // ==================== STATEMENT VISITORS ====================

    async visitBlockStatement(stmt) {
        for (const s of stmt.statements) {
            await this.visitStatement(s);
            if (this.controlFlow !== ControlFlow.NONE) {
                break;
            }
        }
    }

    async visitSetStatement(stmt) {
        const value = await this.visitExpression(stmt.value);
        this.currentEnv.update(stmt.varName, value);
    }

    async visitPrintStatement(stmt) {
        const value = await this.visitExpression(stmt.message);
        const output = this.stringify(value);
        this.onOutput(output);
    }

    async visitIfStatement(stmt) {
        const condition = await this.visitExpression(stmt.condition);

        if (this.isTruthy(condition)) {
            const blockEnv = this.currentEnv.extend();
            const previousEnv = this.currentEnv;
            this.currentEnv = blockEnv;

            try {
                for (const s of stmt.thenBody) {
                    await this.visitStatement(s);
                    if (this.controlFlow !== ControlFlow.NONE) {
                        break;
                    }
                }
            } finally {
                this.currentEnv = previousEnv;
            }
        } else if (stmt.elseBody.length > 0) {
            const blockEnv = this.currentEnv.extend();
            const previousEnv = this.currentEnv;
            this.currentEnv = blockEnv;

            try {
                for (const s of stmt.elseBody) {
                    await this.visitStatement(s);
                    if (this.controlFlow !== ControlFlow.NONE) {
                        break;
                    }
                }
            } finally {
                this.currentEnv = previousEnv;
            }
        }
    }

    async visitMatchStatement(stmt) {
        const value = await this.visitExpression(stmt.expression);

        // Find matching case
        let matchedBody = null;
        for (const matchCase of stmt.cases) {
            for (const caseValueExpr of matchCase.values) {
                const caseValue = await this.visitExpression(caseValueExpr);
                if (value === caseValue) {
                    matchedBody = matchCase.body;
                    break;
                }
            }
            if (matchedBody) break;
        }

        // Fall back to default
        if (!matchedBody && stmt.defaultBody.length > 0) {
            matchedBody = stmt.defaultBody;
        }

        if (matchedBody) {
            const blockEnv = this.currentEnv.extend();
            const previousEnv = this.currentEnv;
            this.currentEnv = blockEnv;

            try {
                for (const s of matchedBody) {
                    await this.visitStatement(s);
                    if (this.controlFlow !== ControlFlow.NONE) {
                        break;
                    }
                }
            } finally {
                this.currentEnv = previousEnv;
            }
        }
    }

    async visitLoopStatement(stmt) {
        const count = await this.visitExpression(stmt.count);
        const iterations = this.limits.clampLoopIterations(Math.floor(Number(count)) || 0);

        const loopEnv = this.currentEnv.extend();
        const previousEnv = this.currentEnv;
        this.currentEnv = loopEnv;

        try {
            for (let i = 0; i < iterations; i++) {
                this.limits.checkTimeout();
                loopEnv.set('i', i);

                for (const s of stmt.body) {
                    await this.visitStatement(s);

                    if (this.controlFlow === ControlFlow.BREAK) {
                        this.controlFlow = ControlFlow.NONE;
                        return;
                    }
                    if (this.controlFlow === ControlFlow.CONTINUE) {
                        this.controlFlow = ControlFlow.NONE;
                        break;
                    }
                    if (this.controlFlow === ControlFlow.RETURN) {
                        return;
                    }
                }
            }
        } finally {
            this.currentEnv = previousEnv;
        }
    }

    async visitWhileStatement(stmt) {
        const loopEnv = this.currentEnv.extend();
        const previousEnv = this.currentEnv;
        this.currentEnv = loopEnv;

        let iterations = 0;
        const maxIterations = this.limits.get('MAX_LOOP_ITERATIONS');

        try {
            while (true) {
                this.limits.checkTimeout();

                if (++iterations > maxIterations) {
                    throw new RuntimeError(
                        `While loop exceeded maximum iterations (${maxIterations})`,
                        { line: stmt.line, column: stmt.column }
                    );
                }

                const condition = await this.visitExpression(stmt.condition);
                if (!this.isTruthy(condition)) {
                    break;
                }

                for (const s of stmt.body) {
                    await this.visitStatement(s);

                    if (this.controlFlow === ControlFlow.BREAK) {
                        this.controlFlow = ControlFlow.NONE;
                        return;
                    }
                    if (this.controlFlow === ControlFlow.CONTINUE) {
                        this.controlFlow = ControlFlow.NONE;
                        break;
                    }
                    if (this.controlFlow === ControlFlow.RETURN) {
                        return;
                    }
                }
            }
        } finally {
            this.currentEnv = previousEnv;
        }
    }

    async visitForEachStatement(stmt) {
        const iterableValue = await this.visitExpression(stmt.array);

        const loopEnv = this.currentEnv.extend();
        const previousEnv = this.currentEnv;
        this.currentEnv = loopEnv;

        try {
            if (Array.isArray(iterableValue)) {
                // Array iteration
                const array = [...iterableValue];
                for (let i = 0; i < array.length; i++) {
                    this.limits.checkTimeout();
                    if (stmt.valueVarName) {
                        // foreach $index, $value in $array
                        loopEnv.set(stmt.varName, i);
                        loopEnv.set(stmt.valueVarName, array[i]);
                    } else {
                        loopEnv.set(stmt.varName, array[i]);
                    }
                    loopEnv.set('i', i);

                    for (const s of stmt.body) {
                        await this.visitStatement(s);

                        if (this.controlFlow === ControlFlow.BREAK) {
                            this.controlFlow = ControlFlow.NONE;
                            return;
                        }
                        if (this.controlFlow === ControlFlow.CONTINUE) {
                            this.controlFlow = ControlFlow.NONE;
                            break;
                        }
                        if (this.controlFlow === ControlFlow.RETURN) {
                            return;
                        }
                    }
                }
            } else if (iterableValue && typeof iterableValue === 'object') {
                // Object iteration
                const entries = Object.entries(iterableValue);
                for (let i = 0; i < entries.length; i++) {
                    this.limits.checkTimeout();
                    const [key, value] = entries[i];
                    loopEnv.set(stmt.varName, key);
                    if (stmt.valueVarName) {
                        loopEnv.set(stmt.valueVarName, value);
                    }
                    loopEnv.set('i', i);

                    for (const s of stmt.body) {
                        await this.visitStatement(s);

                        if (this.controlFlow === ControlFlow.BREAK) {
                            this.controlFlow = ControlFlow.NONE;
                            return;
                        }
                        if (this.controlFlow === ControlFlow.CONTINUE) {
                            this.controlFlow = ControlFlow.NONE;
                            break;
                        }
                        if (this.controlFlow === ControlFlow.RETURN) {
                            return;
                        }
                    }
                }
            } else {
                throw new RuntimeError(
                    `Expected array or object in foreach, got ${typeof iterableValue}`,
                    { line: stmt.line, column: stmt.column }
                );
            }
        } finally {
            this.currentEnv = previousEnv;
        }
    }

    async visitBreakStatement(stmt) {
        this.controlFlow = ControlFlow.BREAK;
    }

    async visitContinueStatement(stmt) {
        this.controlFlow = ControlFlow.CONTINUE;
    }

    async visitReturnStatement(stmt) {
        if (stmt.value) {
            this.returnValue = await this.visitExpression(stmt.value);
        } else {
            this.returnValue = undefined;
        }
        this.controlFlow = ControlFlow.RETURN;
    }

    async visitFunctionDefStatement(stmt) {
        this.userFunctions.set(stmt.name, {
            params: stmt.params,
            body: stmt.body,
            closure: this.currentEnv
        });
    }

    async visitCallStatement(stmt) {
        await this.callFunction(stmt.funcName, stmt.args);
    }

    async visitTryCatchStatement(stmt) {
        try {
            for (const s of stmt.tryBody) {
                await this.visitStatement(s);
                if (this.controlFlow !== ControlFlow.NONE) {
                    break;
                }
            }
        } catch (error) {
            // Store error in catch variable
            const catchEnv = this.currentEnv.extend();
            catchEnv.set(stmt.errorVar, error.message || String(error));

            const previousEnv = this.currentEnv;
            this.currentEnv = catchEnv;

            try {
                for (const s of stmt.catchBody) {
                    await this.visitStatement(s);
                    if (this.controlFlow !== ControlFlow.NONE) {
                        break;
                    }
                }
            } finally {
                this.currentEnv = previousEnv;
            }
        }
    }

    async visitOnStatement(stmt) {
        const EventBus = this.context.EventBus;
        if (!EventBus) {
            console.warn('[Interpreter] EventBus not available for event handlers');
            return;
        }

        // Count total handlers across all events
        let handlerCount = 0;
        for (const handlers of this.eventHandlers.values()) {
            handlerCount += Array.isArray(handlers) ? handlers.length : 1;
        }
        if (!this.limits.checkEventHandlerCount(handlerCount)) {
            throw new RuntimeError(
                `Maximum event handlers (${this.limits.get('MAX_EVENT_HANDLERS')}) exceeded`,
                { line: stmt.line, column: stmt.column }
            );
        }

        // Capture the environment at registration time for proper closure behavior
        const closureEnv = this.currentEnv;

        const handler = async (eventData) => {
            const handlerEnv = closureEnv.extend();
            handlerEnv.set('event', eventData);

            // Save full interpreter state
            const savedEnv = this.currentEnv;
            const savedControlFlow = this.controlFlow;
            const savedReturnValue = this.returnValue;

            this.currentEnv = handlerEnv;
            this.controlFlow = ControlFlow.NONE;
            this.returnValue = null;

            try {
                for (const s of stmt.body) {
                    await this.visitStatement(s);
                    if (this.controlFlow !== ControlFlow.NONE) break;
                }
            } catch (error) {
                this.onError(error.message);
            } finally {
                // Restore full interpreter state
                this.currentEnv = savedEnv;
                this.controlFlow = savedControlFlow;
                this.returnValue = savedReturnValue;
            }
        };

        EventBus.on(stmt.eventName, handler);

        // Store handlers as arrays to support multiple handlers per event
        if (!this.eventHandlers.has(stmt.eventName)) {
            this.eventHandlers.set(stmt.eventName, []);
        }
        this.eventHandlers.get(stmt.eventName).push(handler);
    }

    async visitEmitStatement(stmt) {
        const EventBus = this.context.EventBus;
        if (!EventBus) {
            console.warn('[Interpreter] EventBus not available for emit');
            return;
        }

        // Resolve payload values
        const payload = {};
        for (const [key, valueExpr] of Object.entries(stmt.payload)) {
            payload[key] = await this.visitExpression(valueExpr);
        }

        EventBus.emit(stmt.eventName, payload);
    }

    async visitLaunchStatement(stmt) {
        const CommandBus = this.context.CommandBus;
        if (!CommandBus) {
            console.warn('[Interpreter] CommandBus not available for launch');
            return;
        }

        // Resolve params
        const params = {};
        for (const [key, valueExpr] of Object.entries(stmt.params)) {
            params[key] = await this.visitExpression(valueExpr);
        }

        await CommandBus.execute('app:launch', { appId: stmt.appId, params });
    }

    async visitCloseStatement(stmt) {
        const CommandBus = this.context.CommandBus;
        if (!CommandBus) return;

        if (stmt.target) {
            const target = await this.visitExpression(stmt.target);
            await CommandBus.execute('window:close', { windowId: target });
        } else {
            // Close the most recently focused window
            const StateManager = this.context.StateManager;
            if (StateManager) {
                const activeWindow = StateManager.getState('ui.activeWindow');
                if (activeWindow) {
                    await CommandBus.execute('window:close', { windowId: activeWindow });
                }
            }
        }
    }

    async visitWaitStatement(stmt) {
        const duration = await this.visitExpression(stmt.duration);
        // Cap wait duration at 30 seconds to prevent denial-of-service
        const MAX_WAIT_MS = 30000;
        const ms = Math.max(0, Math.min(MAX_WAIT_MS, Math.floor(Number(duration)) || 0));
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    async visitFocusStatement(stmt) {
        const CommandBus = this.context.CommandBus;
        if (!CommandBus) return;

        const target = await this.visitExpression(stmt.target);
        await CommandBus.execute('window:focus', { windowId: target });
    }

    async visitMinimizeStatement(stmt) {
        const CommandBus = this.context.CommandBus;
        if (!CommandBus) return;

        const target = await this.visitExpression(stmt.target);
        await CommandBus.execute('window:minimize', { windowId: target });
    }

    async visitMaximizeStatement(stmt) {
        const CommandBus = this.context.CommandBus;
        if (!CommandBus) return;

        const target = await this.visitExpression(stmt.target);
        await CommandBus.execute('window:maximize', { windowId: target });
    }

    async visitWriteStatement(stmt) {
        const FileSystem = this.context.FileSystemManager;
        if (!FileSystem) {
            throw new RuntimeError('FileSystemManager not available', { line: stmt.line });
        }

        const content = await this.visitExpression(stmt.content);
        const path = await this.visitExpression(stmt.path);
        FileSystem.writeFile(path, this.stringify(content));
    }

    async visitReadStatement(stmt) {
        const FileSystem = this.context.FileSystemManager;
        if (!FileSystem) {
            throw new RuntimeError('FileSystemManager not available', { line: stmt.line });
        }

        const path = await this.visitExpression(stmt.path);
        const content = FileSystem.readFile(path);
        this.currentEnv.set(stmt.varName, content);
    }

    async visitMkdirStatement(stmt) {
        const FileSystem = this.context.FileSystemManager;
        if (!FileSystem) return;

        const path = await this.visitExpression(stmt.path);
        FileSystem.createDirectory(path);
    }

    async visitDeleteStatement(stmt) {
        const FileSystem = this.context.FileSystemManager;
        if (!FileSystem) return;

        const path = await this.visitExpression(stmt.path);
        try {
            FileSystem.deleteFile(path);
        } catch (e) {
            // If not a file, try deleting as directory
            FileSystem.deleteDirectory(path, true);
        }
    }

    async visitAlertStatement(stmt) {
        const message = await this.visitExpression(stmt.message);
        const EventBus = this.context.EventBus;

        if (EventBus) {
            EventBus.emit('dialog:alert', { message: this.stringify(message) });
        } else {
            console.log('[Alert]', this.stringify(message));
        }
    }

    async visitConfirmStatement(stmt) {
        const message = await this.visitExpression(stmt.message);
        const EventBus = this.context.EventBus;

        return new Promise((resolve) => {
            if (EventBus) {
                // Timeout prevents script from hanging indefinitely if dialog is never answered
                const timeoutId = setTimeout(() => {
                    this.currentEnv.set(stmt.varName, true);
                    resolve(true);
                }, 30000);
                EventBus.emit('dialog:confirm', {
                    message: this.stringify(message),
                    callback: (result) => {
                        clearTimeout(timeoutId);
                        this.currentEnv.set(stmt.varName, result);
                        resolve(result);
                    }
                });
            } else {
                // Autoexec mode - skip dialogs
                this.currentEnv.set(stmt.varName, true);
                resolve(true);
            }
        });
    }

    async visitPromptStatement(stmt) {
        const message = await this.visitExpression(stmt.message);
        const defaultValue = stmt.defaultValue ?
            await this.visitExpression(stmt.defaultValue) : '';
        const EventBus = this.context.EventBus;

        return new Promise((resolve) => {
            if (EventBus) {
                // Timeout prevents script from hanging indefinitely if dialog is never answered
                const timeoutId = setTimeout(() => {
                    this.currentEnv.set(stmt.varName, defaultValue);
                    resolve(defaultValue);
                }, 30000);
                EventBus.emit('dialog:prompt', {
                    message: this.stringify(message),
                    defaultValue: this.stringify(defaultValue),
                    callback: (result) => {
                        clearTimeout(timeoutId);
                        this.currentEnv.set(stmt.varName, result);
                        resolve(result);
                    }
                });
            } else {
                // Autoexec mode - use default value
                this.currentEnv.set(stmt.varName, defaultValue);
                resolve(defaultValue);
            }
        });
    }

    async visitNotifyStatement(stmt) {
        const message = await this.visitExpression(stmt.message);
        const EventBus = this.context.EventBus;

        if (EventBus) {
            EventBus.emit('notification:show', {
                title: 'RetroScript',
                message: this.stringify(message)
            });
        }
    }

    async visitPlayStatement(stmt) {
        const EventBus = this.context.EventBus;
        if (!EventBus) return;

        // Resolve the source (can be literal or variable)
        const source = await this.visitExpression(stmt.source);

        // Resolve options
        const options = {};
        for (const [key, valueExpr] of Object.entries(stmt.options)) {
            options[key] = await this.visitExpression(valueExpr);
        }

        // Determine if this is an MP3 file path or a sound type
        const isFilePath = typeof source === 'string' &&
            (source.includes('/') || source.includes('\\') ||
             source.endsWith('.mp3') || source.endsWith('.wav') ||
             source.endsWith('.ogg') || source.endsWith('.flac') ||
             source.endsWith('.m4a') || source.endsWith('.aac') ||
             source.startsWith('assets/') || source.startsWith('C:') || source.startsWith('c:'));

        if (isFilePath) {
            // Resolve virtual filesystem paths (C:/...) to actual URLs
            let src = source;
            if (source.startsWith('C:') || source.startsWith('c:')) {
                try {
                    const { default: MediaScanner } = await import('../../MediaScanner.js');
                    const parts = source.replace(/\\/g, '/').split('/').filter(Boolean);
                    const resolved = MediaScanner.resolveMediaUrl(parts);
                    if (resolved) src = resolved;
                } catch { /* MediaScanner not available, use raw path */ }
            }

            // Play audio file directly
            EventBus.emit('audio:play', {
                src,
                volume: options.volume,
                loop: options.loop || false,
                force: options.force || false
            });
        } else {
            // Play predefined sound type
            EventBus.emit('sound:play', {
                type: source,
                volume: options.volume,
                loop: options.loop || false,
                force: options.force || false
            });
        }
    }

    async visitStopStatement(stmt) {
        const EventBus = this.context.EventBus;
        if (!EventBus) return;

        if (stmt.source) {
            // Stop specific audio
            const source = await this.visitExpression(stmt.source);
            EventBus.emit('audio:stop', { src: source });
        } else {
            // Stop all audio
            EventBus.emit('audio:stopall', {});
        }
    }

    async visitVideoStatement(stmt) {
        const EventBus = this.context.EventBus;
        const CommandBus = this.context.CommandBus;
        if (!EventBus && !CommandBus) return;

        // Resolve the source (can be literal or variable)
        const source = await this.visitExpression(stmt.source);

        // Resolve options
        const options = {};
        for (const [key, valueExpr] of Object.entries(stmt.options)) {
            options[key] = await this.visitExpression(valueExpr);
        }

        // Resolve virtual filesystem paths (C:/...) to actual URLs
        let src = source;
        if (typeof source === 'string' && (source.startsWith('C:') || source.startsWith('c:'))) {
            try {
                const { default: MediaScanner } = await import('../../MediaScanner.js');
                const parts = source.replace(/\\/g, '/').split('/').filter(Boolean);
                const resolved = MediaScanner.resolveMediaUrl(parts);
                if (resolved) src = resolved;
            } catch { /* MediaScanner not available */ }
        }

        // Launch Media Player with the video source
        if (CommandBus) {
            await CommandBus.execute('app:launch', {
                appId: 'mediaplayer',
                params: {
                    src,
                    name: options.name || src.split('/').pop(),
                    volume: options.volume,
                    loop: options.loop || false,
                    fullscreen: options.fullscreen || false
                }
            });
        }

        // Also emit a video play event for scripts listening
        if (!EventBus) return;
        EventBus.emit('mediaplayer:requested', {
            src,
            options: options,
            timestamp: Date.now()
        });
    }

    async visitCommandStatement(stmt) {
        if (!stmt.command) return;

        // Evaluate all argument expressions
        const resolvedArgs = [];
        for (const arg of (stmt.args || [])) {
            resolvedArgs.push(await this.visitExpression(arg));
        }

        // Try to dispatch through EventBus as a semantic command
        // This allows scripts to call app commands registered via registerCommand()
        // e.g., CommandStatement("inbox:deliverMessage", [{ from: "User", ... }])
        //   → EventBus.emit("command:inbox:deliverMessage", { from: "User", ... })
        const EventBus = this.context.EventBus;
        if (EventBus && stmt.command.includes(':')) {
            const eventName = `command:${stmt.command}`;
            const payload = (resolvedArgs.length > 0 && typeof resolvedArgs[0] === 'object' && resolvedArgs[0] !== null)
                ? resolvedArgs[0]
                : {};
            EventBus.emit(eventName, payload);
            return;
        }

        // Fallback: try CommandBus for built-in commands
        const CommandBus = this.context.CommandBus;
        if (CommandBus) {
            const payload = (resolvedArgs.length > 0 && typeof resolvedArgs[0] === 'object' && resolvedArgs[0] !== null)
                ? resolvedArgs[0]
                : {};
            try {
                await CommandBus.execute(stmt.command, payload);
            } catch (error) {
                console.warn(`[Command] Failed to execute '${stmt.command}':`, error.message);
            }
        }
    }

    // ==================== EXPRESSION VISITORS ====================

    async visitLiteralExpression(expr) {
        // Interpolate $variables in strings (e.g., "Hello, $name!")
        if (typeof expr.value === 'string' && expr.value.includes('$')) {
            return expr.value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, varName) => {
                if (this.currentEnv.has(varName)) {
                    const val = this.currentEnv.get(varName);
                    return val !== null && val !== undefined ? String(val) : '';
                }
                return match;
            });
        }
        return expr.value;
    }

    async visitVariableExpression(expr) {
        const value = this.currentEnv.get(expr.name);
        if (value === undefined && !this.currentEnv.has(expr.name)) {
            // Check if it might be a string interpolation context
            return undefined;
        }
        return value;
    }

    async visitBinaryExpression(expr) {
        const left = await this.visitExpression(expr.left);

        // Short-circuit logical operators: don't evaluate right side unnecessarily
        if (expr.operator === '&&') {
            return this.isTruthy(left) ? await this.visitExpression(expr.right) : left;
        }
        if (expr.operator === '||') {
            return this.isTruthy(left) ? left : await this.visitExpression(expr.right);
        }

        const right = await this.visitExpression(expr.right);

        switch (expr.operator) {
            // Arithmetic
            case '+':
                if (typeof left === 'string' || typeof right === 'string') {
                    return String(left) + String(right);
                }
                return Number(left) + Number(right);
            case '-': return Number(left) - Number(right);
            case '*': return Number(left) * Number(right);
            case '/': {
                const divisor = Number(right);
                if (divisor === 0) {
                    throw new RuntimeError('Division by zero', { line: expr.line, column: expr.column });
                }
                return Number(left) / divisor;
            }
            case '%': {
                const modDivisor = Number(right);
                if (modDivisor === 0) {
                    throw new RuntimeError('Modulo by zero', { line: expr.line, column: expr.column });
                }
                return Number(left) % modDivisor;
            }

            // Comparison (uses strict equality for predictable behavior)
            case '==': return left === right;
            case '!=': return left !== right;
            case '<': return left < right;
            case '>': return left > right;
            case '<=': return left <= right;
            case '>=': return left >= right;

            default:
                throw new RuntimeError(`Unknown operator: ${expr.operator}`, expr.getLocation());
        }
    }

    async visitUnaryExpression(expr) {
        const operand = await this.visitExpression(expr.operand);

        switch (expr.operator) {
            case '-': return -Number(operand);
            case '!': return !this.isTruthy(operand);
            default:
                throw new RuntimeError(`Unknown unary operator: ${expr.operator}`, expr.getLocation());
        }
    }

    async visitCallExpression(expr) {
        return await this.callFunction(expr.funcName, expr.args);
    }

    async visitArrayExpression(expr) {
        const elements = [];
        for (const element of expr.elements) {
            elements.push(await this.visitExpression(element));
        }
        return elements;
    }

    async visitObjectExpression(expr) {
        const obj = {};
        for (const { key, value } of expr.properties) {
            obj[key] = await this.visitExpression(value);
        }
        return obj;
    }

    async visitMemberExpression(expr) {
        const object = await this.visitExpression(expr.object);
        if (object == null) return undefined;
        // Block prototype chain and sandbox-escape access
        const BLOCKED_PROPS = ['__proto__', 'constructor', 'prototype'];
        if (BLOCKED_PROPS.includes(expr.property)) return undefined;
        // Prevent scripts from reaching global browser objects
        if (this._isDangerousObject(object)) return undefined;
        const value = object[expr.property];
        if (this._isDangerousObject(value)) return undefined;
        return value;
    }

    async visitIndexExpression(expr) {
        const object = await this.visitExpression(expr.object);
        const index = await this.visitExpression(expr.index);
        if (object == null) return undefined;
        // Block prototype chain and sandbox-escape access
        const BLOCKED_PROPS = ['__proto__', 'constructor', 'prototype'];
        if (BLOCKED_PROPS.includes(String(index))) return undefined;
        if (this._isDangerousObject(object)) return undefined;
        const value = object[index];
        if (this._isDangerousObject(value)) return undefined;
        return value;
    }

    /**
     * Check if a value is a dangerous browser global that must not
     * be exposed to RetroScript code (sandbox escape prevention).
     * @param {*} value
     * @returns {boolean}
     */
    _isDangerousObject(value) {
        if (value == null || (typeof value !== 'object' && typeof value !== 'function')) {
            return false;
        }
        // Block direct references to browser globals
        if (typeof window !== 'undefined' && value === window) return true;
        if (typeof document !== 'undefined' && value === document) return true;
        if (typeof globalThis !== 'undefined' && value === globalThis) return true;
        // Block access to Function constructor (can eval arbitrary JS)
        if (value === Function) return true;
        // Block eval
        if (typeof eval !== 'undefined' && value === eval) return true;
        return false;
    }

    async visitGroupingExpression(expr) {
        return await this.visitExpression(expr.expression);
    }

    async visitInterpolatedStringExpression(expr) {
        let result = '';
        for (const part of expr.parts) {
            if (typeof part === 'string') {
                result += part;
            } else {
                const value = await this.visitExpression(part);
                result += this.stringify(value);
            }
        }
        return result;
    }

    // ==================== HELPER METHODS ====================

    /**
     * Call a function (builtin or user-defined)
     */
    async callFunction(name, argExprs) {
        // Evaluate arguments
        const args = [];
        for (const argExpr of argExprs) {
            args.push(await this.visitExpression(argExpr));
        }

        // Check builtins first
        if (this.builtins.has(name)) {
            const builtin = this.builtins.get(name);
            try {
                return await builtin(...args);
            } catch (error) {
                throw new RuntimeError(`Error in function '${name}': ${error.message}`);
            }
        }

        // Check user-defined functions
        if (this.userFunctions.has(name)) {
            return await this.callUserFunction(name, args);
        }

        throw new RuntimeError(`Unknown function: '${name}'`, {
            hint: `Function '${name}' is not defined. Check spelling or define it with 'def ${name}() { ... }'`
        });
    }

    /**
     * Call user-defined function
     */
    async callUserFunction(name, args) {
        const func = this.userFunctions.get(name);

        // Check recursion depth
        this.callStack.push(name);
        if (!this.limits.checkRecursionDepth(this.callStack.length)) {
            throw new RecursionError(
                this.limits.get('MAX_RECURSION_DEPTH'),
                name,
                { callStack: [...this.callStack] }
            );
        }

        // Create function scope
        const funcEnv = func.closure.extend();

        // Bind parameters
        for (let i = 0; i < func.params.length; i++) {
            funcEnv.set(func.params[i], args[i]);
        }

        // Execute function body
        const previousEnv = this.currentEnv;
        const previousControlFlow = this.controlFlow;
        const previousReturnValue = this.returnValue;

        this.currentEnv = funcEnv;
        this.controlFlow = ControlFlow.NONE;
        this.returnValue = undefined;

        try {
            for (const stmt of func.body) {
                await this.visitStatement(stmt);
                if (this.controlFlow !== ControlFlow.NONE) {
                    break;
                }
            }
            // Clear stray break/continue that shouldn't propagate out of functions
            if (this.controlFlow === ControlFlow.BREAK || this.controlFlow === ControlFlow.CONTINUE) {
                this.controlFlow = ControlFlow.NONE;
            }
            return this.returnValue;
        } finally {
            this.callStack.pop();
            this.currentEnv = previousEnv;
            this.controlFlow = previousControlFlow;
            this.returnValue = previousReturnValue;
        }
    }

    /**
     * Check if value is truthy
     */
    isTruthy(value) {
        if (value === null || value === undefined) return false;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') return value.length > 0;
        if (Array.isArray(value)) return value.length > 0;
        return true;
    }

    /**
     * Convert value to string for output
     */
    stringify(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return JSON.stringify(value);
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    /**
     * Register a builtin function
     */
    registerBuiltin(name, fn) {
        this.builtins.set(name, fn);
    }

    /**
     * Get all variables in current scope
     */
    getVariables() {
        return this.currentEnv.getAll();
    }

    /**
     * Cleanup resources
     */
    /**
     * Remove all registered event handlers from the EventBus.
     * Can be called independently to prevent handler accumulation
     * when a script is re-executed within the same interpreter.
     */
    clearEventHandlers() {
        const EventBus = this.context.EventBus;
        if (EventBus) {
            for (const [eventName, handlers] of this.eventHandlers) {
                if (Array.isArray(handlers)) {
                    for (const handler of handlers) {
                        EventBus.off(eventName, handler);
                    }
                } else {
                    EventBus.off(eventName, handlers);
                }
            }
        }
        this.eventHandlers.clear();
    }

    cleanup() {
        this.clearEventHandlers();
        this.userFunctions.clear();
        this.globalEnv.clear();
    }
}

export default Interpreter;
