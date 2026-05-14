/**
 * Apps event schemas
 * Auto-split from core/EventSchema.js
 */

export const appsEvents = {
    // ==========================================
    // PAINT EVENTS
    // Note: paint:tool:changed, paint:color:changed, paint:brushSize:changed,
    // paint:canvas:cleared are defined in operations.js (matching actual emitted names)
    // ==========================================
    'paint:stroke:start': {
        namespace: 'paint',
        action: 'stroke:start',
        description: 'Stroke started',
        payload: {
            x: 'number',
            y: 'number',
            tool: 'string'
        },
        example: { x: 100, y: 50, tool: 'brush' }
    },

    'paint:stroke:end': {
        namespace: 'paint',
        action: 'stroke:end',
        description: 'Stroke ended',
        payload: {
            x: 'number',
            y: 'number'
        },
        example: { x: 200, y: 150 }
    },

    'paint:file:save': {
        namespace: 'paint',
        action: 'file:save',
        description: 'Image saved',
        payload: {
            path: 'array',
            filename: 'string'
        },
        example: { path: ['C:', 'Users', 'User', 'Pictures'], filename: 'drawing.png' }
    },

    'paint:file:open': {
        namespace: 'paint',
        action: 'file:open',
        description: 'Image opened',
        payload: {
            path: 'array',
            filename: 'string'
        },
        example: { path: ['C:', 'Users', 'User', 'Pictures'], filename: 'photo.png' }
    },

    // ==========================================
    // TERMINAL EVENTS
    // ==========================================
    'terminal:command': {
        namespace: 'terminal',
        action: 'command',
        description: 'Command executed',
        payload: {
            command: 'string',
            args: 'array?',
            cwd: 'string?'
        },
        example: { command: 'dir', args: ['/w'], cwd: 'C:\\Users\\User' }
    },

    'terminal:output': {
        namespace: 'terminal',
        action: 'output',
        description: 'Output generated',
        payload: {
            text: 'string',
            type: 'string?'
        },
        example: { text: 'Directory listing...', type: 'normal' }
    },

    'terminal:error': {
        namespace: 'terminal',
        action: 'error',
        description: 'Error occurred',
        payload: {
            message: 'string',
            command: 'string?'
        },
        example: { message: 'Command not found', command: 'xyz' }
    },

    'terminal:cwd:change': {
        namespace: 'terminal',
        action: 'cwd:change',
        description: 'Directory changed',
        payload: {
            cwd: 'string',
            previousCwd: 'string?'
        },
        example: { cwd: 'C:\\Users\\User\\Documents', previousCwd: 'C:\\Users\\User' }
    },

    'terminal:matrix': {
        namespace: 'terminal',
        action: 'matrix',
        description: 'Trigger Matrix screen effect (easter egg)',
        payload: {},
        example: {}
    },

    'terminal:command:executed': {
        namespace: 'terminal',
        action: 'command:executed',
        description: 'Terminal command successfully executed',
        payload: {
            appId: 'string',
            windowId: 'string?',
            command: 'string',
            timestamp: 'number?'
        },
        example: { appId: 'terminal', windowId: 'win-1', command: 'dir', timestamp: 1700000000000 }
    },

    'terminal:command:error': {
        namespace: 'terminal',
        action: 'command:error',
        description: 'Terminal command execution error',
        payload: {
            appId: 'string',
            command: 'string',
            error: 'string'
        },
        example: { appId: 'terminal', command: 'badcmd', error: 'Command not found' }
    },

    'terminal:cleared': {
        namespace: 'terminal',
        action: 'cleared',
        description: 'Terminal screen cleared',
        payload: {
            appId: 'string',
            windowId: 'string?',
            timestamp: 'number?'
        },
        example: { appId: 'terminal', windowId: 'win-1', timestamp: 1700000000000 }
    },

    'terminal:directory:changed': {
        namespace: 'terminal',
        action: 'directory:changed',
        description: 'Terminal working directory changed',
        payload: {
            appId: 'string',
            path: 'array',
            timestamp: 'number?'
        },
        example: { appId: 'terminal', path: ['C:', 'Users', 'User'], timestamp: 1700000000000 }
    },

    'app:terminal:opened': {
        namespace: 'app',
        action: 'terminal:opened',
        description: 'Terminal window opened',
        payload: {
            appId: 'string',
            windowId: 'string?',
            currentPath: 'array?',
            pathString: 'string?',
            timestamp: 'number?'
        },
        example: { appId: 'terminal', windowId: 'win-1', pathString: 'C:\\Users\\User' }
    },

    'app:terminal:command': {
        namespace: 'app',
        action: 'terminal:command',
        description: 'Terminal command processed with full context',
        payload: {
            appId: 'string',
            windowId: 'string?',
            command: 'string',
            cmd: 'string?',
            args: 'array?',
            output: 'string?',
            currentPath: 'array?',
            pathString: 'string?',
            timestamp: 'number?'
        },
        example: { appId: 'terminal', command: 'dir /w', cmd: 'dir', args: ['/w'] }
    },

    'app:terminal:closed': {
        namespace: 'app',
        action: 'terminal:closed',
        description: 'Terminal window closed',
        payload: {
            appId: 'string',
            windowId: 'string?',
            commandHistory: 'array?',
            historyCount: 'number?',
            timestamp: 'number?'
        },
        example: { appId: 'terminal', windowId: 'win-1', historyCount: 42 }
    },

    'app:launch:error': {
        namespace: 'app',
        action: 'launch:error',
        description: 'App launch failed with error',
        payload: {
            appId: 'string',
            appName: 'string?',
            error: 'string',
            stack: 'string?',
            timestamp: 'number?'
        },
        example: { appId: 'notepad', error: 'Failed to initialize' }
    },

    // ==========================================
    // BSOD EVENTS (Blue Screen of Death)
    // ==========================================
    'bsod:show': {
        namespace: 'bsod',
        action: 'show',
        description: 'Show Blue Screen of Death effect',
        payload: {
            error: 'string?',
            code: 'string?'
        },
        example: {
            error: 'CRITICAL_PROCESS_DIED',
            code: '0x0000007E'
        }
    },

    // ==========================================
    // BROWSER EVENTS
    // ==========================================
    'browser:navigate': {
        namespace: 'browser',
        action: 'navigate',
        description: 'Navigation started',
        payload: {
            url: 'string',
            previousUrl: 'string?'
        },
        example: { url: 'https://example.com', previousUrl: 'about:blank' }
    },

    'browser:load': {
        namespace: 'browser',
        action: 'load',
        description: 'Page loaded',
        payload: {
            url: 'string',
            title: 'string?'
        },
        example: { url: 'https://example.com', title: 'Example Site' }
    },

    'browser:bookmark:add': {
        namespace: 'browser',
        action: 'bookmark:add',
        description: 'Bookmark added',
        payload: {
            url: 'string',
            title: 'string'
        },
        example: { url: 'https://example.com', title: 'Example' }
    },

    // ==========================================
    // BONZIBUDDY EVENTS
    // ==========================================
    'app:bonzibuddy:scan:complete': {
        namespace: 'app',
        action: 'bonzibuddy:scan:complete',
        description: 'BonziBuddy fake antivirus scan completed',
        payload: {
            appId: 'string',
            windowId: 'string?',
            threatCount: 'number',
            threats: 'array',
            scansCompleted: 'number'
        },
        example: { appId: 'bonzibuddy', threatCount: 5, threats: ['Trojan.FakeAlert'], scansCompleted: 1 }
    },

    'app:bonzibuddy:threats:cleaned': {
        namespace: 'app',
        action: 'bonzibuddy:threats:cleaned',
        description: 'BonziBuddy fake threat cleaning completed',
        payload: {
            appId: 'string',
            windowId: 'string?',
            cleanedCount: 'number',
            totalCleaned: 'number'
        },
        example: { appId: 'bonzibuddy', cleanedCount: 5, totalCleaned: 10 }
    },

    'app:bonzibuddy:toolbar:installed': {
        namespace: 'app',
        action: 'bonzibuddy:toolbar:installed',
        description: 'BonziBuddy fake toolbar installation',
        payload: {
            appId: 'string',
            windowId: 'string?',
            toolbars: 'number'
        },
        example: { appId: 'bonzibuddy', toolbars: 13 }
    },

    'app:bonzibuddy:eula:accepted': {
        namespace: 'app',
        action: 'bonzibuddy:eula:accepted',
        description: 'BonziBuddy EULA accepted by user',
        payload: {
            appId: 'string',
            windowId: 'string?',
            timestamp: 'number'
        },
        example: { appId: 'bonzibuddy', timestamp: 1700000000000 }
    },

    'app:bonzibuddy:speak': {
        namespace: 'app',
        action: 'bonzibuddy:speak',
        description: 'BonziBuddy speech bubble updated via script',
        payload: {
            appId: 'string',
            windowId: 'string?',
            text: 'string'
        },
        example: { appId: 'bonzibuddy', text: 'Hello friend!' }
    },
};
