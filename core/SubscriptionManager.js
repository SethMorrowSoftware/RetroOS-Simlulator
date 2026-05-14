/**
 * SubscriptionManager - Owner-scoped subscription tracking
 *
 * Cross-cutting accountant for every `.on()` in the system. Subscribers used
 * to accumulate forever: apps opened, features enabled, plugins loaded, and
 * the logout cascade all leaked listeners because the unsubscribe function
 * was returned but almost never stored. AppBase and FeatureBase grew their
 * own per-owner cleanup arrays, but raw `EventBus.on(...)` calls inside
 * lifecycle code bypassed them.
 *
 * This manager fills that gap. The platform sets a `_currentOwner` while
 * lifecycle code runs (`AppBase.launch`, `FeatureBase.enable`,
 * `PluginLoader.loadPlugin`, the session boot), and `SemanticEventBus.on`
 * automatically tracks each subscription against that owner. When the owner
 * ends — window close, feature disable, plugin unload, logout — a single
 * `unsubscribeAll(ownerId)` releases every subscription it owns.
 *
 * Owner IDs are strings: window IDs (`notepad-1`), feature IDs (`soundsystem`),
 * plugin IDs (`my-plugin`), and the literal `'session'` for boot-time wiring
 * that should drop on logout. Anonymous subscriptions (no current owner) are
 * passed through unchanged — they keep the legacy "caller manages cleanup"
 * semantics.
 *
 * Contract:
 *   - `runAs(ownerId, fn)` sets `_currentOwner` for the synchronous body of
 *     `fn`. If `fn` returns a Promise, the owner stays set for the duration
 *     of the await chain too — but overlapping async `runAs` calls will
 *     clobber the current owner, so lifecycle code should register
 *     subscriptions synchronously before any await whenever possible.
 *   - `track(unsub)` wraps an unsubscribe so it removes itself from the
 *     owner set when called, avoiding stale entries in `_byOwner`.
 *   - `unsubscribeAll(ownerId)` is idempotent: calling it twice returns 0
 *     the second time.
 */

class SubscriptionManagerClass {
    constructor() {
        /** @type {Map<string, Set<Function>>} ownerId -> set of unsubscribe functions */
        this._byOwner = new Map();
        /** @type {string|null} The currently active owner (set by runAs). */
        this._currentOwner = null;
    }

    /**
     * Run `fn` with `ownerId` as the current owner. Any subscription
     * created during `fn` is automatically tracked against this owner.
     * Supports both sync and async functions — the owner is held until the
     * returned promise settles.
     *
     * @param {string} ownerId
     * @param {Function} fn
     * @returns {*} Whatever `fn` returns (may be a Promise)
     */
    runAs(ownerId, fn) {
        const prev = this._currentOwner;
        this._currentOwner = ownerId;
        let result;
        try {
            result = fn();
        } catch (err) {
            this._currentOwner = prev;
            throw err;
        }
        if (result && typeof result.then === 'function') {
            // Async path: restore owner when the promise settles. Note that
            // overlapping async runAs calls will clobber _currentOwner. See
            // docstring — register synchronously when possible.
            return result.finally(() => {
                this._currentOwner = prev;
            });
        }
        this._currentOwner = prev;
        return result;
    }

    /**
     * Track an unsubscribe under the current owner.
     * If no owner is active, returns the raw unsub unchanged (anonymous).
     *
     * @param {Function} unsub
     * @returns {Function} A wrapped unsub that also removes itself from the
     *                    owner's set when called.
     */
    track(unsub) {
        if (typeof unsub !== 'function') {
            return typeof unsub === 'function' ? unsub : () => {};
        }
        if (!this._currentOwner) {
            return unsub;
        }
        const owner = this._currentOwner;
        let set = this._byOwner.get(owner);
        if (!set) {
            set = new Set();
            this._byOwner.set(owner, set);
        }
        const wrapped = () => {
            try { unsub(); }
            finally { set.delete(wrapped); }
        };
        set.add(wrapped);
        return wrapped;
    }

    /**
     * Release every subscription tracked under `ownerId`. Safe to call
     * with an unknown ownerId — returns 0 in that case.
     *
     * @param {string} ownerId
     * @returns {number} Count of subscriptions released
     */
    unsubscribeAll(ownerId) {
        const set = this._byOwner.get(ownerId);
        if (!set) return 0;
        const count = set.size;
        // Iterate a snapshot so the wrapped unsub's set.delete() doesn't
        // mutate the set we're iterating.
        for (const u of [...set]) {
            try { u(); }
            catch (err) {
                console.error(`[SubscriptionManager] Unsubscribe failed for owner "${ownerId}":`, err);
            }
        }
        this._byOwner.delete(ownerId);
        return count;
    }

    /**
     * Current owner (for diagnostics).
     * @returns {string|null}
     */
    getCurrentOwner() {
        return this._currentOwner;
    }

    /**
     * Snapshot of all owners and their subscription counts (for diagnostics).
     * @returns {Object<string, number>}
     */
    getOwnerCounts() {
        const result = {};
        for (const [owner, set] of this._byOwner) {
            result[owner] = set.size;
        }
        return result;
    }

    /**
     * Total tracked subscriptions across all owners (for diagnostics).
     * @returns {number}
     */
    getTotalCount() {
        let total = 0;
        for (const set of this._byOwner.values()) {
            total += set.size;
        }
        return total;
    }
}

const SubscriptionManager = new SubscriptionManagerClass();

// Expose to the debug surface
if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.subscriptionManager = SubscriptionManager;
    window.__ILLUMINATOS_DEBUG = window.__RETROS_DEBUG;
}

export { SubscriptionManager };
export default SubscriptionManager;
