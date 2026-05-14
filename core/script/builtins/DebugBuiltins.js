/**
 * DebugBuiltins - Debugging and inspection functions for RetroScript
 */

export function registerDebugBuiltins(interpreter) {
    // Debug output
    interpreter.registerBuiltin('debug', (...args) => {
        const output = args.map(arg => {
            if (typeof arg === 'object') {
                return JSON.stringify(arg, null, 2);
            }
            return String(arg);
        }).join(' ');

        console.log('[RetroScript Debug]', output);
        return output;
    });

    // Inspect value with type info
    interpreter.registerBuiltin('inspect', (value) => {
        const type = value === null ? 'null' :
                     Array.isArray(value) ? 'array' :
                     typeof value;

        let representation;
        if (typeof value === 'object' && value !== null) {
            representation = JSON.stringify(value, null, 2);
        } else if (typeof value === 'string') {
            representation = `"${value}"`;
        } else {
            representation = String(value);
        }

        return `[${type}] ${representation}`;
    });

    // Assertion
    interpreter.registerBuiltin('assert', (condition, message = 'Assertion failed') => {
        if (!condition) {
            throw new Error(String(message));
        }
        return true;
    });

    // Assertion with equality check
    interpreter.registerBuiltin('assertEqual', (actual, expected, message) => {
        const actualStr = JSON.stringify(actual);
        const expectedStr = JSON.stringify(expected);

        if (actualStr !== expectedStr) {
            const msg = message ||
                `Assertion failed: expected ${expectedStr}, got ${actualStr}`;
            throw new Error(msg);
        }
        return true;
    });

    // Type assertion
    interpreter.registerBuiltin('assertType', (value, expectedType, message) => {
        const actualType = value === null ? 'null' :
                          Array.isArray(value) ? 'array' :
                          typeof value;

        if (actualType !== expectedType) {
            const msg = message ||
                `Type assertion failed: expected ${expectedType}, got ${actualType}`;
            throw new Error(msg);
        }
        return true;
    });

    // Trace (log with timestamp)
    interpreter.registerBuiltin('trace', (...args) => {
        const timestamp = new Date().toISOString();
        const output = args.map(String).join(' ');
        console.log(`[${timestamp}]`, output);
        return output;
    });

    // Performance timing
    const timers = new Map();

    interpreter.registerBuiltin('timeStart', (label = 'default') => {
        timers.set(String(label), performance.now());
        return true;
    });

    interpreter.registerBuiltin('timeEnd', (label = 'default') => {
        const start = timers.get(String(label));
        if (start !== undefined) {
            const elapsed = performance.now() - start;
            timers.delete(String(label));
            console.log(`[Timer ${label}] ${elapsed.toFixed(2)}ms`);
            return elapsed;
        }
        return 0;
    });

    // Stack trace (returns current call stack)
    interpreter.registerBuiltin('getCallStack', () => {
        return [...interpreter.callStack];
    });

    // Variable dump
    interpreter.registerBuiltin('dumpVars', () => {
        const vars = interpreter.getVariables();
        console.log('[Variable Dump]', vars);
        return vars;
    });
}

export default registerDebugBuiltins;
