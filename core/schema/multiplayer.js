/**
 * Multiplayer event schemas
 * Covers WebSocket connection state, presence, and game session events
 * emitted by MultiplayerClient.js and GameSession.js
 */

export const multiplayerEvents = {
    // ==========================================
    // CONNECTION STATE EVENTS
    // ==========================================
    'mp:state': {
        namespace: 'mp',
        action: 'state',
        description: 'Multiplayer connection state changed',
        payload: {
            state: 'string',
            onlineCount: 'number'
        },
        example: {
            state: 'connected',
            onlineCount: 5
        }
    },

    'mp:connected': {
        namespace: 'mp',
        action: 'connected',
        description: 'Successfully connected and authenticated to WebSocket server',
        payload: {
            userId: 'number',
            userUuid: 'string',
            displayName: 'string'
        },
        example: {
            userId: 42,
            userUuid: 'abc-123',
            displayName: 'Player1'
        }
    },

    'mp:error': {
        namespace: 'mp',
        action: 'error',
        description: 'WebSocket server error received',
        payload: {
            message: 'string?',
            code: 'string?'
        },
        example: {
            message: 'Rate limit exceeded',
            code: 'RATE_LIMITED'
        }
    },

    // ==========================================
    // PRESENCE EVENTS
    // ==========================================
    'mp:presence:online_list': {
        namespace: 'mp',
        action: 'presence:online_list',
        description: 'Full list of currently online users received',
        payload: {
            users: 'array'
        },
        example: {
            users: [{ userId: 1, userUuid: 'abc', displayName: 'Alice' }]
        }
    },

    'mp:presence:join': {
        namespace: 'mp',
        action: 'presence:join',
        description: 'A user came online',
        payload: {
            userId: 'number',
            userUuid: 'string',
            displayName: 'string',
            timestamp: 'number?'
        },
        example: {
            userId: 42,
            userUuid: 'abc-123',
            displayName: 'Player1',
            timestamp: 1710000000000
        }
    },

    'mp:presence:leave': {
        namespace: 'mp',
        action: 'presence:leave',
        description: 'A user went offline',
        payload: {
            userId: 'number',
            userUuid: 'string',
            displayName: 'string',
            timestamp: 'number?'
        },
        example: {
            userId: 42,
            userUuid: 'abc-123',
            displayName: 'Player1',
            timestamp: 1710000000000
        }
    },

    'mp:presence:update': {
        namespace: 'mp',
        action: 'presence:update',
        description: 'A user updated their presence status',
        payload: {
            userId: 'number?',
            status: 'string?',
            activity: 'object?'
        },
        example: {
            userId: 42,
            status: 'away',
            activity: { app: 'minesweeper' }
        }
    },

    'mp:presence:typing': {
        namespace: 'mp',
        action: 'presence:typing',
        description: 'A user is typing in a room',
        payload: {
            userId: 'number?',
            roomId: 'string?',
            displayName: 'string?'
        },
        example: {
            userId: 42,
            roomId: 'lobby',
            displayName: 'Player1'
        }
    },

    'mp:presence:changed': {
        namespace: 'mp',
        action: 'presence:changed',
        description: 'General presence change notification',
        payload: {
            userId: 'number?',
            status: 'string?',
            displayName: 'string?'
        },
        example: {
            userId: 42,
            status: 'online',
            displayName: 'Player1'
        }
    },

    'mp:typing:update': {
        namespace: 'mp',
        action: 'typing:update',
        description: 'Typing indicator state update',
        payload: {
            userId: 'number?',
            roomId: 'string?',
            isTyping: 'boolean?'
        },
        example: {
            userId: 42,
            roomId: 'lobby',
            isTyping: true
        }
    },

    // ==========================================
    // GAME SESSION EVENTS
    // ==========================================
    'mp:game:created': {
        namespace: 'mp',
        action: 'game:created',
        description: 'A multiplayer game session was created',
        payload: {
            sessionId: 'string',
            gameId: 'string',
            hostId: 'number',
            roomId: 'string'
        },
        example: {
            sessionId: 'sess-abc123',
            gameId: 'minesweeper',
            hostId: 42,
            roomId: 'game:minesweeper:sess-abc123'
        }
    },

    'mp:game:started': {
        namespace: 'mp',
        action: 'game:started',
        description: 'A multiplayer game session has started playing',
        payload: {
            sessionId: 'string',
            gameId: 'string',
            initialState: 'object?',
            turnOrder: 'array?',
            currentTurn: 'number?'
        },
        example: {
            sessionId: 'sess-abc123',
            gameId: 'minesweeper',
            initialState: {},
            turnOrder: [1, 2],
            currentTurn: 1
        }
    },

    'mp:game:action': {
        namespace: 'mp',
        action: 'game:action',
        description: 'A player performed a game action',
        payload: {
            sessionId: 'string',
            userId: 'number?',
            actionType: 'string?'
        },
        example: {
            sessionId: 'sess-abc123',
            userId: 42,
            actionType: 'reveal'
        }
    },

    'mp:game:turn': {
        namespace: 'mp',
        action: 'game:turn',
        description: 'Turn advanced to next player',
        payload: {
            sessionId: 'string',
            previousPlayer: 'number?',
            nextPlayer: 'number?',
            turnData: 'object?'
        },
        example: {
            sessionId: 'sess-abc123',
            previousPlayer: 1,
            nextPlayer: 2,
            turnData: {}
        }
    },

    'mp:game:ended': {
        namespace: 'mp',
        action: 'game:ended',
        description: 'A multiplayer game session has ended',
        payload: {
            sessionId: 'string',
            gameId: 'string',
            results: 'object?'
        },
        example: {
            sessionId: 'sess-abc123',
            gameId: 'minesweeper',
            results: { winner: 42 }
        }
    },

    'mp:game:player_joined': {
        namespace: 'mp',
        action: 'game:player_joined',
        description: 'A player joined the game session',
        payload: {
            sessionId: 'string',
            userId: 'number',
            displayName: 'string'
        },
        example: {
            sessionId: 'sess-abc123',
            userId: 43,
            displayName: 'Player2'
        }
    },

    'mp:game:player_left': {
        namespace: 'mp',
        action: 'game:player_left',
        description: 'A player left the game session',
        payload: {
            sessionId: 'string',
            userId: 'number',
            displayName: 'string'
        },
        example: {
            sessionId: 'sess-abc123',
            userId: 43,
            displayName: 'Player2'
        }
    },
};
