/**
 * Window event schemas
 * Auto-split from core/EventSchema.js
 */

export const windowEvents = {
    // ==========================================
    // WINDOW EVENTS
    // ==========================================
    'window:create': {
        namespace: 'window',
        action: 'create',
        description: 'Triggered when a new window is being created',
        payload: {
            id: 'string',
            title: 'string',
            appId: 'string',
            width: 'number',
            height: 'number',
            x: 'number?',
            y: 'number?',
            resizable: 'boolean?',
            minimizable: 'boolean?',
            maximizable: 'boolean?'
        },
        example: {
            id: 'window-notepad-1',
            title: 'Notepad',
            appId: 'notepad',
            width: 500,
            height: 400,
            resizable: true
        }
    },

    'window:open': {
        namespace: 'window',
        action: 'open',
        description: 'Triggered after window is opened and rendered in DOM',
        payload: {
            id: 'string',
            appId: 'string?',
            element: 'HTMLElement?'
        },
        example: {
            id: 'window-notepad-1',
            appId: 'notepad'
        }
    },

    'window:close': {
        namespace: 'window',
        action: 'close',
        description: 'Triggered when window is closing',
        payload: {
            id: 'string',
            appId: 'string?'
        },
        example: {
            id: 'window-notepad-1',
            appId: 'notepad'
        }
    },

    'window:focus': {
        namespace: 'window',
        action: 'focus',
        description: 'Triggered when window receives focus',
        payload: {
            id: 'string',
            previousId: 'string?'
        },
        example: {
            id: 'window-calculator-1',
            previousId: 'window-notepad-1'
        }
    },

    'window:minimize': {
        namespace: 'window',
        action: 'minimize',
        description: 'Triggered when window is minimized',
        payload: {
            id: 'string'
        },
        example: {
            id: 'window-notepad-1'
        }
    },

    'window:maximize': {
        namespace: 'window',
        action: 'maximize',
        description: 'Triggered when window is maximized',
        payload: {
            id: 'string'
        },
        example: {
            id: 'window-notepad-1'
        }
    },

    'window:restore': {
        namespace: 'window',
        action: 'restore',
        description: 'Triggered when window is restored from minimized/maximized',
        payload: {
            id: 'string'
        },
        example: {
            id: 'window-notepad-1'
        }
    },

    'window:resize': {
        namespace: 'window',
        action: 'resize',
        description: 'Triggered when window is resized',
        payload: {
            id: 'string',
            width: 'number',
            height: 'number'
        },
        example: {
            id: 'window-notepad-1',
            width: 600,
            height: 500
        }
    },

    // ==========================================
    // WINDOW EVENTS (Extended)
    // ==========================================
    'window:move': {
        namespace: 'window',
        action: 'move',
        description: 'Window position changed',
        payload: {
            id: 'string',
            x: 'number',
            y: 'number',
            previousX: 'number?',
            previousY: 'number?'
        },
        example: {
            id: 'notepad-1',
            x: 200,
            y: 150
        }
    },

    'window:move:start': {
        namespace: 'window',
        action: 'move:start',
        description: 'Window drag started',
        payload: {
            id: 'string',
            x: 'number',
            y: 'number'
        },
        example: {
            id: 'notepad-1',
            x: 100,
            y: 100
        }
    },

    'window:move:end': {
        namespace: 'window',
        action: 'move:end',
        description: 'Window drag ended',
        payload: {
            id: 'string',
            x: 'number',
            y: 'number'
        },
        example: {
            id: 'notepad-1',
            x: 200,
            y: 150
        }
    },

    'window:resize:start': {
        namespace: 'window',
        action: 'resize:start',
        description: 'Window resize started',
        payload: {
            id: 'string',
            width: 'number',
            height: 'number',
            handle: 'string?'
        },
        example: {
            id: 'notepad-1',
            width: 400,
            height: 300,
            handle: 'se'
        }
    },

    'window:resize:end': {
        namespace: 'window',
        action: 'resize:end',
        description: 'Window resize ended',
        payload: {
            id: 'string',
            width: 'number',
            height: 'number'
        },
        example: {
            id: 'notepad-1',
            width: 600,
            height: 400
        }
    },

    'window:snap': {
        namespace: 'window',
        action: 'snap',
        description: 'Window snapped to edge/position',
        payload: {
            id: 'string',
            snapType: 'string',
            x: 'number',
            y: 'number',
            width: 'number',
            height: 'number'
        },
        example: {
            id: 'notepad-1',
            snapType: 'left-half',
            x: 0,
            y: 0,
            width: 960,
            height: 1080
        }
    },

    'window:titlebar:click': {
        namespace: 'window',
        action: 'titlebar:click',
        description: 'Window titlebar clicked',
        payload: {
            id: 'string',
            button: 'string?'
        },
        example: {
            id: 'notepad-1',
            button: 'minimize'
        }
    },

    'window:shake': {
        namespace: 'window',
        action: 'shake',
        description: 'Window shake animation (e.g., for error feedback)',
        payload: {
            id: 'string',
            reason: 'string?'
        },
        example: {
            id: 'notepad-1',
            reason: 'validation-error'
        }
    },

    'window:flash': {
        namespace: 'window',
        action: 'flash',
        description: 'Window flash/blink for attention',
        payload: {
            id: 'string',
            count: 'number?'
        },
        example: {
            id: 'notepad-1',
            count: 3
        }
    },
};
