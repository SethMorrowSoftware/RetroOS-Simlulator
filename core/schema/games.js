/**
 * Games event schemas
 * Auto-split from core/EventSchema.js
 */

export const gamesEvents = {
    // ==========================================
    // GAME EVENTS - Generic
    // ==========================================
    'game:start': {
        namespace: 'game',
        action: 'start',
        description: 'Game started',
        payload: {
            appId: 'string',
            difficulty: 'string?',
            settings: 'object?'
        },
        example: {
            appId: 'minesweeper',
            difficulty: 'beginner',
            settings: { rows: 9, cols: 9, mines: 10 }
        }
    },

    'game:pause': {
        namespace: 'game',
        action: 'pause',
        description: 'Game paused',
        payload: {
            appId: 'string',
            time: 'number?',
            score: 'number?'
        },
        example: {
            appId: 'snake',
            time: 45,
            score: 120
        }
    },

    'game:resume': {
        namespace: 'game',
        action: 'resume',
        description: 'Game resumed',
        payload: {
            appId: 'string'
        },
        example: {
            appId: 'snake'
        }
    },

    'game:over': {
        namespace: 'game',
        action: 'over',
        description: 'Game ended',
        payload: {
            appId: 'string',
            won: 'boolean',
            score: 'number?',
            time: 'number?',
            stats: 'object?'
        },
        example: {
            appId: 'minesweeper',
            won: true,
            score: 100,
            time: 45
        }
    },

    'game:score': {
        namespace: 'game',
        action: 'score',
        description: 'Score changed',
        payload: {
            appId: 'string',
            score: 'number',
            delta: 'number?',
            reason: 'string?'
        },
        example: {
            appId: 'asteroids',
            score: 1500,
            delta: 100,
            reason: 'asteroid_destroyed'
        }
    },

    'game:highscore': {
        namespace: 'game',
        action: 'highscore',
        description: 'New high score achieved',
        payload: {
            appId: 'string',
            score: 'number',
            previousScore: 'number?'
        },
        example: {
            appId: 'snake',
            score: 500,
            previousScore: 350
        }
    },

    'game:level': {
        namespace: 'game',
        action: 'level',
        description: 'Level changed',
        payload: {
            appId: 'string',
            level: 'number',
            previousLevel: 'number?'
        },
        example: {
            appId: 'asteroids',
            level: 5,
            previousLevel: 4
        }
    },

    'game:lives': {
        namespace: 'game',
        action: 'lives',
        description: 'Lives changed',
        payload: {
            appId: 'string',
            lives: 'number',
            delta: 'number?'
        },
        example: {
            appId: 'asteroids',
            lives: 2,
            delta: -1
        }
    },

    'game:state': {
        namespace: 'game',
        action: 'state',
        description: 'Game state changed',
        payload: {
            appId: 'string',
            state: 'string',
            previousState: 'string?',
            data: 'object?'
        },
        example: {
            appId: 'skifree',
            state: 'playing',
            previousState: 'menu'
        }
    },

    // ==========================================
    // MINESWEEPER EVENTS
    // ==========================================
    'minesweeper:cell:reveal': {
        namespace: 'minesweeper',
        action: 'cell:reveal',
        description: 'Cell revealed',
        payload: {
            row: 'number',
            col: 'number',
            value: 'number',
            isMine: 'boolean'
        },
        example: { row: 3, col: 5, value: 2, isMine: false }
    },

    'minesweeper:cell:flag': {
        namespace: 'minesweeper',
        action: 'cell:flag',
        description: 'Cell flagged or unflagged',
        payload: {
            row: 'number',
            col: 'number',
            flagged: 'boolean',
            minesRemaining: 'number'
        },
        example: { row: 2, col: 4, flagged: true, minesRemaining: 8 }
    },

    'minesweeper:mine:hit': {
        namespace: 'minesweeper',
        action: 'mine:hit',
        description: 'Mine hit - game over',
        payload: {
            row: 'number',
            col: 'number',
            time: 'number'
        },
        example: { row: 5, col: 3, time: 32 }
    },

    'minesweeper:win': {
        namespace: 'minesweeper',
        action: 'win',
        description: 'Game won - all safe cells revealed',
        payload: {
            time: 'number',
            difficulty: 'string?',
            rows: 'number',
            cols: 'number',
            mines: 'number'
        },
        example: { time: 45, difficulty: 'beginner', rows: 9, cols: 9, mines: 10 }
    },

    'minesweeper:timer': {
        namespace: 'minesweeper',
        action: 'timer',
        description: 'Timer updated',
        payload: {
            time: 'number'
        },
        example: { time: 15 }
    },

    // ==========================================
    // ASTEROIDS EVENTS
    // ==========================================
    'asteroids:asteroid:destroy': {
        namespace: 'asteroids',
        action: 'asteroid:destroy',
        description: 'Asteroid destroyed',
        payload: {
            size: 'string',
            points: 'number',
            x: 'number',
            y: 'number',
            combo: 'number?'
        },
        example: { size: 'large', points: 20, x: 200, y: 150, combo: 3 }
    },

    'asteroids:ufo:spawn': {
        namespace: 'asteroids',
        action: 'ufo:spawn',
        description: 'UFO spawned',
        payload: {
            type: 'string?'
        },
        example: { type: 'small' }
    },

    'asteroids:ufo:destroy': {
        namespace: 'asteroids',
        action: 'ufo:destroy',
        description: 'UFO destroyed',
        payload: {
            points: 'number'
        },
        example: { points: 200 }
    },

    'asteroids:powerup:spawn': {
        namespace: 'asteroids',
        action: 'powerup:spawn',
        description: 'Power-up spawned',
        payload: {
            type: 'string',
            x: 'number',
            y: 'number'
        },
        example: { type: 'shield', x: 300, y: 200 }
    },

    'asteroids:powerup:collect': {
        namespace: 'asteroids',
        action: 'powerup:collect',
        description: 'Power-up collected',
        payload: {
            type: 'string',
            duration: 'number?'
        },
        example: { type: 'triple', duration: 10000 }
    },

    'asteroids:powerup:expire': {
        namespace: 'asteroids',
        action: 'powerup:expire',
        description: 'Power-up expired',
        payload: {
            type: 'string'
        },
        example: { type: 'shield' }
    },

    'asteroids:ship:explode': {
        namespace: 'asteroids',
        action: 'ship:explode',
        description: 'Player ship exploded',
        payload: {
            livesRemaining: 'number',
            x: 'number',
            y: 'number'
        },
        example: { livesRemaining: 2, x: 400, y: 300 }
    },

    'asteroids:combo': {
        namespace: 'asteroids',
        action: 'combo',
        description: 'Combo updated',
        payload: {
            combo: 'number',
            multiplier: 'number'
        },
        example: { combo: 5, multiplier: 2.5 }
    },

    // ==========================================
    // SNAKE EVENTS
    // ==========================================
    'snake:food:eat': {
        namespace: 'snake',
        action: 'food:eat',
        description: 'Food eaten',
        payload: {
            x: 'number',
            y: 'number',
            score: 'number',
            length: 'number'
        },
        example: { x: 10, y: 5, score: 10, length: 5 }
    },

    'snake:collision': {
        namespace: 'snake',
        action: 'collision',
        description: 'Snake collision detected',
        payload: {
            type: 'string',
            x: 'number',
            y: 'number'
        },
        example: { type: 'wall', x: 0, y: 10 }
    },

    'snake:direction': {
        namespace: 'snake',
        action: 'direction',
        description: 'Direction changed',
        payload: {
            direction: 'string',
            previousDirection: 'string?'
        },
        example: { direction: 'up', previousDirection: 'left' }
    },

    'snake:speed': {
        namespace: 'snake',
        action: 'speed',
        description: 'Speed increased',
        payload: {
            speed: 'number',
            previousSpeed: 'number?'
        },
        example: { speed: 150, previousSpeed: 200 }
    },

    // ==========================================
    // SOLITAIRE EVENTS
    // ==========================================
    'solitaire:card:move': {
        namespace: 'solitaire',
        action: 'card:move',
        description: 'Card moved',
        payload: {
            card: 'string',
            from: 'string',
            to: 'string',
            moves: 'number'
        },
        example: { card: 'AS', from: 'tableau:3', to: 'foundation:0', moves: 15 }
    },

    'solitaire:stock:draw': {
        namespace: 'solitaire',
        action: 'stock:draw',
        description: 'Card drawn from stock',
        payload: {
            cards: 'array',
            drawCount: 'number',
            stockRemaining: 'number'
        },
        example: { cards: ['KH', 'QH', '10H'], drawCount: 3, stockRemaining: 20 }
    },

    'solitaire:stock:recycle': {
        namespace: 'solitaire',
        action: 'stock:recycle',
        description: 'Waste pile recycled to stock',
        payload: {
            cardsRecycled: 'number'
        },
        example: { cardsRecycled: 24 }
    },

    'solitaire:foundation:add': {
        namespace: 'solitaire',
        action: 'foundation:add',
        description: 'Card added to foundation',
        payload: {
            card: 'string',
            foundation: 'number',
            count: 'number'
        },
        example: { card: '2S', foundation: 2, count: 2 }
    },

    'solitaire:win': {
        namespace: 'solitaire',
        action: 'win',
        description: 'Game won',
        payload: {
            moves: 'number',
            time: 'number',
            gameType: 'string?'
        },
        example: { moves: 95, time: 180, gameType: 'klondike3' }
    },

    'solitaire:undo': {
        namespace: 'solitaire',
        action: 'undo',
        description: 'Previous move undone',
        payload: {
            moveType: 'string',
            moves: 'number',
            score: 'number'
        },
        example: { moveType: 'move', moves: 22, score: 110 }
    },

    'solitaire:game:type': {
        namespace: 'solitaire',
        action: 'game:type',
        description: 'Solitaire game variant selected',
        payload: {
            gameType: 'string',
            drawCount: 'number',
            scoring: 'string'
        },
        example: { gameType: 'vegas3', drawCount: 3, scoring: 'vegas' }
    },

    'solitaire:invalid:move': {
        namespace: 'solitaire',
        action: 'invalid:move',
        description: 'Invalid move attempted',
        payload: {
            card: 'string',
            from: 'string',
            to: 'string',
            reason: 'string?'
        },
        example: { card: 'QH', from: 'waste', to: 'tableau:5', reason: 'wrong_color' }
    },

    // ==========================================
    // FREECELL EVENTS
    // ==========================================
    'freecell:card:move': {
        namespace: 'freecell',
        action: 'card:move',
        description: 'Card moved',
        payload: {
            card: 'string',
            from: 'string',
            to: 'string',
            moves: 'number'
        },
        example: { card: '7D', from: 'column:3', to: 'cell:1', moves: 12 }
    },

    'freecell:cell:occupy': {
        namespace: 'freecell',
        action: 'cell:occupy',
        description: 'Free cell occupied',
        payload: {
            card: 'string',
            cell: 'number',
            freeCellsRemaining: 'number'
        },
        example: { card: 'JC', cell: 0, freeCellsRemaining: 3 }
    },

    'freecell:foundation:add': {
        namespace: 'freecell',
        action: 'foundation:add',
        description: 'Card added to foundation',
        payload: {
            card: 'string',
            foundation: 'number',
            count: 'number'
        },
        example: { card: 'AS', foundation: 0, count: 1 }
    },

    'freecell:undo': {
        namespace: 'freecell',
        action: 'undo',
        description: 'Move undone',
        payload: {
            card: 'string',
            moves: 'number'
        },
        example: { card: '5H', moves: 11 }
    },

    'freecell:win': {
        namespace: 'freecell',
        action: 'win',
        description: 'Game won',
        payload: {
            moves: 'number',
            time: 'number'
        },
        example: { moves: 82, time: 240 }
    },

    // ==========================================
    // SKIFREE EVENTS
    // ==========================================
    'skifree:distance': {
        namespace: 'skifree',
        action: 'distance',
        description: 'Distance updated',
        payload: {
            distance: 'number',
            delta: 'number?'
        },
        example: { distance: 1500, delta: 10 }
    },

    'skifree:obstacle:hit': {
        namespace: 'skifree',
        action: 'obstacle:hit',
        description: 'Obstacle collision',
        payload: {
            type: 'string',
            x: 'number',
            y: 'number'
        },
        example: { type: 'tree', x: 200, y: 500 }
    },

    'skifree:jump': {
        namespace: 'skifree',
        action: 'jump',
        description: 'Player jumped',
        payload: {
            x: 'number',
            y: 'number',
            points: 'number?'
        },
        example: { x: 300, y: 600, points: 50 }
    },

    'skifree:yeti:spawn': {
        namespace: 'skifree',
        action: 'yeti:spawn',
        description: 'Yeti spawned',
        payload: {
            distance: 'number'
        },
        example: { distance: 2000 }
    },

    'skifree:yeti:caught': {
        namespace: 'skifree',
        action: 'yeti:caught',
        description: 'Player caught by yeti',
        payload: {
            distance: 'number',
            score: 'number'
        },
        example: { distance: 2100, score: 420 }
    },
};
