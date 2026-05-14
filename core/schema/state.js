/**
 * State event schemas
 * Auto-split from core/EventSchema.js
 */

export const stateEvents = {
    // ==========================================
    // STATE EVENTS
    // ==========================================
    'state:change': {
        namespace: 'state',
        action: 'change',
        description: 'State value changed',
        payload: {
            path: 'string',
            value: 'any',
            oldValue: 'any?'
        },
        example: {
            path: 'settings.sound',
            value: true,
            oldValue: false
        }
    },

    // ==========================================
    // SETTING EVENTS
    // ==========================================
    'setting:changed': {
        namespace: 'setting',
        action: 'changed',
        description: 'Setting value changed',
        payload: {
            key: 'string',
            value: 'any',
            oldValue: 'any?'
        },
        example: {
            key: 'sound',
            value: true,
            oldValue: false
        }
    },

    // ==========================================
    // DRAG & DROP EVENTS
    // ==========================================
    'drag:start': {
        namespace: 'drag',
        action: 'start',
        description: 'Drag operation started',
        payload: {
            itemId: 'string',
            itemType: 'string',
            x: 'number',
            y: 'number'
        },
        example: {
            itemId: 'notepad-icon',
            itemType: 'icon',
            x: 100,
            y: 100
        }
    },

    'drag:move': {
        namespace: 'drag',
        action: 'move',
        description: 'Item being dragged',
        payload: {
            itemId: 'string',
            x: 'number',
            y: 'number'
        },
        example: {
            itemId: 'notepad-icon',
            x: 150,
            y: 125
        }
    },

    'drag:end': {
        namespace: 'drag',
        action: 'end',
        description: 'Drag operation ended',
        payload: {
            itemId: 'string',
            x: 'number',
            y: 'number',
            target: 'string?'
        },
        example: {
            itemId: 'notepad-icon',
            x: 200,
            y: 150,
            target: 'desktop'
        }
    },
};
