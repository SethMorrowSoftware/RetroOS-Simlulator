/**
 * AutoexecLoader - Run startup scripts automatically
 *
 * Checks for autoexec.retro files in standard locations
 * and executes the first one found during system boot.
 *
 * Autoexec File Locations (checked in order):
 *   1. ./autoexec.retro - Real web directory (relative to app root) - CHECKED FIRST
 *   2. C:/Windows/autoexec.retro - Virtual filesystem: System-level startup
 *   3. C:/Scripts/autoexec.retro - Virtual filesystem: User scripts folder
 *   4. C:/Users/User/autoexec.retro - Virtual filesystem: User home folder
 *
 * Web admins can place autoexec.retro in the project root, and it will
 * automatically execute on boot, allowing easy customization without
 * modifying the virtual filesystem.
 */

// Import the modular ScriptEngine (now supports legacy compatibility)
import ScriptEngine from './ScriptEngine.js';
import { DEFAULT_LIMITS } from './utils/SafetyLimits.js';

/**
 * Real filesystem paths checked before virtual filesystem paths.
 *
 * Uses relative path (`./`) so it works correctly whether the app is
 * hosted at the site root or inside a subdirectory (e.g. /newos/).
 * A baseURI-resolved candidate is also generated for additional coverage.
 */
const REAL_AUTOEXEC_PATHS = [
    './autoexec.retro'
];

/**
 * Maximum time to wait when probing real web-path autoexec candidates.
 * Prevents slow/misconfigured servers from stalling startup.
 */
const REAL_AUTOEXEC_FETCH_TIMEOUT_MS = 1500;

/**
 * Fetch wrapper with timeout to avoid hanging boot while probing candidates.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            cache: 'no-store',
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Build real autoexec URL candidates, including baseURI-resolved URL for apps
 * hosted under subdirectories.
 * @returns {string[]} Unique candidate URLs/paths in probe order
 */
function getRealAutoexecCandidates() {
    const candidates = [...REAL_AUTOEXEC_PATHS];

    if (typeof document !== 'undefined' && document.baseURI) {
        try {
            const baseResolved = new URL('autoexec.retro', document.baseURI).toString();
            candidates.push(baseResolved);
        } catch (error) {
            // Ignore URL construction errors and rely on static paths
        }
    }

    return [...new Set(candidates)];
}

/**
 * Detect whether fetched content is likely HTML fallback rather than RetroScript.
 *
 * Only inspects the response body.  Content-Type headers are NOT used because
 * many web servers serve unknown extensions (like .retro) as text/html by
 * default, which would cause valid RetroScript files to be rejected.
 *
 * @param {Response} response
 * @param {string} scriptContent
 * @returns {boolean}
 */
function isHtmlFallback(response, scriptContent) {
    const trimmed = scriptContent.trimStart().slice(0, 256).toLowerCase();
    return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

/**
 * Virtual filesystem paths to check for autoexec scripts (in order)
 */
const AUTOEXEC_PATHS = [
    'C:/Windows/autoexec.retro',
    'C:/Scripts/autoexec.retro',
    'C:/Users/User/autoexec.retro'
];

/**
 * Autoexec execution options
 */
/**
 * Build autoexec execution options with a fresh BOOT_TIME timestamp.
 * (BOOT_TIME must be computed at execution time, not module-import time.)
 */
function getAutoexecOptions() {
    return {
        timeout: DEFAULT_LIMITS.AUTOEXEC_TIMEOUT, // 10 second timeout
        variables: {
            AUTOEXEC: true,
            BOOT_TIME: Date.now()
        }
    };
}

/**
 * Active persistent autoexec session ID (if any)
 */
let activeAutoexecSessionId = null;

/**
 * Run autoexec script if one exists
 * @param {Object} context - System context with FileSystemManager, EventBus, etc.
 * @returns {Object|null} Execution result or null if no autoexec found
 */
export async function runAutoexec(context = {}) {
    const FileSystemManager = context.FileSystemManager;
    const EventBus = context.EventBus;

    // FIRST: Check for real file in web directory (allows web admins to provide autoexec.retro)
    const realCandidates = getRealAutoexecCandidates();
    for (const realPath of realCandidates) {
        try {
            console.log(`[AutoexecLoader] Checking for real file: ${realPath}`);
            const response = await fetchWithTimeout(realPath, REAL_AUTOEXEC_FETCH_TIMEOUT_MS);
            console.log(`[AutoexecLoader] Fetch response status for ${realPath}: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                continue;
            }

            const scriptContent = await response.text();

            // Some servers return index.html for unknown paths (HTTP 200 SPA fallback).
            // Treat obvious HTML as "not found" and continue checking.
            if (isHtmlFallback(response, scriptContent)) {
                console.log(`[AutoexecLoader] ${realPath} returned HTML fallback, skipping`);
                continue;
            }

            console.log(`[AutoexecLoader] Found real autoexec script: ${realPath} (${scriptContent.length} bytes)`);
            console.log(`[AutoexecLoader] Script preview: ${scriptContent.substring(0, 200)}...`);

            // Emit start event
            if (EventBus) {
                EventBus.emit('autoexec:start', { path: realPath, timestamp: Date.now() });
            }

            // Keep only one persistent autoexec session alive
            if (activeAutoexecSessionId) {
                ScriptEngine.stopPersistent(activeAutoexecSessionId);
                activeAutoexecSessionId = null;
            }

            // Execute the script as a persistent session so `on event` handlers survive
            console.log(`[AutoexecLoader] Executing real autoexec script (persistent session)...`);
            const result = await ScriptEngine.runPersistent(scriptContent, getAutoexecOptions());
            console.log(`[AutoexecLoader] Execution result:`, result);

            if (result?.success && result?.sessionId) {
                activeAutoexecSessionId = result.sessionId;
            }

            if (result.success) {
                console.log(`[AutoexecLoader] Real autoexec completed successfully`);

                if (EventBus) {
                    EventBus.emit('autoexec:complete', {
                        path: realPath,
                        success: true,
                        timestamp: Date.now()
                    });
                }
            } else {
                console.error(`[AutoexecLoader] Real autoexec failed:`, result.error);

                if (EventBus) {
                    EventBus.emit('autoexec:error', {
                        path: realPath,
                        error: result.error,
                        timestamp: Date.now()
                    });
                }
            }

            return result;
        } catch (error) {
            // Real file doesn't exist or fetch failed - this is normal, fall through to virtual filesystem
            if (error?.name === 'AbortError') {
                console.warn(`[AutoexecLoader] Timeout probing ${realPath} after ${REAL_AUTOEXEC_FETCH_TIMEOUT_MS}ms`);
            } else {
                console.log(`[AutoexecLoader] No real autoexec.retro at ${realPath} (${error.message})`);
            }
        }
    }

    console.log('[AutoexecLoader] No usable real autoexec.retro found, checking virtual filesystem...');

    if (!FileSystemManager) {
        console.warn('[AutoexecLoader] FileSystemManager not available, skipping virtual autoexec paths');
        return null;
    }

    // SECOND: Check virtual filesystem paths
    for (const path of AUTOEXEC_PATHS) {
        try {
            // Check if file exists
            const exists = FileSystemManager.exists(path);

            if (exists) {
                console.log(`[AutoexecLoader] Found autoexec script: ${path}`);

                // Emit start event
                if (EventBus) {
                    EventBus.emit('autoexec:start', { path, timestamp: Date.now() });
                }

                // Keep only one persistent autoexec session alive
                if (activeAutoexecSessionId) {
                    ScriptEngine.stopPersistent(activeAutoexecSessionId);
                    activeAutoexecSessionId = null;
                }

                // Execute virtual-file autoexec as persistent session
                const source = FileSystemManager.readFile(path);
                const result = await ScriptEngine.runPersistent(source, getAutoexecOptions());

                if (result?.success && result?.sessionId) {
                    activeAutoexecSessionId = result.sessionId;
                }

                if (result.success) {
                    console.log(`[AutoexecLoader] Autoexec completed successfully`);

                    if (EventBus) {
                        EventBus.emit('autoexec:complete', {
                            path,
                            success: true,
                            timestamp: Date.now()
                        });
                    }
                } else {
                    console.error(`[AutoexecLoader] Autoexec failed:`, result.error);

                    if (EventBus) {
                        EventBus.emit('autoexec:error', {
                            path,
                            error: result.error,
                            timestamp: Date.now()
                        });
                    }
                }

                // Only run the first found autoexec
                return result;
            }
        } catch (error) {
            console.error(`[AutoexecLoader] Error checking ${path}:`, error);
        }
    }

    console.log('[AutoexecLoader] No autoexec.retro found');
    return null;
}

/**
 * Check if any autoexec file exists
 * @param {Object} context - System context
 * @returns {string|null} Path to first found autoexec or null
 */
export function findAutoexec(context = {}) {
    const FileSystemManager = context.FileSystemManager;

    if (!FileSystemManager) {
        return null;
    }

    for (const path of AUTOEXEC_PATHS) {
        try {
            if (FileSystemManager.exists(path)) {
                return path;
            }
        } catch (error) {
            // Ignore errors and continue checking
        }
    }

    return null;
}

/**
 * Create a sample autoexec file
 * @param {Object} context - System context
 * @param {string} [path] - Path to create (defaults to C:/Windows/autoexec.retro)
 * @param {string} [content] - Script content
 */
export function createSampleAutoexec(context = {}, path = 'C:/Windows/autoexec.retro', content = null) {
    const FileSystemManager = context.FileSystemManager;

    if (!FileSystemManager) {
        console.warn('[AutoexecLoader] Cannot create autoexec: FileSystemManager not available');
        return false;
    }

    const defaultContent = `# ═══════════════════════════════════════════════════════════
# RetrOS Autoexec Script
# This script runs automatically when the system boots
# ═══════════════════════════════════════════════════════════

# Display welcome message
print ═══════════════════════════════════════════════════════════
print   Welcome to RetrOS!
print   Autoexec script is running...
print ═══════════════════════════════════════════════════════════

# Show boot notification
notify RetrOS startup complete!

# Play startup sound
play notify

# Log boot time
set $bootTime = call now
set $formattedTime = call formatTime $bootTime
print   Boot time: $formattedTime

# You can customize this script to:
# - Launch specific applications on boot
# - Set up environment variables
# - Run system checks
# - Display custom messages

# Example: Auto-launch an app (uncomment to use)
# launch calculator

print   Autoexec complete!
`;

    try {
        FileSystemManager.writeFile(path, content || defaultContent);
        console.log(`[AutoexecLoader] Created autoexec at: ${path}`);
        return true;
    } catch (error) {
        console.error(`[AutoexecLoader] Failed to create autoexec:`, error);
        return false;
    }
}

export default {
    runAutoexec,
    findAutoexec,
    createSampleAutoexec,
    AUTOEXEC_PATHS
};
