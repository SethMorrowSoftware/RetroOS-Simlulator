/**
 * StorageManager - Abstraction layer for persistent storage
 * Provides localStorage wrapper with JSON serialization and fallbacks
 */

import { STORAGE_KEYS } from './Constants.js';

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
            lastQuotaExceeded: null
        };

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
        // Clear cache when switching user scope since keys change
        this._cache.clear();

        if (username) {
            // Normalize to lowercase for consistent key generation
            const safeUser = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            this.userScope = safeUser;
            this.prefix = `${this.basePrefix}u_${safeUser}_`;
            console.log(`[StorageManager] User scope set: ${safeUser}`);
        } else {
            this.userScope = null;
            this.prefix = this.basePrefix;
            console.log('[StorageManager] User scope cleared (global)');
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
                return JSON.parse(item);
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
        try {
            const prefixedKey = `${this.basePrefix}${key}`;
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
        try {
            const serialized = JSON.stringify(value);

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
                    localStorage.setItem(prefixedKey, serialized);
                    this._cache.set(prefixedKey, value);
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
            lastQuotaExceeded: null
        };
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

export { StorageManager };
export default StorageManager;
