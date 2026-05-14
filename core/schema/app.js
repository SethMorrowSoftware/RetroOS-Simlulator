/**
 * App event schemas
 * Auto-split from core/EventSchema.js
 */

export const appEvents = {
    // ==========================================
    // APP EVENTS
    // ==========================================
    'app:launch': {
        namespace: 'app',
        action: 'launch',
        description: 'Request to launch an application',
        payload: {
            appId: 'string',
            params: 'object?'
        },
        example: {
            appId: 'notepad',
            params: { file: 'readme.txt' }
        }
    },

    'app:open': {
        namespace: 'app',
        action: 'open',
        description: 'Triggered when app successfully opens',
        payload: {
            appId: 'string',
            windowId: 'string',
            instance: 'number?'
        },
        example: {
            appId: 'notepad',
            windowId: 'window-notepad-1',
            instance: 0
        }
    },

    'app:close': {
        namespace: 'app',
        action: 'close',
        description: 'Triggered when app closes',
        payload: {
            appId: 'string',
            windowId: 'string'
        },
        example: {
            appId: 'notepad',
            windowId: 'window-notepad-1'
        }
    },

    'app:launched': {
        namespace: 'app',
        action: 'launched',
        description: 'Triggered after app launch completes (from scripting/automation)',
        payload: {
            appId: 'string',
            windowId: 'string?',
            success: 'boolean?'
        },
        example: {
            appId: 'calculator',
            windowId: 'window-calculator-1',
            success: true
        }
    },

    'app:registered': {
        namespace: 'app',
        action: 'registered',
        description: 'Triggered when app is registered in AppRegistry',
        payload: {
            appId: 'string',
            name: 'string',
            category: 'string?'
        },
        example: {
            appId: 'notepad',
            name: 'Notepad',
            category: 'accessories'
        }
    },

    // ==========================================
    // APP EVENTS (Extended)
    // ==========================================
    'app:focus': {
        namespace: 'app',
        action: 'focus',
        description: 'App window received focus',
        payload: {
            appId: 'string',
            windowId: 'string',
            previousAppId: 'string?'
        },
        example: {
            appId: 'notepad',
            windowId: 'notepad-1',
            previousAppId: 'calculator'
        }
    },

    'app:blur': {
        namespace: 'app',
        action: 'blur',
        description: 'App window lost focus',
        payload: {
            appId: 'string',
            windowId: 'string'
        },
        example: {
            appId: 'notepad',
            windowId: 'notepad-1'
        }
    },

    'app:state:change': {
        namespace: 'app',
        action: 'state:change',
        description: 'App internal state changed',
        payload: {
            appId: 'string',
            windowId: 'string',
            key: 'string',
            value: 'any',
            oldValue: 'any?'
        },
        example: {
            appId: 'notepad',
            windowId: 'notepad-1',
            key: 'modified',
            value: true,
            oldValue: false
        }
    },

    'app:error': {
        namespace: 'app',
        action: 'error',
        description: 'App error occurred',
        payload: {
            appId: 'string',
            windowId: 'string?',
            error: 'string',
            stack: 'string?'
        },
        example: {
            appId: 'browser',
            windowId: 'browser-1',
            error: 'Failed to load page'
        }
    },

    'app:message': {
        namespace: 'app',
        action: 'message',
        description: 'App sent a message to another app',
        payload: {
            fromAppId: 'string',
            toAppId: 'string',
            message: 'any',
            messageType: 'string?'
        },
        example: {
            fromAppId: 'notepad',
            toAppId: 'spellcheck',
            message: { text: 'Hello world' },
            messageType: 'check-spelling'
        }
    },

    'app:broadcast': {
        namespace: 'app',
        action: 'broadcast',
        description: 'App broadcast message to all apps',
        payload: {
            fromAppId: 'string',
            message: 'any',
            messageType: 'string?'
        },
        example: {
            fromAppId: 'settings',
            message: { theme: 'dark' },
            messageType: 'theme-change'
        }
    },

    'app:ready': {
        namespace: 'app',
        action: 'ready',
        description: 'App finished initialization and is ready',
        payload: {
            appId: 'string',
            windowId: 'string'
        },
        example: {
            appId: 'notepad',
            windowId: 'notepad-1'
        }
    },

    'app:busy': {
        namespace: 'app',
        action: 'busy',
        description: 'App is busy processing',
        payload: {
            appId: 'string',
            windowId: 'string',
            task: 'string?'
        },
        example: {
            appId: 'browser',
            windowId: 'browser-1',
            task: 'Loading page'
        }
    },

    'app:idle': {
        namespace: 'app',
        action: 'idle',
        description: 'App finished processing and is idle',
        payload: {
            appId: 'string',
            windowId: 'string'
        },
        example: {
            appId: 'browser',
            windowId: 'browser-1'
        }
    },
};
