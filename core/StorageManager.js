/**
 * StorageManager - Abstraction layer for persistent storage
 * Provides localStorage wrapper with JSON serialization and fallbacks
 */

import { STORAGE_KEYS } from './Constants.js';

/**
 * Keys that, if present anywhere in a JSON-parsed payload, would let a
 * malicious value mutate Object.prototype (prototype pollution). Any
 * incoming payload — whether written by app code, replayed from
 * localStorage, or hydrated from a remote snapshot — is rejected if it
 * contains one of these keys at any depth.
 *
 * `__proto__` is the obvious one. `constructor` and `prototype` matter
 * because a chain like `{ constructor: { prototype: { polluted: true } } }`
 * still ends up writing to `Object.prototype.polluted` if the object is
 * later merged via `Object.assign` or used as a base for spread copy.
 */
const PROTO_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Walk a value (object, array, or scalar) and return true if any
 * *object key* matches PROTO_POLLUTION_KEYS at any depth. Array
 * indices aren't keys. Cycle detection uses a WeakSet so the check is
 * safe on graphs of unknown shape.
 *
 * @param {*} value
 * @returns {boolean}
 */
function _hasUnsafeKeys(value) {
    const seen = new WeakSet();
    function walk(v) {
        if (v === null || typeof v !== 'object') return false;
        if (seen.has(v)) return false;
        seen.add(v);
        if (Array.isArray(v)) {
            for (const item of v) {
                if (walk(item)) return true;
            }
            return false;
        }
        for (const key of Object.keys(v)) {
            if (PROTO_POLLUTION_KEYS.has(key)) return true;
            if (walk(v[key])) return true;
        }
        return false;
    }
    return walk(value);
}

class StorageManagerClass {
    constructor() {
        this.basePrefix = STORAGE_KEYS.PREFIX;
        this.prefix = STORAGE_KEYS.PREFIX;
        this.userScope = null;
        this.available = this.checkAvailability();
        this.memoryFallback = new Map();
        this.remoteSyncAdapter = null;
        this._cache = new Map(); // In-memory cache to avoid repeated JSON.parse
        this.telemetry = {
            parseFailures: 0,
            quotaExceededCount: 0,
            lastParseFailure: null,
            lastQuotaExceeded: null,
            // W3.5 — payloads rejected because they contained __proto__ /
            // constructor / prototype keys.
            unsafeKeyRejections: 0,
            lastUnsafeKeyRejection: null,
            // W3.1 — writes dropped because they arrived during a remote
            // snapshot hydration.
            hydrationDrops: 0,
            lastHydrationDrop: null,
            // F3 — writes captured before login resolves (queued under user
            // scope once `setUserScope(name)` runs). `preLoginReplays` tracks
            // how many were successfully written to the user-scoped prefix.
            preLoginWrites: 0,
            preLoginReplays: 0
        };

        // W3.1 — hydration guard. UserStateSync.pullRemoteSnapshot wraps its
        // restore loop in beginHydration() / endHydration(). While hydrating,
        // direct UI writes via .set() are dropped (with a warning) so the
        // incoming snapshot isn't immediately overwritten by stale UI state.
        this._isHydrating = false;

        // F3 — pre-login queue. Writes happening before `setUserScope(name)`
        // is called are intended for the eventual user's storage; queue them
        // (keyed by unprefixed key) instead of letting them leak into
        // global storage where they'd be orphaned by the post-login reload.
        // On login, the queue is replayed under the new user prefix and
        // cleared. On logout, pre-login mode is re-entered with an empty
        // queue. `setGlobal()` bypasses this entirely — it's the explicit
        // path for genuinely cross-user writes.
        this._isPreLogin = true;
        this._preLoginQueue = new Map();

        // Invalidate cache when another tab writes to localStorage
        this._boundStorageHandler = (e) => {
            if (e.key) {
                this._cache.delete(e.key);
            }
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', this._boundStorageHandler);
        }
    }

    /**
     * Set user-scoped storage prefix.
     * All subsequent get/set/remove calls will use the user-scoped namespace.
     * This gives each user their own isolated localStorage space for filesystem,
     * desktop icons, settings, etc.
     * @param {string} username - The logged-in user's name (or null to reset to global)
     */
    setUserScope(username) {
        const wasPreLogin = this._isPreLogin;

        // Clear cache when switching user scope since keys change
        this._cache.clear();

        if (username) {
            // Normalize to lowercase for consistent key generation
            const safeUser = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            this.userScope = safeUser;
            this.prefix = `${this.basePrefix}u_${safeUser}_`;
            console.log(`[StorageManager] User scope set: ${safeUser}`);

            // F3 — replay any pre-login writes under the new user prefix so
            // they don't get orphaned in global storage. Replay is
            // *set-if-missing*: pre-login writes are boot-time defaults
            // (default FS, default icons, etc.), so a returning user's
            // existing data must not be clobbered. Keys the user already
            // has are left alone; keys they don't have receive the queued
            // default.
            if (wasPreLogin && this._preLoginQueue.size > 0) {
                let replayed = 0;
                let skipped = 0;
                for (const [unprefixedKey, value] of this._preLoginQueue) {
                    const newPrefixedKey = this.getKey(unprefixedKey);
                    if (_hasUnsafeKeys(value)) {
                        this._recordUnsafeKeyRejection(newPrefixedKey, 'replay');
                        continue;
                    }
                    const existsForUser = this.available
                        ? localStorage.getItem(newPrefixedKey) !== null
                        : this.memoryFallback.has(newPrefixedKey);
                    if (existsForUser) {
                        skipped += 1;
                        continue;
                    }
                    try {
                        const serialized = JSON.stringify(value);
                        if (this.available) {
                            localStorage.setItem(newPrefixedKey, serialized);
                            this._cache.set(newPrefixedKey, JSON.parse(serialized));
                        } else {
                            this.memoryFallback.set(newPrefixedKey, value);
                        }
                        replayed += 1;
                    } catch (err) {
                        console.error(`[StorageManager] Failed to replay pre-login write "${unprefixedKey}":`, err);
                    }
                }
                this.telemetry.preLoginReplays += replayed;
                if (replayed > 0 || skipped > 0) {
                    console.log(`[StorageManager] Pre-login replay under "${safeUser}": ${replayed} written, ${skipped} skipped (user already had data).`);
                }
                if (replayed > 0) {
                    this._notifyRemoteChange();
                }
            }
            this._preLoginQueue.clear();
            this._isPreLogin = false;
        } else {
            // Logout (or initial null scope). Re-enter pre-login mode so the
            // next set of writes (until the next login) is queued instead
            // of leaking to global storage.
            this.userScope = null;
            this.prefix = this.basePrefix;
            this._isPreLogin = true;
            this._preLoginQueue.clear();
            console.log('[StorageManager] User scope cleared (global, pre-login mode re-entered)');
        }
    }

    /**
     * Get a value from global (non-user-scoped) storage.
     * Used for data that must be shared across all users (e.g., registeredUsers list).
     */
    getGlobal(key, defaultValue = null) {
        const prefixedKey = `${this.basePrefix}${key}`;
        try {
            if (!this.available) return defaultValue;

            const item = localStorage.getItem(prefixedKey);
            if (item === null) return defaultValue;

            try {
                const parsed = JSON.parse(item);
                if (_hasUnsafeKeys(parsed)) {
                    this._recordUnsafeKeyRejection(prefixedKey, 'read');
                    return defaultValue;
                }
                return parsed;
            } catch (parseError) {
                this._recordParseFailure(prefixedKey, parseError);
                return defaultValue;
            }
        } catch (_e) {
            return defaultValue;
        }
    }

    /**
     * Set a value in global (non-user-scoped) storage.
     */
    setGlobal(key, value) {
        const prefixedKey = `${this.basePrefix}${key}`;
        if (_hasUnsafeKeys(value)) {
            this._recordUnsafeKeyRejection(prefixedKey, 'write');
            return false;
        }
        try {
            if (this.available) {
                localStorage.setItem(prefixedKey, JSON.stringify(value));
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if localStorage is available
     * @returns {boolean}
     */
    checkAvailability() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            console.warn('[StorageManager] localStorage not available, using memory fallback');
            return false;
        }
    }

    /**
     * Get prefixed key
     * @param {string} key - Key name
     * @returns {string} Prefixed key
     */
    getKey(key) {
        return `${this.prefix}${key}`;
    }

    /**
     * Get a value from storage
     * @param {string} key - Key name
     * @param {*} defaultValue - Default if not found
     * @returns {*} Parsed value
     */
    get(key, defaultValue = null) {
        // F3 — pre-login queue hit: serve queued value so set/get pairs work
        // before login (the queue entry was the most recent intended write).
        if (this._isPreLogin && this._preLoginQueue.has(key)) {
            const queued = this._preLoginQueue.get(key);
            if (queued !== null && typeof queued === 'object') {
                try { return structuredClone(queued); } catch { return queued; }
            }
            return queued;
        }

        const prefixedKey = this.getKey(key);
        try {
            if (this.available) {
                // Return cloned cached value to prevent mutation of internal cache
                if (this._cache.has(prefixedKey)) {
                    const cached = this._cache.get(prefixedKey);
                    if (cached !== null && typeof cached === 'object') {
                        try { return structuredClone(cached); } catch { return cached; }
                    }
                    return cached;
                }

                const item = localStorage.getItem(prefixedKey);
                if (item === null) return defaultValue;

                try {
                    const parsed = JSON.parse(item);
                    // W3.5 — defense-in-depth: a payload written by an older
                    // or compromised version of the app could contain
                    // prototype-polluting keys. Reject it on the way out
                    // so consumers never see the unsafe shape.
                    if (_hasUnsafeKeys(parsed)) {
                        this._recordUnsafeKeyRejection(prefixedKey, 'read');
                        return defaultValue;
                    }
                    this._cache.set(prefixedKey, parsed);
                    return parsed;
                } catch (parseError) {
                    this._recordParseFailure(prefixedKey, parseError);
                    return defaultValue;
                }
            } else {
                return this.memoryFallback.has(prefixedKey)
                    ? this.memoryFallback.get(prefixedKey)
                    : defaultValue;
            }
        } catch (e) {
            console.error(`[StorageManager] Error getting "${key}":`, e);
            return defaultValue;
        }
    }

    /**
     * Set a value in storage
     * @param {string} key - Key name
     * @param {*} value - Value to store
     * @returns {boolean} Success status
     */
    set(key, value) {
        const prefixedKey = this.getKey(key);

        // W3.5 — reject payloads carrying prototype-polluting keys.
        if (_hasUnsafeKeys(value)) {
            this._recordUnsafeKeyRejection(prefixedKey, 'write');
            return false;
        }

        // W3.1 — during a remote snapshot hydration, drop UI-driven writes
        // so the incoming snapshot isn't overwritten before consumers
        // finish reacting to it. UserStateSync brackets the restore loop
        // with beginHydration/endHydration; everything else (including the
        // snapshot writes themselves, which go through this.setDuringHydration)
        // is the cause of the drop, not the victim.
        if (this._isHydrating) {
            this._recordHydrationDrop(prefixedKey);
            return false;
        }

        // F3 — before login resolves, queue the write under the unprefixed
        // key instead of letting it land in global storage. setUserScope()
        // replays the queue under the new user prefix on login. Tests and
        // reads in the meantime see the queued value via get().
        if (this._isPreLogin) {
            try {
                this._preLoginQueue.set(key, structuredClone(value));
            } catch {
                this._preLoginQueue.set(key, value);
            }
            this.telemetry.preLoginWrites += 1;
            return true;
        }

        // Declared outside the try so the QuotaExceededError retry below can
        // still see it — block-scoping it inside made the retry a
        // ReferenceError, which meant every write silently failed once the
        // store filled up.
        let serialized;
        try {
            serialized = JSON.stringify(value);

            if (this.available) {
                localStorage.setItem(prefixedKey, serialized);
                // Cache the parsed serialized form to avoid storing mutable references
                this._cache.set(prefixedKey, JSON.parse(serialized));
            } else {
                this.memoryFallback.set(prefixedKey, value);
            }
            this._notifyRemoteChange();
            return true;
        } catch (e) {
            // Handle quota exceeded
            if (e.name === 'QuotaExceededError') {
                this.telemetry.quotaExceededCount += 1;
                this.telemetry.lastQuotaExceeded = {
                    key: prefixedKey,
                    timestamp: new Date().toISOString()
                };
                console.error('[StorageManager] Storage quota exceeded, running cleanup...');
                this.cleanup();
                // Retry once after cleanup
                try {
                    if (serialized === undefined) return false;
                    localStorage.setItem(prefixedKey, serialized);
                    this._cache.set(prefixedKey, JSON.parse(serialized));
                    this._notifyRemoteChange();
                    return true;
                } catch (retryError) {
                    console.error(`[StorageManager] Retry failed for "${key}":`, retryError);
                    return false;
                }
            } else {
                console.error(`[StorageManager] Error setting "${key}":`, e);
            }
            return false;
        }
    }

    /**
     * Remove a value from storage
     * @param {string} key - Key name
     */
    remove(key) {
        // F3 — pre-login: if the key is in the queue, drop it there so the
        // remove isn't shadowed by a later replay. Don't touch localStorage —
        // pre-login writes never reached it.
        if (this._isPreLogin && this._preLoginQueue.has(key)) {
            this._preLoginQueue.delete(key);
            return;
        }

        const prefixedKey = this.getKey(key);

        this._cache.delete(prefixedKey);

        if (this.available) {
            localStorage.removeItem(prefixedKey);
        } else {
            this.memoryFallback.delete(prefixedKey);
        }

        this._notifyRemoteChange();
    }

    /**
     * Check if key exists
     * @param {string} key - Key name
     * @returns {boolean}
     */
    has(key) {
        // F3 — queued pre-login writes count as "present" so caller logic
        // that reads after a write (e.g. defaults-or-stored patterns) works.
        if (this._isPreLogin && this._preLoginQueue.has(key)) {
            return true;
        }

        const prefixedKey = this.getKey(key);

        if (this.available) {
            return localStorage.getItem(prefixedKey) !== null;
        } else {
            return this.memoryFallback.has(prefixedKey);
        }
    }

    /**
     * Get all keys (without prefix)
     * @returns {string[]} Array of keys
     */
    keys() {
        const keys = [];
        
        if (this.available) {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (typeof key === 'string' && key.startsWith(this.prefix)) {
                    keys.push(key.substring(this.prefix.length));
                }
            }
        } else {
            this.memoryFallback.forEach((_, key) => {
                if (key.startsWith(this.prefix)) {
                    keys.push(key.substring(this.prefix.length));
                }
            });
        }
        
        return keys;
    }

    /**
     * Clear all app-specific storage
     */
    clear() {
        this._cache.clear();

        // F3 — also drop any queued pre-login writes so they don't get
        // replayed on next login.
        this._preLoginQueue.clear();

        if (this.available) {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (typeof key === 'string' && key.startsWith(this.prefix)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        } else {
            this.memoryFallback.clear();
        }

        this._notifyRemoteChange();
    }

    /**
     * Get storage usage info
     * @returns {Object} Usage statistics
     */
    getUsage() {
        let used = 0;
        let total = 5 * 1024 * 1024; // Typical 5MB limit

        if (this.available) {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (typeof key !== 'string') continue;
                const value = localStorage.getItem(key);
                const safeValue = typeof value === 'string' ? value : '';
                used += (key.length + safeValue.length) * 2; // UTF-16
            }
        }

        return {
            used,
            total,
            available: total - used,
            percentUsed: ((used / total) * 100).toFixed(2)
        };
    }

    /**
     * Cleanup old/unnecessary data when storage is full
     * Removes the largest non-essential items to free space
     */
    cleanup() {
        console.log('[StorageManager] Running cleanup...');
        if (!this.available) return;

        // Collect all app items with their sizes
        const items = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (typeof key === 'string' && key.startsWith(this.prefix)) {
                const value = localStorage.getItem(key);
                const safeValue = typeof value === 'string' ? value : '';
                items.push({ key, size: (key.length + safeValue.length) * 2 });
            }
        }

        // Sort by size descending - remove largest items first
        items.sort((a, b) => b.size - a.size);

        // Essential keys that should not be cleaned up
        const essential = new Set([
            this.getKey('desktopIcons'),
            this.getKey('fileSystem'),
            this.getKey('soundEnabled'),
            this.getKey('crtEnabled'),
            this.getKey('petEnabled'),
            this.getKey('hasVisited'),
            this.getKey('achievements')
        ]);

        let freed = 0;
        for (const item of items) {
            if (essential.has(item.key)) continue;
            localStorage.removeItem(item.key);
            freed += item.size;
            console.log(`[StorageManager] Removed ${item.key} (${item.size} bytes)`);
            // Free at least 100KB
            if (freed > 100 * 1024) break;
        }

        console.log(`[StorageManager] Freed ~${Math.round(freed / 1024)}KB`);
    }

    /**
     * Export all data as JSON string
     * @returns {string} JSON export
     */
    exportAll() {
        const data = {};
        this.keys().forEach(key => {
            data[key] = this.get(key);
        });
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import data from JSON string
     * @param {string} json - JSON data
     * @returns {boolean} Success status
     */
    importAll(json) {
        try {
            const data = JSON.parse(json);
            Object.entries(data).forEach(([key, value]) => {
                this.set(key, value);
            });
            return true;
        } catch (e) {
            console.error('[StorageManager] Import failed:', e);
            return false;
        }
    }

    /**
     * Check whether persistent storage (localStorage) is available.
     * When false, the system is using an in-memory fallback and all
     * data will be lost on page refresh.
     * @returns {boolean}
     */
    isPersistent() {
        return this.available;
    }


    /**
     * Register a remote sync adapter (e.g., database snapshot sync).
     * Adapter should expose scheduleSync(delayMs).
     */
    setRemoteSyncAdapter(adapter) {
        this.remoteSyncAdapter = adapter || null;
    }

    _notifyRemoteChange() {
        if (!this.remoteSyncAdapter || typeof this.remoteSyncAdapter.scheduleSync !== 'function') {
            return;
        }

        this.remoteSyncAdapter.scheduleSync();
    }

    /**
     * Initialize storage (for consistency with other modules).
     * Schedules a user-visible warning when running in memory-only mode.
     */
    initialize() {
        console.log('[StorageManager] Initialized, available:', this.available);

        if (!this.available) {
            // Defer notification until the event bus and UI are ready
            this._fallbackWarningPending = true;
        }
    }

    /**
     * Emit the deferred storage fallback warning.
     * Called after the system is fully booted so UI notification handlers
     * are registered. Safe to call multiple times; only fires once.
     */
    emitFallbackWarning() {
        if (!this._fallbackWarningPending) return;
        this._fallbackWarningPending = false;

        // Dynamic import to avoid circular dependency during construction
        import('./EventBus.js').then(({ default: EventBus }) => {
            EventBus.emit('notification:show', {
                title: 'Storage Unavailable',
                message: 'localStorage is not available. Your settings and files will not persist after this session.',
                type: 'warning',
                duration: 10000
            });
            EventBus.emit('system:warning', {
                source: 'StorageManager',
                message: 'Running in memory-only fallback mode — data will not persist.'
            });
        });
    }

    _recordParseFailure(key, error) {
        this.telemetry.parseFailures += 1;
        this.telemetry.lastParseFailure = {
            key,
            timestamp: new Date().toISOString(),
            message: error?.message || 'JSON parse failure'
        };
        console.warn(`[StorageManager] Corrupted JSON for "${key}". Returning fallback value.`, error);
    }

    _recordUnsafeKeyRejection(key, direction) {
        this.telemetry.unsafeKeyRejections += 1;
        this.telemetry.lastUnsafeKeyRejection = {
            key,
            direction,
            timestamp: new Date().toISOString()
        };
        console.warn(`[StorageManager] Rejected ${direction} of "${key}" — payload contains prototype-pollution keys.`);
    }

    _recordHydrationDrop(key) {
        this.telemetry.hydrationDrops += 1;
        this.telemetry.lastHydrationDrop = {
            key,
            timestamp: new Date().toISOString()
        };
        console.warn(`[StorageManager] Dropped write to "${key}" during snapshot hydration.`);
    }

    /**
     * Mark the start of a remote snapshot hydration. Any `set()` call during
     * the hydration window is dropped (and tallied in telemetry.hydrationDrops).
     * The hydrator itself should use `hydrationSet()` to write the incoming
     * payload without tripping the guard.
     *
     * Idempotent — repeated calls without a matching `endHydration()` keep
     * the flag on. `UserStateSync` is the only intended caller.
     */
    beginHydration() {
        this._isHydrating = true;
    }

    /**
     * Mark the end of a remote snapshot hydration. After this returns, normal
     * `set()` calls resume.
     */
    endHydration() {
        this._isHydrating = false;
    }

    /**
     * Whether a remote snapshot is currently being applied.
     * @returns {boolean}
     */
    isHydrating() {
        return this._isHydrating;
    }

    /**
     * Write a key during hydration, bypassing the `_isHydrating` drop guard.
     * The prototype-pollution check still runs — an incoming snapshot can't
     * be allowed to carry unsafe keys just because it's a snapshot.
     *
     * @param {string} key
     * @param {*} value
     * @returns {boolean}
     */
    hydrationSet(key, value) {
        const prefixedKey = this.getKey(key);
        if (_hasUnsafeKeys(value)) {
            this._recordUnsafeKeyRejection(prefixedKey, 'hydration');
            return false;
        }
        try {
            const serialized = JSON.stringify(value);
            if (this.available) {
                localStorage.setItem(prefixedKey, serialized);
                this._cache.set(prefixedKey, JSON.parse(serialized));
            } else {
                this.memoryFallback.set(prefixedKey, value);
            }
            return true;
        } catch (e) {
            console.error(`[StorageManager] hydrationSet failed for "${key}":`, e);
            return false;
        }
    }

    getTelemetry() {
        return {
            ...this.telemetry
        };
    }

    clearTelemetry() {
        this.telemetry = {
            parseFailures: 0,
            quotaExceededCount: 0,
            lastParseFailure: null,
            lastQuotaExceeded: null,
            unsafeKeyRejections: 0,
            lastUnsafeKeyRejection: null,
            hydrationDrops: 0,
            lastHydrationDrop: null,
            preLoginWrites: 0,
            preLoginReplays: 0
        };
    }

    /**
     * Whether pre-login mode is active (writes are being queued for the
     * eventual user scope). Useful for HealthMonitor diagnostics.
     * @returns {boolean}
     */
    isPreLogin() {
        return this._isPreLogin;
    }

    /**
     * Number of writes currently queued for post-login replay.
     * @returns {number}
     */
    pendingPreLoginWrites() {
        return this._preLoginQueue.size;
    }

    /**
     * Cleanup event listeners to prevent memory leaks.
     */
    destroy() {
        if (typeof window !== 'undefined' && this._boundStorageHandler) {
            window.removeEventListener('storage', this._boundStorageHandler);
        }
    }
}

// Singleton instance
const StorageManager = new StorageManagerClass();

// Expose under the debug object so HealthMonitor's storage section
// (`__OS_HEALTH.storage`) can pull telemetry without an explicit import.
if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.storageManager = StorageManager;
}

export { StorageManager };
export default StorageManager;
