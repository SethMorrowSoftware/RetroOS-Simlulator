/**
 * MultiplayerClient - WebSocket client for real-time multiplayer communication
 *
 * Provides bidirectional communication with the WebSocket server sidecar.
 * Handles authentication, reconnection, and message routing to/from the EventBus.
 *
 * Features:
 * - WebSocket connection with auto-reconnect (exponential backoff)
 * - Authentication handshake using existing session token
 * - Message serialization/deserialization (JSON protocol)
 * - Outbound: send local events to server for broadcast
 * - Inbound: receive remote events and inject into local EventBus
 * - Fallback: degrade gracefully if WebSocket unavailable
 * - Connection state tracking
 *
 * Usage:
 *   import MultiplayerClient from './core/MultiplayerClient.js';
 *   MultiplayerClient.connect(sessionToken);
 *   MultiplayerClient.send({ type: 'chat', payload: { roomId, text } });
 *   MultiplayerClient.on('chat', handler);
 */

import EventBus from './EventBus.js';
import { getConfig, getApiBasePath } from './ConfigLoader.js';

// Connection states
const ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting'
};

class MultiplayerClientClass {
    constructor() {
        this.ws = null;
        this.state = ConnectionState.DISCONNECTED;
        this.token = null;
        this.userId = null;
        this.userUuid = null;
        this.displayName = null;

        // Reconnection
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 15;
        this.reconnectTimer = null;
        this.intentionalClose = false;

        // Message handlers
        this.handlers = new Map();  // type -> Set<handler>

        // Pending messages (queued while connecting)
        this.pendingMessages = [];

        // Online users cache
        this.onlineUsers = new Map(); // userId -> { userUuid, displayName }

        // Server time offset for latency compensation
        this.serverTimeOffset = 0;

        // Ping tracking
        this.lastPingTime = 0;
        this.latency = 0;
        this.pingInterval = null;
    }

    /**
     * Connect to the WebSocket server
     * @param {string} token - Session authentication token
     */
    connect(token) {
        if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.CONNECTING) {
            return;
        }

        this.token = token;
        this.intentionalClose = false;
        this.reconnectAttempts = 0;
        this._connect();
    }

    /**
     * Internal connect method
     */
    _connect() {
        if (!this.token) return;

        this.state = this.reconnectAttempts > 0 ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING;
        this._emitStateChange();

        // Determine WebSocket URL
        const wsUrl = this._getWebSocketUrl();
        if (!wsUrl) {
            console.log('[MultiplayerClient] No WebSocket URL configured, multiplayer disabled');
            this.state = ConnectionState.DISCONNECTED;
            this._emitStateChange();
            return;
        }

        try {
            this.ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(this.token)}`);
        } catch (err) {
            console.warn('[MultiplayerClient] WebSocket creation failed:', err.message);
            this._scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            console.log('[MultiplayerClient] WebSocket connected');
            this.state = ConnectionState.CONNECTED;
            this.reconnectAttempts = 0;
            this._emitStateChange();

            // Flush pending messages
            while (this.pendingMessages.length > 0) {
                const msg = this.pendingMessages.shift();
                this._sendRaw(msg);
            }

            // Start ping interval
            this._startPing();
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this._handleMessage(message);
            } catch (err) {
                console.warn('[MultiplayerClient] Failed to parse message:', err);
            }
        };

        this.ws.onclose = (event) => {
            this._stopPing();

            if (this.intentionalClose) {
                this.state = ConnectionState.DISCONNECTED;
                this._emitStateChange();
                return;
            }

            console.log(`[MultiplayerClient] WebSocket closed: ${event.code} ${event.reason}`);

            // Don't reconnect on auth errors
            if (event.code === 4001) {
                this.state = ConnectionState.DISCONNECTED;
                this._emitStateChange();
                return;
            }

            this._scheduleReconnect();
        };

        this.ws.onerror = (event) => {
            console.warn('[MultiplayerClient] WebSocket error');
        };
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        this.intentionalClose = true;
        clearTimeout(this.reconnectTimer);
        this._stopPing();

        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }

        this.state = ConnectionState.DISCONNECTED;
        this.onlineUsers.clear();
        this.pendingMessages = [];
        this._emitStateChange();
        console.log('[MultiplayerClient] Disconnected');
    }

    /**
     * Send a message to the WebSocket server
     * @param {Object} message - Message to send
     */
    send(message) {
        if (this.state === ConnectionState.CONNECTED) {
            this._sendRaw(message);
        } else if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.RECONNECTING) {
            // Cap pending messages to prevent unbounded growth during extended disconnection
            if (this.pendingMessages.length < 100) {
                this.pendingMessages.push(message);
            }
        }
    }

    /**
     * Subscribe to a message type
     * @param {string} type - Message type to listen for
     * @param {Function} handler - Handler function(message)
     * @returns {Function} Unsubscribe function
     */
    on(type, handler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type).add(handler);

        return () => {
            const handlers = this.handlers.get(type);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    }

    /**
     * Remove all handlers for a type
     * @param {string} type
     */
    off(type) {
        this.handlers.delete(type);
    }

    // ===== Room Operations =====

    /**
     * Create a room
     * @param {string} roomId - Room identifier
     * @param {Object} options - Room options
     */
    createRoom(roomId, options = {}) {
        this.send({
            type: 'room',
            payload: { action: 'create', roomId, options }
        });
    }

    /**
     * Join a room
     * @param {string} roomId - Room to join
     * @param {string} password - Optional password
     */
    joinRoom(roomId, password = null) {
        this.send({
            type: 'room',
            payload: { action: 'join', roomId, password }
        });
    }

    /**
     * Leave a room
     * @param {string} roomId - Room to leave
     */
    leaveRoom(roomId) {
        this.send({
            type: 'room',
            payload: { action: 'leave', roomId }
        });
    }

    /**
     * List available rooms
     * @param {string} filter - Optional prefix filter
     */
    listRooms(filter = null) {
        this.send({
            type: 'room',
            payload: { action: 'list', filter }
        });
    }

    // ===== Chat Operations =====

    /**
     * Send a chat message to a room
     * @param {string} roomId - Target room
     * @param {string} text - Message text
     * @param {string} messageType - Message type (message, action, system)
     */
    sendChat(roomId, text, messageType = 'message') {
        this.send({
            type: 'chat',
            payload: { roomId, text, messageType }
        });
    }

    /**
     * Send a direct message
     * @param {number} targetUserId - Target user ID
     * @param {string} text - Message text
     */
    sendDM(targetUserId, text) {
        this.send({
            type: 'dm',
            payload: { targetUserId, text }
        });
    }

    // ===== Presence Operations =====

    /**
     * Update presence status
     * @param {string} status - Status (online, away, busy, in_game)
     * @param {Object} activity - Current activity info
     */
    updateStatus(status, activity = null) {
        this.send({
            type: 'presence',
            payload: { action: 'update_status', status, activity }
        });
    }

    /**
     * Send typing indicator
     * @param {string} roomId - Room where user is typing
     */
    sendTyping(roomId) {
        this.send({
            type: 'presence',
            payload: { action: 'typing', roomId }
        });
    }

    // ===== Game Operations =====

    /**
     * Create a game session
     * @param {string} gameId - Game type ID
     * @param {string} sessionId - Unique session ID
     * @param {Object} options - Game options
     */
    createGameSession(gameId, sessionId, options = {}) {
        this.send({
            type: 'game',
            payload: {
                action: 'create_session',
                gameId,
                sessionId,
                maxPlayers: options.maxPlayers || 2,
                settings: options.settings || {}
            }
        });
    }

    /**
     * Join a game session
     * @param {string} gameId - Game type ID
     * @param {string} sessionId - Session to join
     */
    joinGameSession(gameId, sessionId) {
        this.send({
            type: 'game',
            payload: { action: 'join_session', gameId, sessionId }
        });
    }

    /**
     * Send a game action
     * @param {string} gameId - Game type ID
     * @param {string} sessionId - Session ID
     * @param {string} action - Game action (start, action, state, turn, end)
     * @param {Object} data - Action data
     */
    sendGameAction(gameId, sessionId, action, data = {}) {
        this.send({
            type: 'game',
            payload: { action, gameId, sessionId, data }
        });
    }

    /**
     * Leave a game session
     * @param {string} gameId - Game type ID
     * @param {string} sessionId - Session to leave
     */
    leaveGameSession(gameId, sessionId) {
        this.send({
            type: 'game',
            payload: { action: 'leave_session', gameId, sessionId }
        });
    }

    // ===== Event Bridge =====

    /**
     * Send an event to a channel (for EventBus bridge)
     * @param {string} channel - Target channel/room
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    sendEvent(channel, event, data = {}) {
        this.send({
            type: 'event',
            payload: { channel, event, data }
        });
    }

    /**
     * Send a state sync delta to a channel
     * @param {string} channel - Target channel/room
     * @param {Object} delta - State changes
     */
    sendStateSync(channel, delta) {
        this.send({
            type: 'state_sync',
            payload: { channel, delta }
        });
    }

    // ===== Getters =====

    /**
     * Get current connection state
     * @returns {string}
     */
    getState() {
        return this.state;
    }

    /**
     * Check if connected
     * @returns {boolean}
     */
    isConnected() {
        return this.state === ConnectionState.CONNECTED;
    }

    /**
     * Get online users
     * @returns {Map}
     */
    getOnlineUsers() {
        return new Map(this.onlineUsers);
    }

    /**
     * Get online user count
     * @returns {number}
     */
    getOnlineCount() {
        return this.onlineUsers.size;
    }

    /**
     * Get current latency in ms
     * @returns {number}
     */
    getLatency() {
        return this.latency;
    }

    /**
     * Get current user info
     * @returns {{ userId, userUuid, displayName }}
     */
    getUserInfo() {
        return {
            userId: this.userId,
            userUuid: this.userUuid,
            displayName: this.displayName
        };
    }

    // ===== Private Methods =====

    _getWebSocketUrl() {
        // Check config for WebSocket URL
        const configWsUrl = getConfig('multiplayer.websocketUrl', null);
        if (configWsUrl) return configWsUrl;

        // Prefer same-origin path (works well behind reverse proxies on HTTPS hosts)
        const wsPath = getConfig('multiplayer.websocketPath', '/ws');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const apiBasePath = getApiBasePath();

        // When an API base path is configured (e.g. /app), keep /ws at the origin root by default
        // unless the websocket path is explicitly absolute.
        const normalizedPath = wsPath.startsWith('/')
            ? wsPath
            : `${apiBasePath || ''}/${wsPath}`.replace(/\/+/g, '/');

        const useSameOrigin = getConfig('multiplayer.useSameOrigin', true);
        if (useSameOrigin) {
            return `${protocol}//${host}${normalizedPath}`;
        }

        // Legacy fallback: same hostname, explicit WebSocket sidecar port
        const hostname = window.location.hostname;
        const wsPort = getConfig('multiplayer.websocketPort', 8081);
        return `${protocol}//${hostname}:${wsPort}${normalizedPath}`;
    }

    _sendRaw(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    _handleMessage(message) {
        const { type, event } = message;

        // Handle system messages
        if (type === 'system') {
            this._handleSystemMessage(message);
            return;
        }

        // Handle presence messages (update local cache)
        if (type === 'presence') {
            this._handlePresenceMessage(message);
        }

        // Handle pong
        if (type === 'pong') {
            this.latency = Date.now() - this.lastPingTime;
            return;
        }

        // Dispatch to registered handlers
        const handlers = this.handlers.get(type);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(message);
                } catch (err) {
                    console.error(`[MultiplayerClient] Handler error for type '${type}':`, err);
                }
            }
        }

        // Also dispatch to event-specific handlers (type:event pattern)
        if (event) {
            const specificHandlers = this.handlers.get(`${type}:${event}`);
            if (specificHandlers) {
                for (const handler of specificHandlers) {
                    try {
                        handler(message);
                    } catch (err) {
                        console.error(`[MultiplayerClient] Handler error for '${type}:${event}':`, err);
                    }
                }
            }
        }

        // Bridge remote events into the local EventBus
        if (type === 'event' && message.channel && message.payload) {
            EventBus.emit(`mp:${message.event || 'event'}`, {
                ...message.payload,
                _remote: true,
                _senderId: message.senderId,
                _senderName: message.senderName,
                _channel: message.channel,
                _timestamp: message.timestamp
            });
        }
    }

    _handleSystemMessage(message) {
        switch (message.event) {
            case 'connected':
                this.userId = message.payload.userId;
                this.userUuid = message.payload.userUuid;
                this.displayName = message.payload.displayName;
                this.serverTimeOffset = Date.now() - message.payload.serverTime;
                console.log(`[MultiplayerClient] Authenticated as ${this.displayName} (${this.userId})`);

                EventBus.emit('mp:connected', {
                    userId: this.userId,
                    userUuid: this.userUuid,
                    displayName: this.displayName
                });
                break;

            case 'error':
                console.warn('[MultiplayerClient] Server error:', message.payload?.message);
                EventBus.emit('mp:error', message.payload);
                break;
        }
    }

    _handlePresenceMessage(message) {
        switch (message.event) {
            case 'online_list':
                this.onlineUsers.clear();
                for (const user of (message.payload?.users || [])) {
                    this.onlineUsers.set(user.userId, {
                        userUuid: user.userUuid,
                        displayName: user.displayName
                    });
                }
                EventBus.emit('mp:presence:online_list', {
                    users: [...this.onlineUsers.entries()].map(([id, info]) => ({ userId: id, ...info }))
                });
                break;

            case 'join':
                this.onlineUsers.set(message.payload.userId, {
                    userUuid: message.payload.userUuid,
                    displayName: message.payload.displayName
                });
                EventBus.emit('mp:presence:join', message.payload);
                break;

            case 'leave':
                this.onlineUsers.delete(message.payload.userId);
                EventBus.emit('mp:presence:leave', message.payload);
                break;

            case 'status_update':
                EventBus.emit('mp:presence:update', message.payload);
                break;

            case 'typing':
                EventBus.emit('mp:presence:typing', message.payload);
                break;
        }
    }

    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn('[MultiplayerClient] Max reconnect attempts reached');
            this.state = ConnectionState.DISCONNECTED;
            this._emitStateChange();
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        this.state = ConnectionState.RECONNECTING;
        this._emitStateChange();

        console.log(`[MultiplayerClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this._connect();
        }, delay);
    }

    _emitStateChange() {
        EventBus.emit('mp:state', {
            state: this.state,
            onlineCount: this.onlineUsers.size
        });
    }

    _startPing() {
        this._stopPing();
        this.pingInterval = setInterval(() => {
            if (this.state === ConnectionState.CONNECTED) {
                this.lastPingTime = Date.now();
                this.send({ type: 'ping', timestamp: this.lastPingTime });
            }
        }, 15000); // Ping every 15 seconds
    }

    _stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
}

// Singleton instance
const MultiplayerClient = new MultiplayerClientClass();

export { MultiplayerClient, ConnectionState };
export default MultiplayerClient;
