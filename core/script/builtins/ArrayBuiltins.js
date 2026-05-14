/**
 * ArrayBuiltins - Array manipulation functions for RetroScript
 */

import { DEFAULT_LIMITS } from '../utils/SafetyLimits.js';

export function registerArrayBuiltins(interpreter) {
    // Basic operations
    interpreter.registerBuiltin('count', (arr) => {
        if (Array.isArray(arr)) return arr.length;
        if (typeof arr === 'object' && arr !== null) return Object.keys(arr).length;
        return String(arr).length;
    });

    interpreter.registerBuiltin('first', (arr) => {
        if (Array.isArray(arr) && arr.length > 0) return arr[0];
        return null;
    });

    interpreter.registerBuiltin('last', (arr) => {
        if (Array.isArray(arr) && arr.length > 0) return arr[arr.length - 1];
        return null;
    });

    interpreter.registerBuiltin('at', (arr, index) => {
        if (Array.isArray(arr)) return arr[Number(index)];
        return null;
    });

    // Stack operations (mutate in-place for intuitive scripting behavior,
    // with safety limits to prevent memory exhaustion)
    interpreter.registerBuiltin('push', (arr, ...items) => {
        if (Array.isArray(arr)) {
            if (arr.length + items.length > DEFAULT_LIMITS.MAX_ARRAY_LENGTH) {
                const allowed = DEFAULT_LIMITS.MAX_ARRAY_LENGTH - arr.length;
                if (allowed > 0) arr.push(...items.slice(0, allowed));
            } else {
                arr.push(...items);
            }
            return arr;
        }
        return arr;
    });

    interpreter.registerBuiltin('pop', (arr) => {
        if (Array.isArray(arr) && arr.length > 0) {
            return arr.pop();
        }
        return null;
    });

    interpreter.registerBuiltin('shift', (arr) => {
        if (Array.isArray(arr) && arr.length > 0) {
            return arr.shift();
        }
        return null;
    });

    interpreter.registerBuiltin('unshift', (arr, ...items) => {
        if (Array.isArray(arr)) {
            if (arr.length + items.length > DEFAULT_LIMITS.MAX_ARRAY_LENGTH) {
                const allowed = DEFAULT_LIMITS.MAX_ARRAY_LENGTH - arr.length;
                if (allowed > 0) arr.unshift(...items.slice(0, allowed));
            } else {
                arr.unshift(...items);
            }
            return arr;
        }
        return arr;
    });

    // Search
    interpreter.registerBuiltin('includes', (arr, item) => {
        if (Array.isArray(arr)) return arr.includes(item);
        return false;
    });

    interpreter.registerBuiltin('findIndex', (arr, item) => {
        if (Array.isArray(arr)) return arr.indexOf(item);
        return -1;
    });

    interpreter.registerBuiltin('find', (arr, predicate) => {
        // Simple find by value (not callback-based)
        if (Array.isArray(arr)) {
            return arr.find(item => item === predicate) ?? null;
        }
        return null;
    });

    // Sorting
    interpreter.registerBuiltin('sort', (arr) => {
        if (Array.isArray(arr)) {
            return [...arr].sort((a, b) => {
                if (typeof a === 'number' && typeof b === 'number') return a - b;
                return String(a).localeCompare(String(b));
            });
        }
        return arr;
    });

    interpreter.registerBuiltin('sortDesc', (arr) => {
        if (Array.isArray(arr)) {
            return [...arr].sort((a, b) => {
                if (typeof a === 'number' && typeof b === 'number') return b - a;
                return String(b).localeCompare(String(a));
            });
        }
        return arr;
    });

    // Transformations
    interpreter.registerBuiltin('unique', (arr) => {
        if (Array.isArray(arr)) return [...new Set(arr)];
        return arr;
    });

    interpreter.registerBuiltin('flatten', (arr, depth = 1) => {
        if (Array.isArray(arr)) {
            // Limit depth to prevent excessive flattening
            const safeDepth = Math.max(0, Math.min(100, Math.floor(Number(depth))));
            const result = arr.flat(safeDepth);
            // Also check result length
            if (result.length > DEFAULT_LIMITS.MAX_ARRAY_LENGTH) {
                return result.slice(0, DEFAULT_LIMITS.MAX_ARRAY_LENGTH);
            }
            return result;
        }
        return arr;
    });

    // Creation (with safety limits to prevent memory exhaustion)
    interpreter.registerBuiltin('range', (start, end, step = 1) => {
        const s = Number(start);
        const e = Number(end);
        const st = Number(step) || 1;
        const maxLength = DEFAULT_LIMITS.MAX_ARRAY_LENGTH;
        const result = [];

        // Prevent infinite loops by checking step direction and estimating size
        if (st === 0) return result;

        const estimatedSize = Math.abs((e - s) / st);
        if (estimatedSize > maxLength) {
            // Limit to max array length
            const limitedEnd = st > 0 ? s + (st * maxLength) : s - (Math.abs(st) * maxLength);
            if (st > 0) {
                for (let i = s; i < limitedEnd && result.length < maxLength; i += st) {
                    result.push(i);
                }
            } else {
                for (let i = s; i > limitedEnd && result.length < maxLength; i += st) {
                    result.push(i);
                }
            }
        } else {
            if (st > 0) {
                for (let i = s; i < e && result.length < maxLength; i += st) {
                    result.push(i);
                }
            } else {
                for (let i = s; i > e && result.length < maxLength; i += st) {
                    result.push(i);
                }
            }
        }
        return result;
    });

    interpreter.registerBuiltin('fill', (count, value) => {
        const safeCount = Math.max(0, Math.min(DEFAULT_LIMITS.MAX_ARRAY_LENGTH, Math.floor(Number(count))));
        return Array(safeCount).fill(value);
    });

    // Aggregation
    interpreter.registerBuiltin('sum', (arr) => {
        if (Array.isArray(arr)) {
            return arr.reduce((acc, val) => acc + Number(val), 0);
        }
        return 0;
    });

    interpreter.registerBuiltin('avg', (arr) => {
        if (Array.isArray(arr) && arr.length > 0) {
            const total = arr.reduce((acc, val) => acc + Number(val), 0);
            return total / arr.length;
        }
        return 0;
    });

    interpreter.registerBuiltin('product', (arr) => {
        if (Array.isArray(arr)) {
            return arr.reduce((acc, val) => acc * Number(val), 1);
        }
        return 0;
    });

    // Filtering (simple equality-based)
    interpreter.registerBuiltin('filter', (arr, value) => {
        if (Array.isArray(arr)) {
            return arr.filter(item => item === value);
        }
        return [];
    });

    interpreter.registerBuiltin('reject', (arr, value) => {
        if (Array.isArray(arr)) {
            return arr.filter(item => item !== value);
        }
        return [];
    });

    // Mapping (simple operations)
    interpreter.registerBuiltin('map', (arr, operation) => {
        if (!Array.isArray(arr)) return [];

        // Simple operations as strings
        switch (operation) {
            case 'double': return arr.map(x => Number(x) * 2);
            case 'square': return arr.map(x => Number(x) * Number(x));
            case 'string': return arr.map(String);
            case 'number': return arr.map(Number);
            case 'boolean': return arr.map(Boolean);
            default: return arr;
        }
    });

    // Property-path builtins (work with arrays of objects)

    // Helper to resolve a dot-separated property path on an object
    const resolvePath = (obj, path) => {
        if (obj == null) return undefined;
        const parts = String(path).split('.');
        let current = obj;
        for (const part of parts) {
            if (current == null) return undefined;
            current = current[part];
        }
        return current;
    };

    interpreter.registerBuiltin('mapBy', (arr, path) => {
        if (!Array.isArray(arr)) return [];
        return arr.map(item => resolvePath(item, path) ?? null);
    });

    interpreter.registerBuiltin('filterBy', (arr, path, value) => {
        if (!Array.isArray(arr)) return [];
        return arr.filter(item => resolvePath(item, path) === value);
    });

    interpreter.registerBuiltin('sortBy', (arr, path) => {
        if (!Array.isArray(arr)) return arr;
        return [...arr].sort((a, b) => {
            const aVal = resolvePath(a, path);
            const bVal = resolvePath(b, path);
            if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
            return String(aVal ?? '').localeCompare(String(bVal ?? ''));
        });
    });

    interpreter.registerBuiltin('sortByDesc', (arr, path) => {
        if (!Array.isArray(arr)) return arr;
        return [...arr].sort((a, b) => {
            const aVal = resolvePath(a, path);
            const bVal = resolvePath(b, path);
            if (typeof aVal === 'number' && typeof bVal === 'number') return bVal - aVal;
            return String(bVal ?? '').localeCompare(String(aVal ?? ''));
        });
    });

    interpreter.registerBuiltin('findBy', (arr, path, value) => {
        if (!Array.isArray(arr)) return null;
        return arr.find(item => resolvePath(item, path) === value) ?? null;
    });

    interpreter.registerBuiltin('groupBy', (arr, path) => {
        if (!Array.isArray(arr)) return {};
        const groups = {};
        for (const item of arr) {
            const key = String(resolvePath(item, path) ?? 'undefined');
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        }
        return groups;
    });

    // Splice (returns new array)
    interpreter.registerBuiltin('splice', (arr, start, deleteCount, ...items) => {
        if (Array.isArray(arr)) {
            const copy = [...arr];
            copy.splice(Number(start), Number(deleteCount), ...items);
            return copy;
        }
        return arr;
    });

    // Concatenation (with safety limit to prevent memory exhaustion)
    interpreter.registerBuiltin('arrayConcat', (...arrays) => {
        const result = arrays.flat();
        if (result.length > DEFAULT_LIMITS.MAX_ARRAY_LENGTH) {
            return result.slice(0, DEFAULT_LIMITS.MAX_ARRAY_LENGTH);
        }
        return result;
    });
}

export default registerArrayBuiltins;
