/**
 * StringBuiltins - String manipulation functions for RetroScript
 */

import { DEFAULT_LIMITS } from '../utils/SafetyLimits.js';

// Maximum repeat count to prevent memory exhaustion
const MAX_REPEAT_COUNT = 10000;

export function registerStringBuiltins(interpreter) {
    // Case conversion
    interpreter.registerBuiltin('upper', (str) => String(str).toUpperCase());
    interpreter.registerBuiltin('lower', (str) => String(str).toLowerCase());

    // Trimming
    interpreter.registerBuiltin('trim', (str) => String(str).trim());
    interpreter.registerBuiltin('trimStart', (str) => String(str).trimStart());
    interpreter.registerBuiltin('trimEnd', (str) => String(str).trimEnd());

    // Length and characters
    interpreter.registerBuiltin('length', (str) => {
        if (Array.isArray(str)) return str.length;
        return String(str).length;
    });
    interpreter.registerBuiltin('charAt', (str, index) => String(str).charAt(Number(index)));
    interpreter.registerBuiltin('charCode', (str, index = 0) => String(str).charCodeAt(Number(index)));
    interpreter.registerBuiltin('fromCharCode', (...codes) => String.fromCharCode(...codes.map(Number)));

    // Concatenation (with safety limit to prevent memory exhaustion)
    interpreter.registerBuiltin('concat', (...args) => {
        const result = args.map(String).join('');
        if (result.length > DEFAULT_LIMITS.MAX_STRING_LENGTH) {
            return result.substring(0, DEFAULT_LIMITS.MAX_STRING_LENGTH);
        }
        return result;
    });

    // Substrings
    interpreter.registerBuiltin('substr', (str, start, length) => {
        const s = String(str);
        if (length === undefined) return s.substring(Number(start));
        return s.substring(Number(start), Number(start) + Number(length));
    });
    interpreter.registerBuiltin('substring', (str, start, end) => {
        const s = String(str);
        if (end === undefined) return s.substring(Number(start));
        return s.substring(Number(start), Number(end));
    });
    interpreter.registerBuiltin('slice', (str, start, end) => {
        if (Array.isArray(str)) {
            if (end === undefined) return str.slice(Number(start));
            return str.slice(Number(start), Number(end));
        }
        const s = String(str);
        if (end === undefined) return s.slice(Number(start));
        return s.slice(Number(start), Number(end));
    });

    // Search
    interpreter.registerBuiltin('indexOf', (str, search, fromIndex = 0) => {
        if (Array.isArray(str)) return str.indexOf(search, Number(fromIndex));
        return String(str).indexOf(String(search), Number(fromIndex));
    });
    interpreter.registerBuiltin('lastIndexOf', (str, search, fromIndex) => {
        if (Array.isArray(str)) {
            return fromIndex === undefined
                ? str.lastIndexOf(search)
                : str.lastIndexOf(search, Number(fromIndex));
        }
        const s = String(str);
        return fromIndex === undefined
            ? s.lastIndexOf(String(search))
            : s.lastIndexOf(String(search), Number(fromIndex));
    });
    interpreter.registerBuiltin('contains', (str, search) => {
        if (Array.isArray(str)) return str.includes(search);
        return String(str).includes(String(search));
    });
    interpreter.registerBuiltin('startsWith', (str, search) => String(str).startsWith(String(search)));
    interpreter.registerBuiltin('endsWith', (str, search) => String(str).endsWith(String(search)));

    // Replace
    interpreter.registerBuiltin('replace', (str, search, replacement) => {
        return String(str).replace(String(search), String(replacement));
    });
    interpreter.registerBuiltin('replaceAll', (str, search, replacement) => {
        return String(str).split(String(search)).join(String(replacement));
    });

    // Split/Join
    interpreter.registerBuiltin('split', (str, separator = '') => {
        return String(str).split(separator);
    });
    interpreter.registerBuiltin('join', (arr, separator = '') => {
        if (Array.isArray(arr)) return arr.join(String(separator));
        return String(arr);
    });

    // Padding (with safety limits to prevent memory exhaustion)
    interpreter.registerBuiltin('padStart', (str, length, pad = ' ') => {
        const safeLength = Math.min(Number(length), DEFAULT_LIMITS.MAX_STRING_LENGTH);
        return String(str).padStart(safeLength, String(pad));
    });
    interpreter.registerBuiltin('padEnd', (str, length, pad = ' ') => {
        const safeLength = Math.min(Number(length), DEFAULT_LIMITS.MAX_STRING_LENGTH);
        return String(str).padEnd(safeLength, String(pad));
    });

    // Repeat (with safety limit to prevent memory exhaustion)
    interpreter.registerBuiltin('repeat', (str, count) => {
        const repeatCount = Math.max(0, Math.min(MAX_REPEAT_COUNT, Math.floor(Number(count))));
        const result = String(str).repeat(repeatCount);
        // Also check the resulting string length
        if (result.length > DEFAULT_LIMITS.MAX_STRING_LENGTH) {
            return result.substring(0, DEFAULT_LIMITS.MAX_STRING_LENGTH);
        }
        return result;
    });

    // Reverse (works on strings and arrays)
    interpreter.registerBuiltin('reverse', (value) => {
        if (Array.isArray(value)) return [...value].reverse();
        return [...String(value)].reverse().join('');
    });
}

export default registerStringBuiltins;
