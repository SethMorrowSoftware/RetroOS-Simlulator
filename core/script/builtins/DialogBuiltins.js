/**
 * DialogBuiltins - Dialog functions for RetroScript
 * Note: Most dialog functionality is handled by statement visitors,
 * but these provide functional equivalents for use in expressions.
 */

export function registerDialogBuiltins(interpreter) {
    // Alert (returns void, just shows message)
    interpreter.registerBuiltin('alert', (message) => {
        const EventBus = interpreter.context.EventBus;
        if (EventBus) {
            EventBus.emit('dialog:alert', { message: String(message) });
        }
        return null;
    });

    // Confirm (returns promise, but for sync use returns true in autoexec mode)
    interpreter.registerBuiltin('confirm', (message) => {
        const EventBus = interpreter.context.EventBus;
        if (EventBus) {
            return new Promise((resolve) => {
                let resolved = false;
                const safeResolve = (value) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        resolve(value);
                    }
                };
                EventBus.emit('dialog:confirm', {
                    message: String(message),
                    callback: safeResolve
                });
                // Timeout fallback (30 seconds for user interaction)
                const timeoutId = setTimeout(() => safeResolve(true), 30000);
            });
        }
        return true;
    });

    // Prompt (returns promise with input value)
    interpreter.registerBuiltin('prompt', (message, defaultValue = '') => {
        const EventBus = interpreter.context.EventBus;
        if (EventBus) {
            return new Promise((resolve) => {
                let resolved = false;
                const safeResolve = (value) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        resolve(value);
                    }
                };
                EventBus.emit('dialog:prompt', {
                    message: String(message),
                    defaultValue: String(defaultValue),
                    callback: safeResolve
                });
                // Timeout fallback (30 seconds for user interaction)
                const timeoutId = setTimeout(() => safeResolve(defaultValue), 30000);
            });
        }
        return defaultValue;
    });

    // Input validation helpers
    interpreter.registerBuiltin('validateInput', (input, type = 'text') => {
        const value = String(input);
        switch (type) {
            case 'number':
                return !isNaN(Number(value)) && value.trim() !== '';
            case 'email':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            case 'url':
                try {
                    new URL(value);
                    return true;
                } catch {
                    return false;
                }
            case 'nonempty':
                return value.trim().length > 0;
            default:
                return true;
        }
    });
}

export default registerDialogBuiltins;
