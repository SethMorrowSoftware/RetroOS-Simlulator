/**
 * TypeBuiltins - Type checking and conversion functions for RetroScript
 */

export function registerTypeBuiltins(interpreter) {
    // Type checking
    interpreter.registerBuiltin('typeof', (value) => {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    });

    interpreter.registerBuiltin('isNumber', (value) => typeof value === 'number' && !isNaN(value));
    interpreter.registerBuiltin('isString', (value) => typeof value === 'string');
    interpreter.registerBuiltin('isBoolean', (value) => typeof value === 'boolean');
    interpreter.registerBuiltin('isArray', (value) => Array.isArray(value));
    interpreter.registerBuiltin('isObject', (value) => {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    });
    interpreter.registerBuiltin('isNull', (value) => value === null);
    interpreter.registerBuiltin('isUndefined', (value) => value === undefined);
    interpreter.registerBuiltin('isNaN', (value) => Number.isNaN(Number(value)));
    interpreter.registerBuiltin('isFinite', (value) => Number.isFinite(Number(value)));
    interpreter.registerBuiltin('isInteger', (value) => Number.isInteger(Number(value)));

    // Emptiness checks
    interpreter.registerBuiltin('isEmpty', (value) => {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.length === 0;
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    });

    interpreter.registerBuiltin('isNotEmpty', (value) => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.length > 0;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object') return Object.keys(value).length > 0;
        return true;
    });

    // Type conversion
    interpreter.registerBuiltin('toNumber', (value) => {
        const num = Number(value);
        return isNaN(num) ? 0 : num;
    });

    interpreter.registerBuiltin('toInt', (value) => {
        const num = parseInt(value, 10);
        return isNaN(num) ? 0 : num;
    });

    interpreter.registerBuiltin('toFloat', (value) => {
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
    });

    interpreter.registerBuiltin('toString', (value) => {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    });

    interpreter.registerBuiltin('toBoolean', (value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            const lower = value.toLowerCase();
            return lower === 'true' || lower === '1' || lower === 'yes';
        }
        return Boolean(value);
    });

    interpreter.registerBuiltin('toArray', (value) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return value.split('');
        if (typeof value === 'object' && value !== null) return Object.values(value);
        return [value];
    });

    interpreter.registerBuiltin('toObject', (value) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return value;
        }
        if (Array.isArray(value)) {
            const obj = {};
            value.forEach((item, index) => {
                obj[index] = item;
            });
            return obj;
        }
        return { value };
    });

    // Default value
    interpreter.registerBuiltin('default', (value, defaultValue) => {
        if (value === null || value === undefined) return defaultValue;
        return value;
    });

    interpreter.registerBuiltin('coalesce', (...values) => {
        for (const value of values) {
            if (value !== null && value !== undefined) return value;
        }
        return null;
    });
}

export default registerTypeBuiltins;
