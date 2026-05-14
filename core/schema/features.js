/**
 * Features event schemas
 * Auto-split from core/EventSchema.js
 */

export const featuresEvents = {
    // ==========================================
    // FEATURE EVENTS
    // ==========================================
    'feature:enable': {
        namespace: 'feature',
        action: 'enable',
        description: 'Feature enabled',
        payload: {
            featureId: 'string'
        },
        example: {
            featureId: 'clippy'
        }
    },

    'feature:disable': {
        namespace: 'feature',
        action: 'disable',
        description: 'Feature disabled',
        payload: {
            featureId: 'string'
        },
        example: {
            featureId: 'clippy'
        }
    },

    'feature:disable:error': {
        namespace: 'feature',
        action: 'disable:error',
        description: 'Cascading disable of a dependent feature failed (isolated; other dependents continue)',
        payload: {
            featureId: 'string',
            error: 'string',
            cause: 'string?'
        },
        example: {
            featureId: 'achievements',
            error: 'cleanup threw',
            cause: 'soundsystem'
        }
    },

    'feature:pet:toggle': {
        namespace: 'feature',
        action: 'pet:toggle',
        description: 'Desktop pet toggled',
        payload: {},
        example: {}
    },

    'feature:pet:change': {
        namespace: 'feature',
        action: 'pet:change',
        description: 'Desktop pet changed',
        payload: {
            petType: 'string'
        },
        example: {
            petType: 'cat'
        }
    },

    'easteregg:triggered': {
        namespace: 'easteregg',
        action: 'triggered',
        description: 'Easter egg activated (Konami, cheat code, etc.) — other features can react',
        payload: {
            code: 'string?'
        },
        example: {
            code: 'konami'
        }
    },

    // ==========================================
    // ACHIEVEMENT EVENTS
    // ==========================================
    'achievement:unlock': {
        namespace: 'achievement',
        action: 'unlock',
        description: 'Achievement unlocked',
        payload: {
            achievementId: 'string',
            title: 'string',
            description: 'string?'
        },
        example: {
            achievementId: 'first_app',
            title: 'First Steps',
            description: 'Opened your first app'
        }
    },

    // ==========================================
    // FEATURE/PLUGIN EVENTS (Extended)
    // ==========================================
    'feature:initialize': {
        namespace: 'feature',
        action: 'initialize',
        description: 'Feature is initializing',
        payload: {
            featureId: 'string',
            config: 'object?'
        },
        example: {
            featureId: 'clippy',
            config: { character: 'clippy' }
        }
    },

    'feature:ready': {
        namespace: 'feature',
        action: 'ready',
        description: 'Feature finished initialization',
        payload: {
            featureId: 'string'
        },
        example: {
            featureId: 'clippy'
        }
    },

    'feature:error': {
        namespace: 'feature',
        action: 'error',
        description: 'Feature error occurred',
        payload: {
            featureId: 'string',
            error: 'string',
            fatal: 'boolean?'
        },
        example: {
            featureId: 'clippy',
            error: 'Failed to load animation',
            fatal: false
        }
    },

    'feature:config:change': {
        namespace: 'feature',
        action: 'config:change',
        description: 'Feature configuration changed (command)',
        payload: {
            featureId: 'string',
            key: 'string',
            value: 'any',
            oldValue: 'any?'
        },
        example: {
            featureId: 'pet',
            key: 'type',
            value: 'cat',
            oldValue: 'dog'
        }
    },

    'feature:config-changed': {
        namespace: 'feature',
        action: 'config-changed',
        description: 'Feature configuration was changed (notification)',
        payload: {
            featureId: 'string',
            key: 'string',
            value: 'any'
        },
        example: {
            featureId: 'pet',
            key: 'type',
            value: 'cat'
        }
    },

    'feature:config-reset': {
        namespace: 'feature',
        action: 'config-reset',
        description: 'Feature configuration was reset to defaults',
        payload: {
            featureId: 'string'
        },
        example: {
            featureId: 'pet'
        }
    },

    'feature:enabled': {
        namespace: 'feature',
        action: 'enabled',
        description: 'Feature was enabled (notification)',
        payload: {
            featureId: 'string'
        },
        example: {
            featureId: 'clippy'
        }
    },

    'feature:disabled': {
        namespace: 'feature',
        action: 'disabled',
        description: 'Feature was disabled (notification)',
        payload: {
            featureId: 'string'
        },
        example: {
            featureId: 'clippy'
        }
    },

    'feature:registered': {
        namespace: 'feature',
        action: 'registered',
        description: 'Feature registered with the system',
        payload: {
            featureId: 'string',
            name: 'string?',
            category: 'string?'
        },
        example: {
            featureId: 'clippy',
            name: 'Clippy Assistant',
            category: 'enhancement'
        }
    },

    'features:initialized': {
        namespace: 'features',
        action: 'initialized',
        description: 'All features have been initialized',
        payload: {
            count: 'number?',
            features: 'array?'
        },
        example: {
            count: 7,
            features: ['soundsystem', 'achievements', 'clippy']
        }
    },

    'plugin:load': {
        namespace: 'plugin',
        action: 'load',
        description: 'Plugin loading started',
        payload: {
            pluginId: 'string',
            path: 'string?'
        },
        example: {
            pluginId: 'dvd-bouncer',
            path: '/plugins/dvd-bouncer'
        }
    },

    'plugin:loaded': {
        namespace: 'plugin',
        action: 'loaded',
        description: 'Plugin loaded successfully',
        payload: {
            pluginId: 'string',
            name: 'string',
            version: 'string?'
        },
        example: {
            pluginId: 'dvd-bouncer',
            name: 'DVD Bouncer Screensaver',
            version: '1.0.0'
        }
    },

    'plugin:error': {
        namespace: 'plugin',
        action: 'error',
        description: 'Plugin loading/execution error',
        payload: {
            pluginId: 'string',
            error: 'string'
        },
        example: {
            pluginId: 'dvd-bouncer',
            error: 'Failed to initialize'
        }
    },

    'plugin:unload': {
        namespace: 'plugin',
        action: 'unload',
        description: 'Plugin unloaded',
        payload: {
            pluginId: 'string'
        },
        example: {
            pluginId: 'dvd-bouncer'
        }
    },

    'plugins:loaded': {
        namespace: 'plugins',
        action: 'loaded',
        description: 'All plugins have been loaded',
        payload: {
            count: 'number?',
            plugins: 'array?'
        },
        example: {
            count: 1,
            plugins: ['dvd-bouncer']
        }
    },

    // ==========================================
    // DVD BOUNCER EVENTS
    // ==========================================
    'feature:unresolved-dependency': {
        namespace: 'feature',
        action: 'unresolved-dependency',
        description: 'Feature has unresolved dependencies that could not be found',
        payload: {
            featureId: 'string',
            missingDependencies: 'array'
        },
        example: {
            featureId: 'clippy',
            missingDependencies: ['sound-system', 'animation-engine']
        }
    },

    'dvd-bouncer:started': {
        namespace: 'dvd-bouncer',
        action: 'started',
        description: 'DVD bouncer screensaver started',
        payload: {
            timestamp: 'number'
        },
        example: {
            timestamp: 1704456000000
        }
    },

    'dvd-bouncer:stopped': {
        namespace: 'dvd-bouncer',
        action: 'stopped',
        description: 'DVD bouncer screensaver stopped',
        payload: {
            cornerHits: 'number',
            timestamp: 'number'
        },
        example: {
            cornerHits: 3,
            timestamp: 1704456300000
        }
    },

    'dvd-bouncer:corner-hit': {
        namespace: 'dvd-bouncer',
        action: 'corner-hit',
        description: 'DVD bouncer logo hit a corner of the screen',
        payload: {
            count: 'number',
            timestamp: 'number'
        },
        example: {
            count: 1,
            timestamp: 1704456100000
        }
    },

    // ==========================================
    // EXAMPLE PLUGIN EVENTS
    // ==========================================
    'example:display': {
        namespace: 'example',
        action: 'display',
        description: 'Example plugin display event (for plugin development reference)',
        payload: {
            message: 'string'
        },
        example: {
            message: 'Hello from example plugin!'
        }
    },

    // ==========================================
    // GAME/ACHIEVEMENT EVENTS (Extended)
    // ==========================================
    'achievement:progress': {
        namespace: 'achievement',
        action: 'progress',
        description: 'Achievement progress updated',
        payload: {
            achievementId: 'string',
            current: 'number',
            target: 'number',
            percentage: 'number?'
        },
        example: {
            achievementId: 'files_created',
            current: 5,
            target: 10,
            percentage: 50
        }
    },

    'achievement:check': {
        namespace: 'achievement',
        action: 'check',
        description: 'Achievement condition check triggered',
        payload: {
            achievementId: 'string',
            condition: 'string?'
        },
        example: {
            achievementId: 'first_app',
            condition: 'app_launched'
        }
    },
};
