/**
 * GameSession - Multiplayer game session lifecycle management
 *
 * Provides a mixin/base that game apps can use to add multiplayer support.
 * Handles session creation, joining, state sync, and turn management.
 *
 * Usage in a game app:
 *   import { GameSession } from '../core/GameSession.js';
 *
 *   // In your game app:
 *   this.session = new GameSession(this, 'minesweeper');
 *   await this.session.create({ maxPlayers: 2, settings: { mode: 'coop' } });
 *   // or
 *   await this.session.join(sessionId);
 */

import EventBus from './EventBus.js';
import MultiplayerClient from './MultiplayerClient.js';

class GameSession {
    /**
     * @param {AppBase} app - The game app instance
     * @param {string} gameId - Game type identifier (e.g., 'minesweeper')
     */
    constructor(app, gameId) {
        this.app = app;
        this.gameId = gameId;
        this.sessionId = null;
        this.roomId = null;

        // Players
        this.players = new Map(); // userId -> { displayName, role, score, connected }
        this.hostId = null;
        this.localUserId = null;

        // State
        this.state = 'idle'; // idle | lobby | playing | paused | finished
        this.turnOrder = [];
        this.currentTurn = null;
        this.gameState = {}; // Game-specific state

        // Conflict-detection metadata (replaces blind LWW). The original
        // `Object.assign(this.gameState, data.delta)` path stays the default
        // resolution, but each delta now carries a sequence number and base
        // version. When an incoming delta was authored on top of a version
        // we've already moved past, we emit `mp:state:conflict` so apps can
        // react (request resync, surface UI, etc.) instead of silently
        // clobbering each other. `start()` resets these to 0.
        this._stateVersion = 0;         // Highest sequence applied locally.
        this._stateBaseVersion = 0;     // Version this peer believes was the latest before sendState().
        this._lastStateWriter = null;   // userId of the most recent writer.

        // Handlers
        this._handlers = [];
        this._eventUnsubscribers = [];
    }

    /**
     * Create a new game session
     * @param {Object} options - Session options
     * @param {number} options.maxPlayers - Max players (default: 2)
     * @param {Object} options.settings - Game-specific settings
     * @returns {string} Session ID
     */
    create(options = {}) {
        if (!MultiplayerClient.isConnected()) {
            console.warn('[GameSession] Cannot create session: not connected');
            return null;
        }

        this.sessionId = this._generateId();
        this.roomId = `game:${this.gameId}:${this.sessionId}`;
        this.state = 'lobby';

        const userInfo = MultiplayerClient.getUserInfo();
        this.localUserId = userInfo.userId;
        this.hostId = userInfo.userId;

        // Add self as host
        this.players.set(userInfo.userId, {
            displayName: userInfo.displayName,
            role: 'host',
            score: 0,
            connected: true
        });

        // Create session on server
        MultiplayerClient.createGameSession(this.gameId, this.sessionId, {
            maxPlayers: options.maxPlayers || 2,
            settings: options.settings || {}
        });

        // Listen for game events
        this._setupListeners();

        // Emit local event
        EventBus.emit('mp:game:created', {
            sessionId: this.sessionId,
            gameId: this.gameId,
            hostId: this.hostId,
            roomId: this.roomId
        });

        return this.sessionId;
    }

    /**
     * Join an existing game session
     * @param {string} sessionId - Session to join
     */
    join(sessionId) {
        if (!MultiplayerClient.isConnected()) {
            console.warn('[GameSession] Cannot join session: not connected');
            return;
        }

        this.sessionId = sessionId;
        this.roomId = `game:${this.gameId}:${this.sessionId}`;
        this.state = 'lobby';

        const userInfo = MultiplayerClient.getUserInfo();
        this.localUserId = userInfo.userId;

        // Add self as player
        this.players.set(userInfo.userId, {
            displayName: userInfo.displayName,
            role: 'player',
            score: 0,
            connected: true
        });

        // Join on server
        MultiplayerClient.joinGameSession(this.gameId, this.sessionId);

        // Listen for game events
        this._setupListeners();
    }

    /**
     * Start the game (host only)
     * @param {Object} initialState - Initial game state to broadcast
     */
    start(initialState = {}) {
        if (!this.isHost()) {
            console.warn('[GameSession] Only host can start the game');
            return;
        }

        this.state = 'playing';
        this.gameState = initialState;
        this._stateVersion = 0;
        this._stateBaseVersion = 0;
        this._lastStateWriter = this.localUserId;

        // Set turn order (all players)
        this.turnOrder = [...this.players.keys()];
        this.currentTurn = this.turnOrder[0];

        MultiplayerClient.sendGameAction(this.gameId, this.sessionId, 'start', {
            initialState,
            turnOrder: this.turnOrder,
            currentTurn: this.currentTurn,
            __seq: 0
        });

        EventBus.emit('mp:game:started', {
            sessionId: this.sessionId,
            gameId: this.gameId,
            initialState,
            turnOrder: this.turnOrder,
            currentTurn: this.currentTurn
        });
    }

    /**
     * Send a game action to all players
     * @param {string} actionType - Action type (e.g., 'reveal', 'place_piece')
     * @param {Object} actionData - Action-specific data
     */
    sendAction(actionType, actionData = {}) {
        if (this.state !== 'playing') return;

        MultiplayerClient.sendGameAction(this.gameId, this.sessionId, 'action', {
            actionType,
            ...actionData
        });
    }

    /**
     * Send a state update to all players. Each delta is tagged with
     *   __seq:  the new version this delta produces.
     *   __base: the version the writer thinks is the latest before this delta.
     *   __writer: the local userId.
     * Peers compare `__base` to their own `_stateVersion` and emit
     * `mp:state:conflict` if the base is stale.
     *
     * @param {Object} delta - State changes
     */
    sendState(delta) {
        if (!this.sessionId) return;

        this._stateBaseVersion = this._stateVersion;
        this._stateVersion = this._stateVersion + 1;
        this._lastStateWriter = this.localUserId;

        // Optimistically apply locally so subsequent local sends see the new state.
        if (delta && typeof delta === 'object') {
            Object.assign(this.gameState, delta);
        }

        MultiplayerClient.sendGameAction(this.gameId, this.sessionId, 'state', {
            delta,
            __seq: this._stateVersion,
            __base: this._stateBaseVersion,
            __writer: this.localUserId
        });
    }

    /**
     * End the current turn and advance to next player
     * @param {Object} turnData - Data about the turn that just ended
     */
    endTurn(turnData = {}) {
        if (this.state !== 'playing') return;
        if (this.currentTurn !== this.localUserId) {
            console.warn('[GameSession] Cannot end turn: not your turn');
            return;
        }

        // Advance turn
        const currentIndex = this.turnOrder.indexOf(this.currentTurn);
        this.currentTurn = this.turnOrder[(currentIndex + 1) % this.turnOrder.length];

        MultiplayerClient.sendGameAction(this.gameId, this.sessionId, 'turn', {
            previousPlayer: this.localUserId,
            nextPlayer: this.currentTurn,
            turnData
        });

        EventBus.emit('mp:game:turn', {
            sessionId: this.sessionId,
            previousPlayer: this.localUserId,
            nextPlayer: this.currentTurn,
            turnData
        });
    }

    /**
     * End the game
     * @param {Object} results - Game results (scores, winner, etc.)
     */
    end(results = {}) {
        if (!this.isHost()) {
            console.warn('[GameSession] Only host can end the game');
            return;
        }
        this.state = 'finished';

        MultiplayerClient.sendGameAction(this.gameId, this.sessionId, 'end', {
            results,
            finalScores: Object.fromEntries(
                [...this.players.entries()].map(([id, p]) => [id, p.score])
            )
        });

        EventBus.emit('mp:game:ended', {
            sessionId: this.sessionId,
            gameId: this.gameId,
            results
        });
    }

    /**
     * Leave the session
     */
    leave() {
        if (this.sessionId) {
            MultiplayerClient.leaveGameSession(this.gameId, this.sessionId);
        }
        this._cleanup();
    }

    /**
     * Register a handler for game events
     * @param {string} eventType - Event type (e.g., 'action', 'state', 'turn')
     * @param {Function} handler - Handler function
     */
    onGameEvent(eventType, handler) {
        this._handlers.push({ eventType, handler });
    }

    // ===== Getters =====

    isHost() {
        return this.localUserId === this.hostId;
    }

    isMyTurn() {
        return this.currentTurn === this.localUserId;
    }

    getPlayers() {
        return [...this.players.entries()].map(([id, info]) => ({
            userId: id,
            ...info,
            isLocal: id === this.localUserId,
            isHost: id === this.hostId,
            isCurrentTurn: id === this.currentTurn
        }));
    }

    getPlayerCount() {
        return this.players.size;
    }

    isActive() {
        return this.state === 'playing' || this.state === 'lobby';
    }

    // ===== Private Methods =====

    _setupListeners() {
        // Listen for game messages from MultiplayerClient
        const unsubGame = MultiplayerClient.on('game', (message) => {
            if (!message.payload) return;
            const { sessionId, userId, displayName, data } = message.payload;

            // Only process events for this session
            if (message.payload.sessionId && message.payload.sessionId !== this.sessionId) return;

            switch (message.event) {
                case 'player_joined':
                    this.players.set(userId, {
                        displayName,
                        role: 'player',
                        score: 0,
                        connected: true
                    });
                    EventBus.emit('mp:game:player_joined', {
                        sessionId: this.sessionId,
                        userId,
                        displayName
                    });
                    this._dispatchHandler('player_joined', message.payload);
                    break;

                case 'player_left':
                    this.players.delete(userId);
                    EventBus.emit('mp:game:player_left', {
                        sessionId: this.sessionId,
                        userId,
                        displayName
                    });
                    this._dispatchHandler('player_left', message.payload);
                    break;

                case 'start':
                    this.state = 'playing';
                    if (data?.initialState) this.gameState = data.initialState;
                    if (data?.turnOrder) this.turnOrder = data.turnOrder;
                    if (data?.currentTurn) this.currentTurn = data.currentTurn;
                    this._stateVersion = Number.isFinite(data?.__seq) ? data.__seq : 0;
                    this._stateBaseVersion = this._stateVersion;
                    this._lastStateWriter = null;
                    EventBus.emit('mp:game:started', {
                        sessionId: this.sessionId,
                        gameId: this.gameId,
                        ...data
                    });
                    this._dispatchHandler('start', data);
                    break;

                case 'action':
                    this._dispatchHandler('action', data);
                    EventBus.emit('mp:game:action', {
                        sessionId: this.sessionId,
                        userId,
                        ...data
                    });
                    break;

                case 'state':
                    if (data?.delta) {
                        const remoteSeq = Number.isFinite(data.__seq) ? data.__seq : null;
                        const remoteBase = Number.isFinite(data.__base) ? data.__base : null;
                        const remoteWriter = data.__writer ?? userId ?? null;

                        // Same writer can never conflict with themselves.
                        const ownEcho = remoteWriter !== null && remoteWriter === this.localUserId;

                        // Conflict: writer built on a base we've already moved past.
                        const conflict =
                            !ownEcho &&
                            remoteBase !== null &&
                            remoteBase < this._stateVersion;

                        if (conflict) {
                            EventBus.emit('mp:state:conflict', {
                                sessionId: this.sessionId,
                                gameId: this.gameId,
                                localVersion: this._stateVersion,
                                remoteVersion: remoteSeq ?? 0,
                                remoteWriter: remoteWriter == null ? null : String(remoteWriter),
                                resolution: 'merged' // We still apply (LWW fallback) — apps may resync.
                            });
                        }

                        Object.assign(this.gameState, data.delta);
                        if (remoteSeq !== null && remoteSeq > this._stateVersion) {
                            this._stateVersion = remoteSeq;
                        }
                        if (remoteWriter !== null) {
                            this._lastStateWriter = remoteWriter;
                        }
                    }
                    this._dispatchHandler('state', data);
                    break;

                case 'turn':
                    if (data?.nextPlayer) this.currentTurn = data.nextPlayer;
                    this._dispatchHandler('turn', data);
                    EventBus.emit('mp:game:turn', {
                        sessionId: this.sessionId,
                        ...data
                    });
                    break;

                case 'end':
                    this.state = 'finished';
                    this._dispatchHandler('end', data);
                    EventBus.emit('mp:game:ended', {
                        sessionId: this.sessionId,
                        gameId: this.gameId,
                        ...data
                    });
                    break;
            }
        });

        this._eventUnsubscribers.push(unsubGame);
    }

    _dispatchHandler(eventType, data) {
        for (const { eventType: type, handler } of this._handlers) {
            if (type === eventType || type === '*') {
                try {
                    handler(data, eventType);
                } catch (err) {
                    console.error(`[GameSession] Handler error for '${eventType}':`, err);
                }
            }
        }
    }

    _cleanup() {
        for (const unsub of this._eventUnsubscribers) {
            unsub();
        }
        this._eventUnsubscribers = [];
        this._handlers = [];
        this.players.clear();
        this.sessionId = null;
        this.roomId = null;
        this.state = 'idle';
        this.turnOrder = [];
        this.currentTurn = null;
        this.gameState = {};
        this._stateVersion = 0;
        this._stateBaseVersion = 0;
        this._lastStateWriter = null;
    }

    _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    }
}

export { GameSession };
export default GameSession;
