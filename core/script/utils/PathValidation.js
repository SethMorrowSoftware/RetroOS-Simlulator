/**
 * PathValidation - Shared script file-op path validator.
 *
 * Used by both the ScriptEngine public API (validateScriptPath) and the
 * Interpreter file-op visitors. Defense-in-depth: FileSystemManager has
 * its own validation, but scripts should fail at the engine boundary
 * rather than reach into the FS with arbitrary paths. The allowlist
 * mirrors the SSE-driven allowlist in index.js so script-initiated and
 * remote-initiated FS ops have the same boundary.
 */

import { RuntimeError } from '../errors/ScriptError.js';

const ALLOWED_PREFIXES = [
    '/C/server/', '/C/shared/', '/C/public/',
    'C:/server/', 'C:/shared/', 'C:/public/',
    'C:/Users/User/Desktop/',
    'C:/Users/User/Documents/',
    'C:/Users/User/Pictures/',
    'C:/Users/User/Music/',
    'C:/Users/User/Videos/',
    'C:/Users/User/Projects/',
    'C:/Users/User/Secret/',
    'C:/Windows/',
    'C:/Windows/System32/'
];

/**
 * Validate a path is inside an allowed root, free of traversal segments,
 * and not empty/control-character laden.
 * @param {string} path
 * @param {Object} [options]
 * @param {number} [options.line] - Source line for RuntimeError
 * @returns {string} The normalized path (forward slashes)
 */
export function validateScriptPath(path, { line } = {}) {
    if (typeof path !== 'string' || path.length === 0) {
        throw new RuntimeError('File path must be a non-empty string', { line });
    }
    if (/[\x00-\x1f]/.test(path)) {
        throw new RuntimeError('File path contains invalid characters', { line });
    }
    const normalized = path.replace(/\\/g, '/');
    const segments = normalized.split('/');
    if (segments.some(seg => seg === '..')) {
        throw new RuntimeError(`File path traversal not permitted: ${path}`, { line });
    }
    const ensuredTrailingSlash = normalized.endsWith('/') ? normalized : `${normalized}/`;
    if (!ALLOWED_PREFIXES.some(prefix => ensuredTrailingSlash.startsWith(prefix))) {
        throw new RuntimeError(
            `Script file ops are restricted to user/server/shared/public/windows roots. Blocked: ${path}`,
            { line }
        );
    }
    return normalized;
}

export const SCRIPT_PATH_ALLOWED_PREFIXES = ALLOWED_PREFIXES;
