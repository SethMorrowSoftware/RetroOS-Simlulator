/**
 * PresenceManager - Online user tracking and presence state
 *
 * Tracks which users are online, their status, and current activity.
 * Integrates with MultiplayerClient for real-time presence updates.
 *
 * Usage:
 *   import PresenceManager from './core/PresenceManager.js';
 *   PresenceManager.initialize(multiplayerClient);
 *   PresenceManager.getOnlineUsers();
 *   PresenceManager.setStatus('away');
 */

import EventBus from './EventBus.js';
import MultiplayerClient from './MultiplayerClient.js';

class PresenceManagerClass {
    constructor() {
        // userId -> { userUuid, displayName, status, activity, lastSeen }
        this.users = new Map();
        this.initialized = false;
        this.myStatus = 'online';
        this.myActivity = null;

        // Typing indicators: roomId -> Map<userId, { displayName, timestamp }>
        this.typingUsers = new Map();

        // Typing indicator expiry (3 seconds)
        this.TYPING_EXPIRY = 3000;
        this.typingCleanupTimer = null;
    }

    /**
     * Initialize the presence system
     */
    initialize() {
        if (this.initialized) return;
        this.initialized = true;
        this._eventUnsubscribers = [];

        // Listen for multiplayer presence events
        this._eventUnsubscribers.push(EventBus.on('mp:presence:online_list', (data) => {
            this.users.clear();
            for (const user of (data.users || [])) {
                this.users.set(user.userId, {
                    userUuid: user.userUuid,
                    displayName: user.displayName,
                    status: 'online',
                    activity: null,
                    lastSeen: Date.now()
                });
            }
            this._emitUpdate();
        }));

        this._eventUnsubscribers.push(EventBus.on('mp:presence:join', (data) => {
            this.users.set(data.userId, {
                userUuid: data.userUuid,
                displayName: data.displayName,
                status: 'online',
                activity: null,
                lastSeen: Date.now()
            });
            this._emitUpdate();
        }));

        this._eventUnsubscribers.push(EventBus.on('mp:presence:leave', (data) => {
            this.users.delete(data.userId);
            // A user who disconnects mid-typing shouldn't linger in the
            // typing list until the expiry sweep catches them.
            for (const [roomId, users] of this.typingUsers) {
                if (users.delete(data.userId)) {
                    EventBus.emit('mp:typing:update', { roomId, typingUsers: this.getTypingUsers(roomId) });
                    if (users.size === 0) this.typingUsers.delete(roomId);
                }
            }
            this._emitUpdate();
        }));

        this._eventUnsubscribers.push(EventBus.on('mp:presence:update', (data) => {
            const user = this.users.get(data.userId);
            if (user) {
                user.status = data.status ?? user.status;
                user.activity = 'activity' in data ? data.activity : user.activity;
                user.lastSeen = Date.now();
                this._emitUpdate();
            }
        }));

        this._eventUnsubscribers.push(EventBus.on('mp:presence:typing', (data) => {
            const { roomId, userId, displayName } = data;
            if (!this.typingUsers.has(roomId)) {
                this.typingUsers.set(roomId, new Map());
            }
            this.typingUsers.get(roomId).set(userId, {
                displayName,
                timestamp: Date.now()
            });
            EventBus.emit('mp:typing:update', { roomId, typingUsers: this.getTypingUsers(roomId) });
        }));

        // Clean up expired typing indicators
        this.typingCleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [roomId, users] of this.typingUsers) {
                let changed = false;
                for (const [userId, info] of users) {
                    if (now - info.timestamp > this.TYPING_EXPIRY) {
                        users.delete(userId);
                        changed = true;
                    }
                }
                if (changed) {
                    EventBus.emit('mp:typing:update', { roomId, typingUsers: this.getTypingUsers(roomId) });
                }
                if (users.size === 0) {
                    this.typingUsers.delete(roomId);
                }
            }
        }, 1000);

        // Handle disconnect
        this._eventUnsubscribers.push(EventBus.on('mp:state', (data) => {
            if (data.state === 'disconnected') {
                this.users.clear();
                this.typingUsers.clear();
                this._emitUpdate();
            }
        }));

        console.log('[PresenceManager] Initialized');
    }

    /**
     * Set my online status
     * @param {string} status - 'online' | 'away' | 'busy' | 'in_game'
     * @param {Object} activity - Current activity info { appId, roomId, etc. }
     */
    setStatus(status, activity = null) {
        this.myStatus = status;
        this.myActivity = activity;
        MultiplayerClient.updateStatus(status, activity);
    }

    /**
     * Send a typing indicator for a room
     * @param {string} roomId
     */
    sendTyping(roomId) {
        MultiplayerClient.sendTyping(roomId);
    }

    /**
     * Get all online users
     * @returns {Array<{ userId, userUuid, displayName, status, activity }>}
     */
    getOnlineUsers() {
        return [...this.users.entries()].map(([userId, info]) => ({
            userId,
            ...info
        }));
    }

    /**
     * Get online user count
     * @returns {number}
     */
    getOnlineCount() {
        return this.users.size;
    }

    /**
     * Check if a specific user is online
     * @param {number} userId
     * @returns {boolean}
     */
    isOnline(userId) {
        return this.users.has(userId);
    }

    /**
     * Get a specific user's presence info
     * @param {number} userId
     * @returns {Object|null}
     */
    getUserPresence(userId) {
        return this.users.get(userId) || null;
    }

    /**
     * Get users currently typing in a room
     * @param {string} roomId
     * @returns {Array<{ userId, displayName }>}
     */
    getTypingUsers(roomId) {
        const users = this.typingUsers.get(roomId);
        if (!users) return [];

        const now = Date.now();
        const result = [];
        for (const [userId, info] of users) {
            if (now - info.timestamp <= this.TYPING_EXPIRY) {
                result.push({ userId, displayName: info.displayName });
            }
        }
        return result;
    }

    /**
     * Destroy the presence manager
     */
    destroy() {
        // Unsubscribe all event listeners
        if (this._eventUnsubscribers) {
            for (const unsub of this._eventUnsubscribers) {
                if (typeof unsub === 'function') unsub();
            }
            this._eventUnsubscribers = [];
        }
        if (this.typingCleanupTimer) {
            clearInterval(this.typingCleanupTimer);
            this.typingCleanupTimer = null;
        }
        this.users.clear();
        this.typingUsers.clear();
        this.initialized = false;
    }

    /**
     * Emit a presence update event
     * @private
     */
    _emitUpdate() {
        EventBus.emit('mp:presence:changed', {
            onlineCount: this.users.size,
            users: this.getOnlineUsers()
        });
    }
}

const PresenceManager = new PresenceManagerClass();
export { PresenceManager };
export default PresenceManager;
