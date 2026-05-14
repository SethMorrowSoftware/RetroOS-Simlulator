/**
 * Input event schemas
 * Auto-split from core/EventSchema.js
 */

export const inputEvents = {
    // ==========================================
    // INPUT EVENTS - MOUSE
    // ==========================================
    'mouse:move': {
        namespace: 'mouse',
        action: 'move',
        description: 'Mouse moved',
        payload: {
            x: 'number',
            y: 'number',
            deltaX: 'number?',
            deltaY: 'number?',
            target: 'string?'
        },
        example: {
            x: 500,
            y: 300,
            deltaX: 5,
            deltaY: -2
        }
    },

    'mouse:click': {
        namespace: 'mouse',
        action: 'click',
        description: 'Mouse clicked',
        payload: {
            x: 'number',
            y: 'number',
            button: 'number',
            target: 'string?',
            targetType: 'string?'
        },
        example: {
            x: 500,
            y: 300,
            button: 0,
            target: 'desktop',
            targetType: 'element'
        }
    },

    'mouse:dblclick': {
        namespace: 'mouse',
        action: 'dblclick',
        description: 'Mouse double-clicked',
        payload: {
            x: 'number',
            y: 'number',
            button: 'number',
            target: 'string?'
        },
        example: {
            x: 500,
            y: 300,
            button: 0
        }
    },

    'mouse:down': {
        namespace: 'mouse',
        action: 'down',
        description: 'Mouse button pressed',
        payload: {
            x: 'number',
            y: 'number',
            button: 'number',
            target: 'string?'
        },
        example: {
            x: 500,
            y: 300,
            button: 0
        }
    },

    'mouse:up': {
        namespace: 'mouse',
        action: 'up',
        description: 'Mouse button released',
        payload: {
            x: 'number',
            y: 'number',
            button: 'number',
            target: 'string?'
        },
        example: {
            x: 500,
            y: 300,
            button: 0
        }
    },

    'mouse:contextmenu': {
        namespace: 'mouse',
        action: 'contextmenu',
        description: 'Context menu triggered (right-click)',
        payload: {
            x: 'number',
            y: 'number',
            target: 'string?',
            targetType: 'string?'
        },
        example: {
            x: 500,
            y: 300,
            target: 'desktop-icon-1',
            targetType: 'icon'
        }
    },

    'mouse:scroll': {
        namespace: 'mouse',
        action: 'scroll',
        description: 'Mouse wheel scrolled',
        payload: {
            deltaX: 'number',
            deltaY: 'number',
            deltaZ: 'number?',
            x: 'number',
            y: 'number',
            target: 'string?'
        },
        example: {
            deltaX: 0,
            deltaY: -120,
            x: 500,
            y: 300
        }
    },

    'mouse:enter': {
        namespace: 'mouse',
        action: 'enter',
        description: 'Mouse entered element',
        payload: {
            target: 'string',
            targetType: 'string?',
            x: 'number',
            y: 'number'
        },
        example: {
            target: 'window-notepad-1',
            targetType: 'window',
            x: 100,
            y: 50
        }
    },

    'mouse:leave': {
        namespace: 'mouse',
        action: 'leave',
        description: 'Mouse left element',
        payload: {
            target: 'string',
            targetType: 'string?',
            x: 'number',
            y: 'number'
        },
        example: {
            target: 'window-notepad-1',
            targetType: 'window',
            x: 600,
            y: 50
        }
    },

    // ==========================================
    // INPUT EVENTS - KEYBOARD
    // ==========================================
    'keyboard:keydown': {
        namespace: 'keyboard',
        action: 'keydown',
        description: 'Key pressed down',
        payload: {
            key: 'string',
            code: 'string',
            ctrl: 'boolean',
            alt: 'boolean',
            shift: 'boolean',
            meta: 'boolean',
            repeat: 'boolean',
            target: 'string?'
        },
        example: {
            key: 'a',
            code: 'KeyA',
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
            repeat: false
        }
    },

    'keyboard:keyup': {
        namespace: 'keyboard',
        action: 'keyup',
        description: 'Key released',
        payload: {
            key: 'string',
            code: 'string',
            ctrl: 'boolean',
            alt: 'boolean',
            shift: 'boolean',
            meta: 'boolean',
            target: 'string?'
        },
        example: {
            key: 'a',
            code: 'KeyA',
            ctrl: false,
            alt: false,
            shift: false,
            meta: false
        }
    },

    'keyboard:input': {
        namespace: 'keyboard',
        action: 'input',
        description: 'Text input received',
        payload: {
            data: 'string',
            inputType: 'string?',
            target: 'string?'
        },
        example: {
            data: 'Hello',
            inputType: 'insertText',
            target: 'notepad-textarea'
        }
    },

    'keyboard:combo': {
        namespace: 'keyboard',
        action: 'combo',
        description: 'Key combination pressed',
        payload: {
            combo: 'string',
            keys: 'array',
            handled: 'boolean?'
        },
        example: {
            combo: 'Ctrl+Shift+S',
            keys: ['Control', 'Shift', 'S'],
            handled: true
        }
    },

    // ==========================================
    // INPUT EVENTS - TOUCH
    // ==========================================
    'touch:start': {
        namespace: 'touch',
        action: 'start',
        description: 'Touch started',
        payload: {
            touches: 'array',
            x: 'number',
            y: 'number',
            target: 'string?'
        },
        example: {
            touches: [{ x: 100, y: 200, id: 0 }],
            x: 100,
            y: 200
        }
    },

    'touch:move': {
        namespace: 'touch',
        action: 'move',
        description: 'Touch moved',
        payload: {
            touches: 'array',
            x: 'number',
            y: 'number',
            deltaX: 'number?',
            deltaY: 'number?',
            target: 'string?'
        },
        example: {
            touches: [{ x: 150, y: 250, id: 0 }],
            x: 150,
            y: 250,
            deltaX: 50,
            deltaY: 50
        }
    },

    'touch:end': {
        namespace: 'touch',
        action: 'end',
        description: 'Touch ended',
        payload: {
            touches: 'array',
            x: 'number',
            y: 'number',
            target: 'string?'
        },
        example: {
            touches: [],
            x: 150,
            y: 250
        }
    },

    'touch:cancel': {
        namespace: 'touch',
        action: 'cancel',
        description: 'Touch cancelled',
        payload: {
            touches: 'array',
            target: 'string?'
        },
        example: {
            touches: []
        }
    },

    // ==========================================
    // GESTURE EVENTS
    // ==========================================
    'gesture:tap': {
        namespace: 'gesture',
        action: 'tap',
        description: 'Tap gesture detected',
        payload: {
            x: 'number',
            y: 'number',
            target: 'string?'
        },
        example: {
            x: 100,
            y: 200
        }
    },

    'gesture:doubletap': {
        namespace: 'gesture',
        action: 'doubletap',
        description: 'Double tap gesture detected',
        payload: {
            x: 'number',
            y: 'number',
            target: 'string?'
        },
        example: {
            x: 100,
            y: 200
        }
    },

    'gesture:longpress': {
        namespace: 'gesture',
        action: 'longpress',
        description: 'Long press gesture detected',
        payload: {
            x: 'number',
            y: 'number',
            duration: 'number',
            target: 'string?'
        },
        example: {
            x: 100,
            y: 200,
            duration: 800
        }
    },

    'gesture:swipe': {
        namespace: 'gesture',
        action: 'swipe',
        description: 'Swipe gesture detected',
        payload: {
            direction: 'string',
            startX: 'number',
            startY: 'number',
            endX: 'number',
            endY: 'number',
            velocity: 'number',
            target: 'string?'
        },
        example: {
            direction: 'left',
            startX: 300,
            startY: 200,
            endX: 100,
            endY: 200,
            velocity: 1.5
        }
    },

    'gesture:pinch': {
        namespace: 'gesture',
        action: 'pinch',
        description: 'Pinch gesture detected',
        payload: {
            scale: 'number',
            centerX: 'number',
            centerY: 'number',
            target: 'string?'
        },
        example: {
            scale: 0.8,
            centerX: 200,
            centerY: 200
        }
    },

    'gesture:rotate': {
        namespace: 'gesture',
        action: 'rotate',
        description: 'Rotation gesture detected',
        payload: {
            angle: 'number',
            centerX: 'number',
            centerY: 'number',
            target: 'string?'
        },
        example: {
            angle: 45,
            centerX: 200,
            centerY: 200
        }
    },

    // ==========================================
    // KEYBOARD/INPUT EVENTS
    // ==========================================
    'keyboard:shortcut': {
        namespace: 'keyboard',
        action: 'shortcut',
        description: 'Keyboard shortcut triggered',
        payload: {
            key: 'string',
            ctrl: 'boolean?',
            alt: 'boolean?',
            shift: 'boolean?',
            meta: 'boolean?'
        },
        example: {
            key: 's',
            ctrl: true
        }
    },
};
