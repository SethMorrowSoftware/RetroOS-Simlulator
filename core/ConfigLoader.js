/**
 * ConfigLoader - Frontend configuration loader for IlluminatOS!
 *
 * Fetches server-side config at boot and provides a getConfig() helper.
 * Falls back gracefully if no backend is available (static site mode).
 *
 * API version support:
 *   v2: MySQL-backed config with user sessions (preferred)
 *   v1: File-based config via api/config.php (legacy)
 *   v0: No backend, inline defaults only (static mode)
 *
 * Usage:
 *   import { loadConfig, getConfig } from './core/ConfigLoader.js';
 *
 *   await loadConfig();                              // Call once at boot
 *   const osName = getConfig('branding.osName', 'IlluminatOS!');
 */

let _config = null;
let _backendAvailable = false;
let _apiVersion = 0;    // 0=none, 1=legacy, 2=full
let _sessionToken = null;

/** Per-request timeout for config/session fetches (ms) */
const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetch with an AbortController timeout so requests cannot hang indefinitely.
 */
function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * Resolve the API base path relative to the document's location.
 * Handles subdirectory deployments (e.g. /retro/) by deriving the
 * base from the current page URL rather than assuming root.
 * @returns {string} Base path ending with '/' (e.g. '/' or '/retro/')
 */
function getApiBasePath() {
    // For the main app, the document is at the root of the deployment.
    // For admin/index.php, the document is at <base>/admin/index.php.
    // We detect the base by finding the path up to (but not including) known subdirs.
    const path = window.location.pathname;

    // If we're inside the admin panel, strip '/admin/...' to get the base
    const adminIdx = path.indexOf('/admin');
    if (adminIdx !== -1) {
        return path.substring(0, adminIdx + 1);
    }

    // For the main app, use the directory of the current page
    const lastSlash = path.lastIndexOf('/');
    return path.substring(0, lastSlash + 1);
}

/**
 * Load config from the server.
 * Should be called once during boot, before any module reads config.
 * If the fetch fails (no PHP, network error, etc.), the OS still works —
 * every getConfig() call has a fallback default.
 *
 * Tries v2 API first (MySQL-backed), then falls back to v1 (file-based),
 * then to inline defaults (static mode).
 *
 * @returns {Promise<Object>} The loaded config (or empty object on failure)
 */
export async function loadConfig() {
    const basePath = getApiBasePath();

    // Try v2 API first
    try {
        const headers = {};
        if (_sessionToken) {
            headers['Authorization'] = `Bearer ${_sessionToken}`;
        }
        const resp = await fetchWithTimeout(`${basePath}api/v2/config`, { headers });
        if (resp.ok) {
            _config = await resp.json();
            _backendAvailable = true;
            _apiVersion = 2;
            console.log('[ConfigLoader] v2 config loaded successfully');
            window.__OS_CONFIG = _config;
            return _config;
        }
    } catch (e) {
        // v2 not available, try v1
    }

    // Try v1 API (legacy file-based)
    const configUrl = `${basePath}api/config.php`;
    try {
        const resp = await fetchWithTimeout(configUrl);
        if (resp.ok) {
            _config = await resp.json();
            _backendAvailable = true;
            _apiVersion = 1;
            console.log('[ConfigLoader] v1 config loaded successfully');
        } else {
            console.warn(`[ConfigLoader] Server returned ${resp.status}, using inline defaults`);
            _config = {};
        }
    } catch (e) {
        console.warn('[ConfigLoader] No backend config available, using inline defaults');
        _config = {};
    }

    window.__OS_CONFIG = _config;
    return _config;
}

/**
 * Initialize a user session with the v2 API.
 * Creates an anonymous user on first visit or resumes an existing session.
 * Should be called during boot after loadConfig().
 *
 * @returns {Promise<string|null>} The session token, or null if v2 is unavailable
 */
export async function initSession() {
    if (_apiVersion < 2) {
        return null;
    }

    const basePath = getApiBasePath();
    const STORAGE_KEY = 'illuminatos_session_token';

    // Check for existing token in localStorage (wrapped for environments where storage is unavailable)
    let existingToken = null;
    try {
        existingToken = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        // localStorage may be unavailable in some browsing modes
    }

    try {
        const body = existingToken ? { token: existingToken } : {};
        const resp = await fetchWithTimeout(`${basePath}api/v2/auth/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // v2 requires the CSRF sentinel on every mutating request,
                // including the first session-bootstrap call (no Bearer yet).
                'X-Requested-With': 'XMLHttpRequest',
                ...(existingToken ? { 'Authorization': `Bearer ${existingToken}` } : {}),
            },
            body: JSON.stringify(body),
        });

        if (resp.ok) {
            const data = await resp.json();
            _sessionToken = data.token;
            try { localStorage.setItem(STORAGE_KEY, _sessionToken); } catch (e) { /* storage unavailable */ }
            console.log(`[ConfigLoader] Session ${data.resumed ? 'resumed' : 'created'} (${data.user?.role})`);
            return _sessionToken;
        }
    } catch (e) {
        console.warn('[ConfigLoader] Session init failed:', e.message);
    }

    return null;
}

/**
 * Get a config value by dot-notation path.
 *
 * @param {string} path - Dot-notation key path (e.g. 'branding.osName')
 * @param {*} defaultValue - Fallback if the key is not in the config
 * @returns {*} The config value or the default
 *
 * @example
 *   getConfig('branding.osName', 'IlluminatOS!')
 *   getConfig('bootTips', ['Loading...'])
 *   getConfig('wallpapers.space.css', '')
 */
export function getConfig(path, defaultValue) {
    if (!_config) return defaultValue;

    const value = path.split('.').reduce((obj, key) =>
        obj && obj[key] !== undefined ? obj[key] : undefined, _config);

    return value !== undefined ? value : defaultValue;
}

/**
 * Check if any server config was loaded (i.e., backend is available)
 * @returns {boolean}
 */
export function hasServerConfig() {
    return _config !== null && Object.keys(_config).length > 0;
}

/**
 * Check if the PHP backend responded successfully.
 * Returns false when running on a static server or when the API is unreachable.
 * @returns {boolean}
 */
export function isBackendAvailable() {
    return _backendAvailable;
}

/**
 * Get the detected API version.
 * @returns {number} 0=none, 1=legacy file-based, 2=full MySQL-backed
 */
export function getApiVersion() {
    return _apiVersion;
}

/**
 * Get the current session token (for v2 API calls).
 * @returns {string|null}
 */
export function getSessionToken() {
    return _sessionToken;
}

/**
 * Get authorization headers for v2 API calls.
 * Always includes X-Requested-With as the CSRF sentinel header — the v2 API
 * rejects mutating requests without it. Adds Authorization when a session
 * token is available.
 * @returns {Object} Headers object suitable for fetch().
 */
export function getAuthHeaders() {
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (_sessionToken) {
        headers['Authorization'] = `Bearer ${_sessionToken}`;
    }
    return headers;
}

/**
 * Update the session token (e.g. after login returns a new token).
 * Also persists to localStorage so subsequent page loads resume the session.
 * @param {string} token - The new session token
 */
export function setSessionToken(token) {
    _sessionToken = token;
    if (token) {
        try { localStorage.setItem('illuminatos_session_token', token); } catch (e) { /* storage unavailable */ }
    }
}

export { getApiBasePath };

export default {
    loadConfig, getConfig, hasServerConfig, isBackendAvailable,
    getApiBasePath, getApiVersion, getSessionToken, getAuthHeaders, setSessionToken, initSession
};
