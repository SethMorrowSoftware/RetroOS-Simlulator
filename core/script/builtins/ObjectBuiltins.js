/**
 * ObjectBuiltins - Object manipulation functions for RetroScript
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function registerObjectBuiltins(interpreter) {
    // Key/Value access
    interpreter.registerBuiltin('keys', (obj) => {
        if (typeof obj === 'object' && obj !== null) {
            return Object.keys(obj);
        }
        return [];
    });

    interpreter.registerBuiltin('values', (obj) => {
        if (typeof obj === 'object' && obj !== null) {
            return Object.values(obj);
        }
        return [];
    });

    interpreter.registerBuiltin('entries', (obj) => {
        if (typeof obj === 'object' && obj !== null) {
            return Object.entries(obj);
        }
        return [];
    });

    // Property access (with prototype pollution protection)
    interpreter.registerBuiltin('get', (obj, key, defaultValue = null) => {
        if (typeof obj === 'object' && obj !== null) {
            const k = String(key);
            if (FORBIDDEN_KEYS.has(k)) return defaultValue;
            const value = obj[k];
            return value !== undefined ? value : defaultValue;
        }
        return defaultValue;
    });

    interpreter.registerBuiltin('set', (obj, key, value) => {
        if (typeof obj === 'object' && obj !== null) {
            const k = String(key);
            if (FORBIDDEN_KEYS.has(k)) return obj;
            obj[k] = value;
            return obj;
        }
        return obj;
    });

    interpreter.registerBuiltin('has', (obj, key) => {
        if (typeof obj === 'object' && obj !== null) {
            const k = String(key);
            if (FORBIDDEN_KEYS.has(k)) return false;
            return k in obj;
        }
        return false;
    });

    interpreter.registerBuiltin('delete', (obj, key) => {
        if (typeof obj === 'object' && obj !== null) {
            const k = String(key);
            if (FORBIDDEN_KEYS.has(k)) return obj;
            delete obj[k];
            return obj;
        }
        return obj;
    });

    // Object operations
    interpreter.registerBuiltin('merge', (...objects) => {
        const result = {};
        for (const obj of objects) {
            if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
                Object.assign(result, obj);
            }
        }
        return result;
    });

    interpreter.registerBuiltin('clone', (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;
        return JSON.parse(JSON.stringify(obj));
    });

    interpreter.registerBuiltin('freeze', (obj) => {
        if (typeof obj === 'object' && obj !== null) {
            return Object.freeze({ ...obj });
        }
        return obj;
    });

    // Nested property access (dot notation path)
    interpreter.registerBuiltin('getPath', (obj, path, defaultValue = null) => {
        if (typeof obj !== 'object' || obj === null) return defaultValue;

        const parts = String(path).split('.');
        let current = obj;

        for (const part of parts) {
            if (FORBIDDEN_KEYS.has(part)) return defaultValue;
            if (current === null || current === undefined) return defaultValue;
            current = current[part];
        }

        return current !== undefined ? current : defaultValue;
    });

    interpreter.registerBuiltin('setPath', (obj, path, value) => {
        if (typeof obj !== 'object' || obj === null) return obj;

        const parts = String(path).split('.');
        for (const part of parts) {
            if (FORBIDDEN_KEYS.has(part)) return obj;
        }
        const result = { ...obj };
        let current = result;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (typeof current[part] !== 'object' || current[part] === null) {
                current[part] = {};
            } else {
                current[part] = { ...current[part] };
            }
            current = current[part];
        }

        current[parts[parts.length - 1]] = value;
        return result;
    });
}

export default registerObjectBuiltins;
