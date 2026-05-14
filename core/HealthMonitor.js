/**
 * HealthMonitor - Single aggregator for runtime health and fault domains.
 *
 * `window.__OS_BOOT_HEALTH` (in `index.js`) is a one-shot snapshot of how
 * boot went. HealthMonitor extends that into a *live* picture you can
 * sample at any moment via `window.__OS_HEALTH` (alias of `snapshot()`):
 *
 *   - Subscription accounting (raw `.on()` leak surface)
 *   - Storage telemetry (prototype-pollution rejections, hydration drops)
 *   - Event bus stats (validation errors, cancelled, middleware errors)
 *   - Feature registry posture (enabled / disabled / failed)
 *   - Realtime/multiplayer connection state
 *   - Schema coverage of events seen this session
 *   - Recent faults captured via `recordFault()`
 *
 * The intent is to replace ad-hoc `console.error` "look at the log!" debugging
 * with a single deterministic object that operators (and Claude during /review)
 * can grab from the running app. Faults are deliberately bounded to the last
 * 50 entries so the snapshot stays cheap to serialise.
 */

import EventBus, { Events } from './EventBus.js';
import StateManager from './StateManager.js';
import SubscriptionManager from './SubscriptionManager.js';

const MAX_FAULTS = 50;

class HealthMonitor {
    constructor() {
        this._faults = [];
        this._installed = false;
    }

    install() {
        if (this._installed) return;
        this._installed = true;

        try {
            EventBus.on('system:error', (payload) => this.recordFault('system:error', payload));
            EventBus.on('feature:disable:error', (payload) => this.recordFault('feature:disable:error', payload));
            EventBus.on('app:error', (payload) => this.recordFault('app:error', payload));
            EventBus.on('mp:state:conflict', (payload) => this.recordFault('mp:state:conflict', payload));
            EventBus.on('story:state:conflict', (payload) => this.recordFault('story:state:conflict', payload));
            EventBus.on(Events.AUTH_EXPIRED, (payload) => this.recordFault('auth:expired', payload));
        } catch (err) {
            console.warn('[HealthMonitor] EventBus subscriptions failed to install:', err);
        }
    }

    /**
     * Record a fault. Bounded ring buffer so the snapshot stays cheap.
     */
    recordFault(kind, payload = {}) {
        const entry = {
            kind,
            at: Date.now(),
            payload: this._safePayload(payload)
        };
        this._faults.push(entry);
        if (this._faults.length > MAX_FAULTS) {
            this._faults.splice(0, this._faults.length - MAX_FAULTS);
        }
    }

    _safePayload(payload) {
        try {
            return JSON.parse(JSON.stringify(payload ?? {}));
        } catch {
            return { _unserializable: true };
        }
    }

    /**
     * Aggregate snapshot. Best-effort — any failing subsystem reports
     * `{ error }` rather than throwing the whole snapshot.
     */
    snapshot() {
        const out = {
            timestamp: Date.now(),
            boot: typeof window !== 'undefined' ? window.__OS_BOOT_HEALTH || null : null,
            subscriptions: this._safe(() => ({
                total: SubscriptionManager.getTotalCount(),
                byOwner: SubscriptionManager.getOwnerCounts()
            })),
            storage: this._safe(() => this._lazyImport('storage')),
            bus: this._safe(() => ({
                stats: EventBus.getStats ? EventBus.getStats() : null,
                coverage: EventBus.getSchemaCoverage ? EventBus.getSchemaCoverage() : null,
                listeners: EventBus.getActiveListeners ? EventBus.getActiveListeners() : null
            })),
            features: this._safe(() => this._featureSnapshot()),
            realtime: this._safe(() => this._realtimeSnapshot()),
            faults: this._faults.slice()
        };
        out.degraded = this._isDegraded(out);
        return out;
    }

    _safe(fn) {
        try { return fn(); } catch (err) { return { error: err && err.message || String(err) }; }
    }

    _lazyImport(kind) {
        if (kind === 'storage' && typeof window !== 'undefined' && window.__RETROS_DEBUG?.storageManager?.getTelemetry) {
            return window.__RETROS_DEBUG.storageManager.getTelemetry();
        }
        return null;
    }

    _featureSnapshot() {
        if (typeof window === 'undefined') return null;
        const reg = window.__RETROS_DEBUG?.featureRegistry;
        if (!reg || typeof reg.getAll !== 'function') return null;
        const all = reg.getAll();
        const counts = { enabled: 0, disabled: 0, failed: 0 };
        const failed = [];
        for (const f of all) {
            if (f.failed) { counts.failed++; failed.push(f.id); continue; }
            if (f.enabled === false) counts.disabled++;
            else counts.enabled++;
        }
        return { counts, failed };
    }

    _realtimeSnapshot() {
        if (typeof window === 'undefined') return null;
        const debug = window.__RETROS_DEBUG || {};
        const mp = debug.multiplayerClient;
        const rt = debug.realtimeClient;
        return {
            multiplayer: mp && typeof mp.isConnected === 'function' ? {
                connected: !!mp.isConnected()
            } : null,
            sse: rt && typeof rt.isConnected === 'function' ? {
                connected: !!rt.isConnected()
            } : null
        };
    }

    _isDegraded(snapshot) {
        const reasons = [];
        if (snapshot.boot?.degradedCount > 0) reasons.push('boot');
        if (snapshot.bus?.stats?.validationErrors > 0) reasons.push('validationErrors');
        if (snapshot.features?.failed?.length > 0) reasons.push('failedFeatures');
        if (snapshot.faults?.length > 0) reasons.push('faults');
        const subOwners = snapshot.subscriptions?.byOwner;
        if (subOwners && Object.keys(subOwners).length > 50) reasons.push('subscriptionLeak');
        return reasons.length ? reasons : null;
    }
}

const healthMonitor = new HealthMonitor();

if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.healthMonitor = healthMonitor;
    // Live, callable: `window.__OS_HEALTH()` returns the snapshot.
    Object.defineProperty(window, '__OS_HEALTH', {
        configurable: true,
        get() { return healthMonitor.snapshot(); }
    });
}

export default healthMonitor;
