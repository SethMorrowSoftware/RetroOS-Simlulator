/**
 * ReauthGate - Reauth prompt when the session expires.
 *
 * Subscribes to the canonical `auth:expired` event (fired by
 * `ConfigLoader.fetchWithAuth` when a 401 is observed) and surfaces a
 * blocking prompt so the user can re-authenticate. Until then the
 * platform has run the logout cascade silently — `auth:expired` fired
 * but no UI listened, leaving users staring at a deactivated session
 * with no signal.
 *
 * Behaviour:
 *   - Only one prompt is in flight at a time. Subsequent `auth:expired`
 *     emissions while a prompt is already open are ignored.
 *   - We prefer the SystemDialogs alert (in-OS look) but fall back to
 *     `window.confirm` if dialogs aren't available (e.g. unit-test or
 *     boot-before-features environment).
 *   - On confirmation we delegate to `LoginScreen.show()`, the same
 *     entry point used at boot.
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus, { Events } from '../core/EventBus.js';

class ReauthGate extends FeatureBase {
    constructor() {
        super({
            id: 'reauthgate',
            name: 'Reauth Gate',
            description: 'Surfaces a reauth prompt when the session expires',
            icon: '🔒',
            category: 'core',
            enabledByDefault: true
        });

        this._promptOpen = false;
        this._lastReason = null;
    }

    async initialize() {
        this.subscribe(Events.AUTH_EXPIRED, (payload) => {
            this._handleAuthExpired(payload || {});
        });
    }

    _handleAuthExpired(payload) {
        if (this._promptOpen) return;
        this._promptOpen = true;
        this._lastReason = payload.reason || 'session_expired';

        const proceed = (confirmed) => {
            this._promptOpen = false;
            if (confirmed) this._runReauth();
        };

        try {
            const dialogsListening = typeof EventBus.listenerCount === 'function'
                && EventBus.listenerCount('dialog:alert') > 0;
            if (dialogsListening) {
                EventBus.emit('dialog:alert', {
                    title: 'Session expired',
                    message: 'Your session has expired. Click OK to sign in again.',
                    icon: '🔒',
                    onClose: () => proceed(true)
                });
            } else {
                const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
                    ? window.confirm('Your session has expired. Sign in again?')
                    : true;
                proceed(ok);
            }
        } catch (err) {
            console.error('[ReauthGate] failed to surface reauth prompt:', err);
            proceed(true);
        }
    }

    async _runReauth() {
        try {
            const { default: LoginScreen } = await import('../core/LoginScreen.js');
            const result = await LoginScreen.show();
            if (result && result.username) {
                EventBus.emit('reauth:completed', {
                    username: result.username,
                    reason: this._lastReason
                });
            }
        } catch (err) {
            console.error('[ReauthGate] reauth flow failed:', err);
        } finally {
            this._lastReason = null;
        }
    }

    async cleanup() {
        // SubscriptionManager handles `this.subscribe` releases via FeatureBase.
        this._promptOpen = false;
        this._lastReason = null;
    }
}

export default new ReauthGate();
