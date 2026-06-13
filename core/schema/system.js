/**
 * System event schemas
 * Auto-split from core/EventSchema.js
 */

export const systemEvents = {
    // ==========================================
    // SYSTEM EVENTS
    // ==========================================
    'system:boot': {
        namespace: 'system',
        action: 'boot',
        description: 'System boot sequence started',
        payload: {
            timestamp: 'number',
            phase: 'string?'
        },
        example: {
            timestamp: 1234567890,
            phase: 'initialization'
        }
    },

    'system:ready': {
        namespace: 'system',
        action: 'ready',
        description: 'System fully initialized and ready (formerly boot:complete)',
        payload: {
            timestamp: 'number',
            bootTime: 'number?'
        },
        example: {
            timestamp: 1234567890,
            bootTime: 2500
        }
    },

    'system:shutdown': {
        namespace: 'system',
        action: 'shutdown',
        description: 'System shutdown initiated',
        payload: {
            reason: 'string?'
        },
        example: {
            reason: 'user_requested'
        }
    },

    'system:screensaver:start': {
        namespace: 'system',
        action: 'screensaver:start',
        description: 'Screensaver activated',
        payload: {
            mode: 'string?'
        },
        example: {
            mode: 'flying-toasters'
        }
    },

    'system:screensaver:end': {
        namespace: 'system',
        action: 'screensaver:end',
        description: 'Screensaver deactivated',
        payload: {},
        example: {}
    },

    // ==========================================
    // USER SESSION LIFECYCLE
    // ==========================================
    'user:login': {
        namespace: 'user',
        action: 'login',
        description: 'A user has logged in (after token is set and storage is rescoped)',
        payload: {
            username: 'string',
            mode: 'string?' // 'login' | 'signup' | 'guest'
        },
        example: { username: 'alice', mode: 'login' }
    },

    'user:logout': {
        namespace: 'user',
        action: 'logout',
        description: 'User session ended; realtime channels and in-memory state already torn down',
        payload: {
            reason: 'string?' // 'user_requested' | 'auth_expired' | etc.
        },
        example: { reason: 'user_requested' }
    },

    'user:switch': {
        namespace: 'user',
        action: 'switch',
        description: 'Active user changed; storage rescoped to the new user',
        payload: {
            previous: 'string?',
            next: 'string?'
        },
        example: { previous: 'alice', next: 'bob' }
    },

    'auth:expired': {
        namespace: 'auth',
        action: 'expired',
        description: 'Server returned 401; session token has been cleared and the user must reauthenticate',
        payload: {
            endpoint: 'string?'
        },
        example: { endpoint: '/api/v2/user/state' }
    },

    'reauth:completed': {
        namespace: 'reauth',
        action: 'completed',
        description: 'User successfully reauthenticated after an auth:expired prompt (fired by ReauthGate)',
        payload: {
            username: 'string',
            userUuid: 'string?',
            reason: 'string?'
        },
        example: { username: 'alice', reason: 'session_expired' }
    },

    'session:relogin': {
        namespace: 'session',
        action: 'relogin',
        description: 'A mid-session login completed (logoff → login screen). The boot module re-wires storage scope, realtime, multiplayer, and presence in response.',
        payload: {
            username: 'string',
            userUuid: 'string?',
            mode: 'string?'
        },
        example: { username: 'alice', mode: 'login' }
    },

    // ==========================================
    // SCREENSAVER EVENTS (Settings & Control)
    // ==========================================
    'screensaver:start': {
        namespace: 'screensaver',
        action: 'start',
        description: 'Request to start screensaver (from settings)',
        payload: {},
        example: {}
    },

    'screensaver:update-delay': {
        namespace: 'screensaver',
        action: 'update-delay',
        description: 'Screensaver delay/timeout changed',
        payload: {
            delay: 'number'
        },
        example: {
            delay: 300000
        }
    },

    'screensaver:update-type': {
        namespace: 'screensaver',
        action: 'update-type',
        description: 'Screensaver type/mode changed',
        payload: {
            type: 'string'
        },
        example: {
            type: 'flying-toasters'
        }
    },

    // ==========================================
    // SYSTEM LIFECYCLE EVENTS (Extended)
    // ==========================================
    'system:boot:phase': {
        namespace: 'system',
        action: 'boot:phase',
        description: 'System boot phase changed',
        payload: {
            phase: 'string',
            phaseNumber: 'number',
            totalPhases: 'number',
            phaseName: 'string?'
        },
        example: {
            phase: 'core-systems',
            phaseNumber: 1,
            totalPhases: 5,
            phaseName: 'Initializing Core Systems'
        }
    },

    'system:idle': {
        namespace: 'system',
        action: 'idle',
        description: 'System entered idle state (user inactive)',
        payload: {
            idleTime: 'number',
            threshold: 'number'
        },
        example: {
            idleTime: 60000,
            threshold: 60000
        }
    },

    'system:active': {
        namespace: 'system',
        action: 'active',
        description: 'System returned to active state (user activity detected)',
        payload: {
            idleDuration: 'number'
        },
        example: {
            idleDuration: 120000
        }
    },

    'system:sleep': {
        namespace: 'system',
        action: 'sleep',
        description: 'System entering sleep/screensaver mode',
        payload: {
            reason: 'string?'
        },
        example: {
            reason: 'idle_timeout'
        }
    },

    'system:wake': {
        namespace: 'system',
        action: 'wake',
        description: 'System waking from sleep/screensaver',
        payload: {
            sleepDuration: 'number?'
        },
        example: {
            sleepDuration: 300000
        }
    },

    'system:error': {
        namespace: 'system',
        action: 'error',
        description: 'System-level error occurred',
        payload: {
            error: 'string',
            code: 'string?',
            source: 'string?',
            fatal: 'boolean?',
            stack: 'string?'
        },
        example: {
            error: 'Failed to initialize subsystem',
            code: 'INIT_FAILED',
            source: 'WindowManager',
            fatal: false
        }
    },

    'system:warning': {
        namespace: 'system',
        action: 'warning',
        description: 'System warning issued',
        payload: {
            message: 'string',
            code: 'string?',
            source: 'string?'
        },
        example: {
            message: 'Storage quota approaching limit',
            code: 'STORAGE_WARNING',
            source: 'StorageManager'
        }
    },

    'system:memory:warning': {
        namespace: 'system',
        action: 'memory:warning',
        description: 'Memory usage exceeded threshold',
        payload: {
            usage: 'number',
            limit: 'number',
            percentage: 'number'
        },
        example: {
            usage: 450000000,
            limit: 512000000,
            percentage: 88
        }
    },

    'system:storage:warning': {
        namespace: 'system',
        action: 'storage:warning',
        description: 'Storage space running low',
        payload: {
            used: 'number',
            total: 'number',
            percentage: 'number'
        },
        example: {
            used: 4500000,
            total: 5000000,
            percentage: 90
        }
    },

    'system:storage:full': {
        namespace: 'system',
        action: 'storage:full',
        description: 'Storage is full',
        payload: {
            used: 'number',
            total: 'number'
        },
        example: {
            used: 5000000,
            total: 5000000
        }
    },

    'system:focus': {
        namespace: 'system',
        action: 'focus',
        description: 'Browser/tab gained focus',
        payload: {},
        example: {}
    },

    'system:blur': {
        namespace: 'system',
        action: 'blur',
        description: 'Browser/tab lost focus',
        payload: {},
        example: {}
    },

    'system:visibility:change': {
        namespace: 'system',
        action: 'visibility:change',
        description: 'Page visibility changed',
        payload: {
            visible: 'boolean',
            state: 'string'
        },
        example: {
            visible: true,
            state: 'visible'
        }
    },

    'system:online': {
        namespace: 'system',
        action: 'online',
        description: 'Network connection restored',
        payload: {},
        example: {}
    },

    'system:offline': {
        namespace: 'system',
        action: 'offline',
        description: 'Network connection lost',
        payload: {},
        example: {}
    },

    'system:resize': {
        namespace: 'system',
        action: 'resize',
        description: 'Browser/viewport resized',
        payload: {
            width: 'number',
            height: 'number',
            previousWidth: 'number?',
            previousHeight: 'number?'
        },
        example: {
            width: 1920,
            height: 1080
        }
    },

    'system:fullscreen:enter': {
        namespace: 'system',
        action: 'fullscreen:enter',
        description: 'Entered fullscreen mode',
        payload: {
            element: 'string?'
        },
        example: {
            element: 'desktop'
        }
    },

    'system:fullscreen:exit': {
        namespace: 'system',
        action: 'fullscreen:exit',
        description: 'Exited fullscreen mode',
        payload: {},
        example: {}
    },

    // ==========================================
    // SYSTEM REALTIME / SSE EVENTS
    // ==========================================
    'system:announcement': {
        namespace: 'system',
        action: 'announcement',
        description: 'System announcement received from server (via SSE)',
        payload: {
            title: 'string?',
            message: 'string?',
            type: 'string?'
        },
        example: {
            title: 'System Announcement',
            message: 'Scheduled maintenance in 30 minutes.',
            type: 'info'
        }
    },

    'system:config-updated': {
        namespace: 'system',
        action: 'config-updated',
        description: 'System configuration updated remotely (via SSE)',
        payload: {
            key: 'string?',
            value: 'any?'
        },
        example: {
            key: 'motd',
            value: 'Welcome to IlluminatOS v2'
        }
    },

    // ==========================================
    // SYSTEM RESOURCE MONITORING
    // ==========================================
    'system:resource:report': {
        namespace: 'system',
        action: 'resource:report',
        description: 'Resource usage report for all open windows',
        payload: {
            windowCount: 'number',
            totalDomNodes: 'number',
            windows: 'array',
            timestamp: 'number'
        },
        example: {
            windowCount: 3,
            totalDomNodes: 1500,
            windows: [],
            timestamp: 1710000000000
        }
    },

    'system:resource:warning': {
        namespace: 'system',
        action: 'resource:warning',
        description: 'A window is consuming excessive DOM resources',
        payload: {
            windowId: 'string',
            title: 'string',
            domNodes: 'number',
            threshold: 'number',
            message: 'string'
        },
        example: {
            windowId: 'notepad-1',
            title: 'Notepad',
            domNodes: 6000,
            threshold: 5000,
            message: 'Window "Notepad" has 6000 DOM nodes (threshold: 5000)'
        }
    },

    // ==========================================
    // CONFIG UPDATE EVENT
    // ==========================================
    'config:update': {
        namespace: 'config',
        action: 'update',
        description: 'Configuration section was updated locally',
        payload: {
            section: 'string',
            changes: 'object?'
        },
        example: {
            section: 'display',
            changes: { wallpaper: 'clouds.jpg' }
        }
    },

    // ==========================================
    // VISUAL EFFECT EVENT
    // ==========================================
    'effect:trigger': {
        namespace: 'effect',
        action: 'trigger',
        description: 'A visual effect was triggered (shake, flash, CRT, etc.)',
        payload: {
            effect: 'string'
        },
        example: {
            effect: 'shake'
        }
    },
};
