/**
 * Ui event schemas
 * Auto-split from core/EventSchema.js
 */

export const uiEvents = {
    // ==========================================
    // UI EVENTS
    // ==========================================
    'ui:menu:start:open': {
        namespace: 'ui',
        action: 'menu:start:open',
        description: 'Start menu opened',
        payload: {},
        example: {}
    },

    'ui:menu:start:close': {
        namespace: 'ui',
        action: 'menu:start:close',
        description: 'Start menu closed',
        payload: {},
        example: {}
    },

    'ui:menu:start:toggle': {
        namespace: 'ui',
        action: 'menu:start:toggle',
        description: 'Start menu toggled',
        payload: {},
        example: {}
    },

    'ui:menu:context:show': {
        namespace: 'ui',
        action: 'menu:context:show',
        description: 'Context menu shown - type determines which menu to display',
        payload: {
            x: 'number',
            y: 'number',
            type: 'string',         // Menu type: 'desktop', 'icon', 'taskbar', 'explorer-file', etc.
            icon: 'object?',        // Icon data for icon context menus
            windowId: 'string?',    // Window ID for taskbar context menus
            item: 'object?',        // Item data for explorer context menus
            currentPath: 'array?'   // Current path for explorer context menus
        },
        example: {
            x: 100,
            y: 200,
            type: 'icon',
            icon: { id: 'notepad', type: 'app', label: 'Notepad' }
        }
    },

    'ui:menu:context:hide': {
        namespace: 'ui',
        action: 'menu:context:hide',
        description: 'Context menu hidden',
        payload: {},
        example: {}
    },

    'ui:menu:action': {
        namespace: 'ui',
        action: 'menu:action',
        description: 'Menu action triggered',
        payload: {
            action: 'string',
            data: 'any?'
        },
        example: {
            action: 'open',
            data: { fileId: 'readme.txt' }
        }
    },

    'ui:taskbar:update': {
        namespace: 'ui',
        action: 'taskbar:update',
        description: 'Taskbar needs to update',
        payload: {},
        example: {}
    },

    // ==========================================
    // ICON EVENTS
    // ==========================================
    'icon:click': {
        namespace: 'icon',
        action: 'click',
        description: 'Icon clicked (single click)',
        payload: {
            iconId: 'string',
            appId: 'string?'
        },
        example: {
            iconId: 'notepad-icon',
            appId: 'notepad'
        }
    },

    'icon:dblclick': {
        namespace: 'icon',
        action: 'dblclick',
        description: 'Icon double-clicked',
        payload: {
            iconId: 'string',
            appId: 'string?'
        },
        example: {
            iconId: 'notepad-icon',
            appId: 'notepad'
        }
    },

    'icon:move': {
        namespace: 'icon',
        action: 'move',
        description: 'Icon moved on desktop',
        payload: {
            iconId: 'string',
            x: 'number',
            y: 'number'
        },
        example: {
            iconId: 'notepad-icon',
            x: 100,
            y: 150
        }
    },

    'icon:delete': {
        namespace: 'icon',
        action: 'delete',
        description: 'Icon deleted',
        payload: {
            iconId: 'string'
        },
        example: {
            iconId: 'notepad-icon'
        }
    },

    // ==========================================
    // DESKTOP EVENTS
    // ==========================================
    'desktop:render': {
        namespace: 'desktop',
        action: 'render',
        description: 'Desktop needs to re-render',
        payload: {},
        example: {}
    },

    'desktop:refresh': {
        namespace: 'desktop',
        action: 'refresh',
        description: 'Desktop refresh requested',
        payload: {},
        example: {}
    },

    'desktop:arrange': {
        namespace: 'desktop',
        action: 'arrange',
        description: 'Arrange desktop icons',
        payload: {
            mode: 'string?'
        },
        example: {
            mode: 'auto'
        }
    },

    'desktop:bg-change': {
        namespace: 'desktop',
        action: 'bg-change',
        description: 'Desktop background changed',
        payload: {
            color: 'string?',
            wallpaper: 'string?'
        },
        example: {
            color: '#008080',
            wallpaper: 'clouds.jpg'
        }
    },

    'desktop:settings-change': {
        namespace: 'desktop',
        action: 'settings-change',
        description: 'Desktop settings changed',
        payload: {
            bgColor: 'string?',
            wallpaper: 'string?',
            iconSize: 'number?',
            textColor: 'string?'
        },
        example: {
            bgColor: '#008080',
            wallpaper: 'clouds.jpg',
            iconSize: 32
        }
    },

    // ==========================================
    // UI FEEDBACK EVENTS
    // ==========================================
    'feedback:toast': {
        namespace: 'feedback',
        action: 'toast',
        description: 'Show toast notification',
        payload: {
            message: 'string',
            type: 'string?',
            duration: 'number?',
            position: 'string?'
        },
        example: {
            message: 'File saved!',
            type: 'success',
            duration: 3000,
            position: 'bottom-right'
        }
    },

    'feedback:flash': {
        namespace: 'feedback',
        action: 'flash',
        description: 'Flash screen effect',
        payload: {
            color: 'string?',
            duration: 'number?'
        },
        example: {
            color: 'white',
            duration: 100
        }
    },

    'feedback:shake': {
        namespace: 'feedback',
        action: 'shake',
        description: 'Shake effect',
        payload: {
            target: 'string?',
            intensity: 'number?'
        },
        example: {
            target: 'window-notepad-1',
            intensity: 5
        }
    },

    'feedback:vibrate': {
        namespace: 'feedback',
        action: 'vibrate',
        description: 'Vibration feedback (mobile)',
        payload: {
            pattern: 'array?',
            duration: 'number?'
        },
        example: {
            pattern: [100, 50, 100],
            duration: 200
        }
    },

    'feedback:progress:start': {
        namespace: 'feedback',
        action: 'progress:start',
        description: 'Progress indicator started',
        payload: {
            id: 'string',
            message: 'string?',
            total: 'number?'
        },
        example: {
            id: 'file-copy',
            message: 'Copying files...',
            total: 100
        }
    },

    'feedback:progress:update': {
        namespace: 'feedback',
        action: 'progress:update',
        description: 'Progress indicator updated',
        payload: {
            id: 'string',
            current: 'number',
            total: 'number?',
            message: 'string?'
        },
        example: {
            id: 'file-copy',
            current: 50,
            total: 100,
            message: 'Copying file 50 of 100...'
        }
    },

    'feedback:progress:end': {
        namespace: 'feedback',
        action: 'progress:end',
        description: 'Progress indicator ended',
        payload: {
            id: 'string',
            success: 'boolean?',
            message: 'string?'
        },
        example: {
            id: 'file-copy',
            success: true,
            message: 'Copy complete!'
        }
    },

    // ==========================================
    // ANIMATION EVENTS
    // ==========================================
    'animation:start': {
        namespace: 'animation',
        action: 'start',
        description: 'Animation started',
        payload: {
            id: 'string',
            target: 'string',
            name: 'string',
            duration: 'number?'
        },
        example: {
            id: 'anim-1',
            target: 'window-notepad-1',
            name: 'fadeIn',
            duration: 300
        }
    },

    'animation:end': {
        namespace: 'animation',
        action: 'end',
        description: 'Animation ended',
        payload: {
            id: 'string',
            target: 'string',
            name: 'string'
        },
        example: {
            id: 'anim-1',
            target: 'window-notepad-1',
            name: 'fadeIn'
        }
    },

    'animation:cancel': {
        namespace: 'animation',
        action: 'cancel',
        description: 'Animation cancelled',
        payload: {
            id: 'string',
            target: 'string',
            name: 'string'
        },
        example: {
            id: 'anim-1',
            target: 'window-notepad-1',
            name: 'fadeIn'
        }
    },

    // ==========================================
    // THEME EVENTS
    // ==========================================
    'theme:change': {
        namespace: 'theme',
        action: 'change',
        description: 'Theme changed',
        payload: {
            theme: 'string',
            previousTheme: 'string?'
        },
        example: {
            theme: 'dark',
            previousTheme: 'light'
        }
    },

    'theme:color:change': {
        namespace: 'theme',
        action: 'color:change',
        description: 'Theme color changed',
        payload: {
            property: 'string',
            value: 'string',
            oldValue: 'string?'
        },
        example: {
            property: '--accent-color',
            value: '#0078d4',
            oldValue: '#0066cc'
        }
    },

    // ==========================================
    // ACCESSIBILITY EVENTS
    // ==========================================
    'a11y:announce': {
        namespace: 'a11y',
        action: 'announce',
        description: 'Screen reader announcement',
        payload: {
            message: 'string',
            priority: 'string?'
        },
        example: {
            message: 'File saved successfully',
            priority: 'polite'
        }
    },

    'a11y:focus:change': {
        namespace: 'a11y',
        action: 'focus:change',
        description: 'Focus changed for accessibility',
        payload: {
            target: 'string',
            label: 'string?'
        },
        example: {
            target: 'save-button',
            label: 'Save File'
        }
    },

    'a11y:mode:change': {
        namespace: 'a11y',
        action: 'mode:change',
        description: 'Accessibility mode changed',
        payload: {
            mode: 'string',
            enabled: 'boolean'
        },
        example: {
            mode: 'high-contrast',
            enabled: true
        }
    },

    // ==========================================
    // SELECTION EVENTS
    // ==========================================
    'selection:change': {
        namespace: 'selection',
        action: 'change',
        description: 'Selection changed',
        payload: {
            items: 'array',
            source: 'string?',
            selectionType: 'string?'
        },
        example: {
            items: ['icon-1', 'icon-2'],
            source: 'desktop',
            selectionType: 'multi'
        }
    },

    'selection:clear': {
        namespace: 'selection',
        action: 'clear',
        description: 'Selection cleared',
        payload: {
            source: 'string?'
        },
        example: {
            source: 'desktop'
        }
    },

    'selection:all': {
        namespace: 'selection',
        action: 'all',
        description: 'Select all triggered',
        payload: {
            source: 'string',
            count: 'number?'
        },
        example: {
            source: 'desktop',
            count: 10
        }
    },

    // ==========================================
    // SEARCH EVENTS
    // ==========================================
    'search:query': {
        namespace: 'search',
        action: 'query',
        description: 'Search query submitted',
        payload: {
            query: 'string',
            scope: 'string?',
            filters: 'object?'
        },
        example: {
            query: 'readme',
            scope: 'files',
            filters: { type: 'txt' }
        }
    },

    'search:results': {
        namespace: 'search',
        action: 'results',
        description: 'Search results received',
        payload: {
            query: 'string',
            results: 'array',
            count: 'number',
            duration: 'number?'
        },
        example: {
            query: 'readme',
            results: [{ name: 'readme.txt', path: 'C:/Documents/readme.txt' }],
            count: 1,
            duration: 15
        }
    },

    'search:clear': {
        namespace: 'search',
        action: 'clear',
        description: 'Search cleared',
        payload: {},
        example: {}
    },

    // ==========================================
    // HISTORY/UNDO EVENTS
    // ==========================================
    'history:push': {
        namespace: 'history',
        action: 'push',
        description: 'Action pushed to history stack',
        payload: {
            actionType: 'string',
            data: 'any',
            description: 'string?'
        },
        example: {
            actionType: 'text:insert',
            data: { text: 'Hello', position: 0 },
            description: 'Insert text'
        }
    },

    'history:undo': {
        namespace: 'history',
        action: 'undo',
        description: 'Undo action performed',
        payload: {
            actionType: 'string',
            data: 'any'
        },
        example: {
            actionType: 'text:insert',
            data: { text: 'Hello', position: 0 }
        }
    },

    'history:redo': {
        namespace: 'history',
        action: 'redo',
        description: 'Redo action performed',
        payload: {
            actionType: 'string',
            data: 'any'
        },
        example: {
            actionType: 'text:insert',
            data: { text: 'Hello', position: 0 }
        }
    },

    'history:clear': {
        namespace: 'history',
        action: 'clear',
        description: 'History stack cleared',
        payload: {
            scope: 'string?'
        },
        example: {
            scope: 'notepad-1'
        }
    },
};
