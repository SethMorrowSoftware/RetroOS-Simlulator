/**
 * SessionManager - Unified logout / user-switch cascade
 *
 * Coordinates teardown of all per-user resources when a user logs out or
 * switches accounts. Before this existed, MultiplayerClient.disconnect(),
 * RealtimeClient.closeRealtime(), and PresenceManager.destroy() each had
 * no caller from the logout path: sockets stayed open with stale tokens,
 * presence leaked, and the next user briefly saw the previous user's
 * StateManager contents.
 *
 * The cascade order matters:
 *   1. Stop realtime channels first so we don't receive events targeted
 *      at the outgoing user mid-teardown.
 *   2. Tear down presence and any session-scoped subscribers.
 *   3. Clear the session token so any in-flight fetch retries fail fast.
 *   4. Reset in-memory state so the new user starts clean.
 *   5. Rescope storage last so initialize() reads from the new namespace.
 *
 * Subscribers can listen for `user:logout` or `user:switch` to add
 * cleanup of their own; this manager invokes them via EventBus *after*
 * the core teardown so they observe a quiesced realtime layer.
 */

import EventBus, { Events } from './EventBus.js';
import StateManager from './StateManager.js';
import StorageManager from './StorageManager.js';
import { setSessionToken } from './ConfigLoader.js';
import MultiplayerClient from './MultiplayerClient.js';
import { closeRealtime } from './RealtimeClient.js';
import PresenceManager from './PresenceManager.js';
import SubscriptionManager from './SubscriptionManager.js';

class SessionManagerClass {
    constructor() {
        this._inProgress = false;
    }

    /**
     * End the current session. Tears down realtime, presence, in-memory state,
     * and the session token. Storage is left untouched — it's user-scoped and
     * will be naturally re-read on the next login.
     */
    async logout({ reason = 'user_requested' } = {}) {
        if (this._inProgress) return;
        this._inProgress = true;
        try {
            await this._teardown();
            // Tell late subscribers (apps, features) it's safe to drop session caches.
            EventBus.emit(Events.USER_LOGOUT, { reason });
        } finally {
            this._inProgress = false;
        }
    }

    /**
     * Switch the active user. Runs the teardown sequence, then sets the new
     * user scope and emits `user:switch` so subscribers (and StateManager.initialize)
     * can rehydrate from the new namespace.
     * @param {string|null} newUsername
     */
    async switchUser(newUsername) {
        if (this._inProgress) return;
        this._inProgress = true;
        try {
            const previous = StorageManager.userScope || null;
            await this._teardown();
            StorageManager.setUserScope(newUsername);
            EventBus.emit(Events.USER_SWITCH, {
                previous,
                next: newUsername || null
            });
        } finally {
            this._inProgress = false;
        }
    }

    /**
     * First-login variant: set the user scope and emit `user:switch` without
     * running the teardown. The teardown would clear the session token that
     * LoginScreen just set and reset volatile state that boot already
     * initialized. Use this from the boot login flow; use switchUser() when
     * an already-logged-in user is being replaced.
     * @param {string|null} newUsername
     */
    attachInitialUser(newUsername) {
        const previous = StorageManager.userScope || null;
        StorageManager.setUserScope(newUsername);
        EventBus.emit(Events.USER_SWITCH, {
            previous,
            next: newUsername || null
        });
    }

    /**
     * Internal teardown sequence shared by logout() and switchUser().
     * Each step is wrapped so one failure doesn't skip the rest — we want
     * the cascade to make best-effort progress through every layer.
     */
    async _teardown() {
        this._safe('MultiplayerClient.disconnect', () => MultiplayerClient.disconnect());
        this._safe('RealtimeClient.closeRealtime', () => closeRealtime());
        this._safe('PresenceManager.destroy', () => PresenceManager.destroy());
        this._safe('ConfigLoader.setSessionToken(null)', () => setSessionToken(null));
        // Release any subscriptions registered under the 'session' owner —
        // these are boot-time wires (SSE handlers in index.js, etc.) that
        // should drop on logout so the next session starts clean.
        this._safe('SubscriptionManager.unsubscribeAll(session)',
            () => SubscriptionManager.unsubscribeAll('session'));
        this._safe('StateManager.resetVolatile', () => StateManager.resetVolatile());
    }

    _safe(label, fn) {
        try {
            fn();
        } catch (err) {
            console.error(`[SessionManager] ${label} failed:`, err);
        }
    }
}

const SessionManager = new SessionManagerClass();
export { SessionManager };
export default SessionManager;
