/**
 * Scripting event schemas
 * Auto-split from core/EventSchema.js
 */

export const scriptingEvents = {
    // ==========================================
    // SCRIPT/AUTOMATION EVENTS
    // ==========================================
    'script:execute': {
        namespace: 'script',
        action: 'execute',
        description: 'Execute a script',
        payload: {
            scriptId: 'string',
            params: 'object?',
            requestId: 'string?'
        },
        example: {
            scriptId: 'auto-backup',
            params: { destination: '/backup' }
        }
    },

    'script:complete': {
        namespace: 'script',
        action: 'complete',
        description: 'Script execution completed',
        payload: {
            scriptId: 'string',
            requestId: 'string?',
            result: 'any?',
            error: 'string?'
        },
        example: {
            scriptId: 'auto-backup',
            requestId: 'req-123',
            result: { filesBackedUp: 5 }
        }
    },

    'script:error': {
        namespace: 'script',
        action: 'error',
        description: 'Script execution error',
        payload: {
            scriptId: 'string',
            requestId: 'string?',
            error: 'string',
            line: 'number?'
        },
        example: {
            scriptId: 'auto-backup',
            error: 'Permission denied',
            line: 15
        }
    },

    'script:output': {
        namespace: 'script',
        action: 'output',
        description: 'Script print/log output',
        payload: {
            message: 'string'
        },
        example: {
            message: 'Hello from script!'
        }
    },

    // ==========================================
    // CHANNEL/SCOPE EVENTS (for isolated communication)
    // ==========================================
    'channel:message': {
        namespace: 'channel',
        action: 'message',
        description: 'Message sent to a specific channel',
        payload: {
            channel: 'string',
            message: 'any',
            sender: 'string?'
        },
        example: {
            channel: 'notepad-sync',
            message: { action: 'update', content: 'Hello' },
            sender: 'notepad-1'
        }
    },

    'channel:subscribe': {
        namespace: 'channel',
        action: 'subscribe',
        description: 'Subscription to a channel',
        payload: {
            channel: 'string',
            subscriber: 'string'
        },
        example: {
            channel: 'notepad-sync',
            subscriber: 'notepad-2'
        }
    },

    'channel:unsubscribe': {
        namespace: 'channel',
        action: 'unsubscribe',
        description: 'Unsubscription from a channel',
        payload: {
            channel: 'string',
            subscriber: 'string'
        },
        example: {
            channel: 'notepad-sync',
            subscriber: 'notepad-2'
        }
    },

    // ==========================================
    // COMMAND EVENTS (for scripting - trigger actions)
    // ==========================================
    'command:app:launch': {
        namespace: 'command',
        action: 'app:launch',
        description: 'Command to launch an application',
        payload: {
            appId: 'string',
            params: 'object?',
            requestId: 'string?'
        },
        example: {
            appId: 'notepad',
            params: { filePath: ['C:', 'Users', 'User', 'readme.txt'] }
        }
    },

    'command:app:close': {
        namespace: 'command',
        action: 'app:close',
        description: 'Command to close an application window',
        payload: {
            windowId: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'notepad-1'
        }
    },

    'command:window:focus': {
        namespace: 'command',
        action: 'window:focus',
        description: 'Command to focus a window',
        payload: {
            windowId: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'notepad-1'
        }
    },

    'command:window:minimize': {
        namespace: 'command',
        action: 'window:minimize',
        description: 'Command to minimize a window',
        payload: {
            windowId: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'notepad-1'
        }
    },

    'command:window:maximize': {
        namespace: 'command',
        action: 'window:maximize',
        description: 'Command to maximize a window',
        payload: {
            windowId: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'notepad-1'
        }
    },

    'command:window:restore': {
        namespace: 'command',
        action: 'window:restore',
        description: 'Command to restore a window from minimized/maximized',
        payload: {
            windowId: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'notepad-1'
        }
    },

    'command:window:close': {
        namespace: 'command',
        action: 'window:close',
        description: 'Command to close a window',
        payload: {
            windowId: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'notepad-1'
        }
    },

    'command:fs:read': {
        namespace: 'command',
        action: 'fs:read',
        description: 'Command to read a file',
        payload: {
            path: 'string',
            requestId: 'string?'
        },
        example: {
            path: 'C:/Users/User/readme.txt'
        }
    },

    'command:fs:write': {
        namespace: 'command',
        action: 'fs:write',
        description: 'Command to write to a file',
        payload: {
            path: 'string',
            content: 'string',
            requestId: 'string?'
        },
        example: {
            path: 'C:/Users/User/newfile.txt',
            content: 'Hello world'
        }
    },

    'command:fs:delete': {
        namespace: 'command',
        action: 'fs:delete',
        description: 'Command to delete a file',
        payload: {
            path: 'string',
            requestId: 'string?'
        },
        example: {
            path: 'C:/Users/User/oldfile.txt'
        }
    },

    'command:fs:mkdir': {
        namespace: 'command',
        action: 'fs:mkdir',
        description: 'Command to create a directory',
        payload: {
            path: 'string',
            requestId: 'string?'
        },
        example: {
            path: 'C:/Users/User/NewFolder'
        }
    },


    'command:fs:reset': {
        namespace: 'command',
        action: 'fs:reset',
        description: 'Command to reset the virtual filesystem to defaults',
        payload: {
            requestId: 'string?'
        },
        example: {}
    },

    'command:dialog:show': {
        namespace: 'command',
        action: 'dialog:show',
        description: 'Command to show a dialog',
        payload: {
            type: 'string',
            message: 'string',
            title: 'string?',
            options: 'object?',
            requestId: 'string?'
        },
        example: {
            type: 'alert',
            message: 'Hello from script!',
            title: 'Script Message'
        }
    },

    'command:sound:play': {
        namespace: 'command',
        action: 'sound:play',
        description: 'Command to play a sound',
        payload: {
            type: 'string',
            volume: 'number?',
            requestId: 'string?'
        },
        example: {
            type: 'notify',
            volume: 0.5
        }
    },

    'command:setting:set': {
        namespace: 'command',
        action: 'setting:set',
        description: 'Command to change a setting',
        payload: {
            key: 'string',
            value: 'any',
            requestId: 'string?'
        },
        example: {
            key: 'sound',
            value: true
        }
    },

    'command:desktop:refresh': {
        namespace: 'command',
        action: 'desktop:refresh',
        description: 'Command to refresh the desktop',
        payload: {
            requestId: 'string?'
        },
        example: {}
    },

    'command:notification:show': {
        namespace: 'command',
        action: 'notification:show',
        description: 'Command to show a notification',
        payload: {
            message: 'string',
            title: 'string?',
            type: 'string?',
            duration: 'number?',
            requestId: 'string?'
        },
        example: {
            message: 'Task completed!',
            title: 'Script',
            type: 'success'
        }
    },

    // ==========================================
    // QUERY EVENTS (for scripting - get state)
    // ==========================================
    'query:windows': {
        namespace: 'query',
        action: 'windows',
        description: 'Query for list of open windows',
        payload: {
            requestId: 'string'
        },
        example: {
            requestId: 'query-123'
        }
    },

    'query:windows:response': {
        namespace: 'query',
        action: 'windows:response',
        description: 'Response with list of open windows',
        payload: {
            requestId: 'string',
            windows: 'array'
        },
        example: {
            requestId: 'query-123',
            windows: [{ id: 'notepad-1', title: 'Notepad', appId: 'notepad' }]
        }
    },

    'query:apps': {
        namespace: 'query',
        action: 'apps',
        description: 'Query for list of available apps',
        payload: {
            requestId: 'string'
        },
        example: {
            requestId: 'query-456'
        }
    },

    'query:apps:response': {
        namespace: 'query',
        action: 'apps:response',
        description: 'Response with list of available apps',
        payload: {
            requestId: 'string',
            apps: 'array'
        },
        example: {
            requestId: 'query-456',
            apps: [{ id: 'notepad', name: 'Notepad', category: 'accessories' }]
        }
    },

    'query:fs:list': {
        namespace: 'query',
        action: 'fs:list',
        description: 'Query directory listing',
        payload: {
            path: 'string',
            requestId: 'string'
        },
        example: {
            path: 'C:/Users/User',
            requestId: 'query-789'
        }
    },

    'query:fs:list:response': {
        namespace: 'query',
        action: 'fs:list:response',
        description: 'Response with directory listing',
        payload: {
            requestId: 'string',
            items: 'array',
            path: 'string'
        },
        example: {
            requestId: 'query-789',
            path: 'C:/Users/User',
            items: [{ name: 'Documents', type: 'directory' }]
        }
    },

    'query:fs:read': {
        namespace: 'query',
        action: 'fs:read',
        description: 'Query to read file contents',
        payload: {
            path: 'string',
            requestId: 'string'
        },
        example: {
            path: 'C:/Users/User/readme.txt',
            requestId: 'query-abc'
        }
    },

    'query:fs:read:response': {
        namespace: 'query',
        action: 'fs:read:response',
        description: 'Response with file contents',
        payload: {
            requestId: 'string',
            content: 'string',
            path: 'string',
            error: 'string?'
        },
        example: {
            requestId: 'query-abc',
            path: 'C:/Users/User/readme.txt',
            content: 'File content here'
        }
    },

    'query:fs:exists': {
        namespace: 'query',
        action: 'fs:exists',
        description: 'Query if a path exists',
        payload: {
            path: 'string',
            requestId: 'string'
        },
        example: {
            path: 'C:/Users/User/readme.txt',
            requestId: 'query-def'
        }
    },

    'query:fs:exists:response': {
        namespace: 'query',
        action: 'fs:exists:response',
        description: 'Response with existence check',
        payload: {
            requestId: 'string',
            exists: 'boolean',
            path: 'string',
            type: 'string?'
        },
        example: {
            requestId: 'query-def',
            path: 'C:/Users/User/readme.txt',
            exists: true,
            type: 'file'
        }
    },


    'query:fs:tree': {
        namespace: 'query',
        action: 'fs:tree',
        description: 'Query the full virtual filesystem tree',
        payload: {
            requestId: 'string'
        },
        example: {
            requestId: 'query-fs-tree'
        }
    },

    'query:fs:tree:response': {
        namespace: 'query',
        action: 'fs:tree:response',
        description: 'Response with the full virtual filesystem tree',
        payload: {
            requestId: 'string',
            filesystem: 'object'
        },
        example: {
            requestId: 'query-fs-tree',
            filesystem: { drives: [] }
        }
    },

    'query:fs:desktop': {
        namespace: 'query',
        action: 'fs:desktop',
        description: 'Query desktop-resolved filesystem items',
        payload: {
            requestId: 'string'
        },
        example: {
            requestId: 'query-fs-desktop'
        }
    },

    'query:fs:desktop:response': {
        namespace: 'query',
        action: 'fs:desktop:response',
        description: 'Response with desktop filesystem items',
        payload: {
            requestId: 'string',
            items: 'array'
        },
        example: {
            requestId: 'query-fs-desktop',
            items: [{ name: 'My Computer', type: 'directory' }]
        }
    },

    'query:settings': {
        namespace: 'query',
        action: 'settings',
        description: 'Query current settings',
        payload: {
            key: 'string?',
            requestId: 'string'
        },
        example: {
            key: 'sound',
            requestId: 'query-ghi'
        }
    },

    'query:settings:response': {
        namespace: 'query',
        action: 'settings:response',
        description: 'Response with settings values',
        payload: {
            requestId: 'string',
            settings: 'object'
        },
        example: {
            requestId: 'query-ghi',
            settings: { sound: true, crt: false }
        }
    },

    'query:state': {
        namespace: 'query',
        action: 'state',
        description: 'Query system state by path',
        payload: {
            path: 'string',
            requestId: 'string'
        },
        example: {
            path: 'windows',
            requestId: 'query-jkl'
        }
    },

    'query:state:response': {
        namespace: 'query',
        action: 'state:response',
        description: 'Response with state value',
        payload: {
            requestId: 'string',
            path: 'string',
            value: 'any'
        },
        example: {
            requestId: 'query-jkl',
            path: 'windows',
            value: []
        }
    },

    // ==========================================
    // ACTION RESULT EVENTS (for scripting - command responses)
    // ==========================================
    'action:result': {
        namespace: 'action',
        action: 'result',
        description: 'Result of a command action',
        payload: {
            requestId: 'string',
            success: 'boolean',
            data: 'any?',
            error: 'string?'
        },
        example: {
            requestId: 'cmd-123',
            success: true,
            data: { windowId: 'notepad-1' }
        }
    },

    // ==========================================
    // MACRO/AUTOMATION EVENTS
    // ==========================================
    'macro:record:start': {
        namespace: 'macro',
        action: 'record:start',
        description: 'Start recording a macro',
        payload: {
            macroId: 'string?'
        },
        example: {
            macroId: 'my-macro'
        }
    },

    'macro:record:stop': {
        namespace: 'macro',
        action: 'record:stop',
        description: 'Stop recording a macro',
        payload: {},
        example: {}
    },

    'macro:play': {
        namespace: 'macro',
        action: 'play',
        description: 'Play a recorded macro',
        payload: {
            macroId: 'string',
            speed: 'number?'
        },
        example: {
            macroId: 'my-macro',
            speed: 1.0
        }
    },

    'macro:save': {
        namespace: 'macro',
        action: 'save',
        description: 'Save a macro to storage',
        payload: {
            macroId: 'string',
            events: 'array'
        },
        example: {
            macroId: 'my-macro',
            events: []
        }
    },

    // ==========================================
    // APP-SPECIFIC COMMAND EVENTS
    // ==========================================
    'command:notepad:new': {
        namespace: 'command',
        action: 'notepad:new',
        description: 'Command to create a new document in Notepad',
        payload: {
            windowId: 'string?',
            requestId: 'string?'
        },
        example: {
            windowId: 'notepad-1'
        }
    },

    'command:notepad:open': {
        namespace: 'command',
        action: 'notepad:open',
        description: 'Command to open a file in Notepad',
        payload: {
            windowId: 'string?',
            path: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'notepad-1',
            path: 'C:/Users/User/readme.txt'
        }
    },

    'command:notepad:save': {
        namespace: 'command',
        action: 'notepad:save',
        description: 'Command to save current document in Notepad',
        payload: {
            windowId: 'string?',
            path: 'string?',
            requestId: 'string?'
        },
        example: {
            windowId: 'notepad-1',
            path: 'C:/Users/User/saved.txt'
        }
    },

    'command:notepad:setText': {
        namespace: 'command',
        action: 'notepad:setText',
        description: 'Command to set text content in Notepad',
        payload: {
            windowId: 'string?',
            text: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'notepad-1',
            text: 'Hello from script!'
        }
    },

    'query:notepad:getText': {
        namespace: 'query',
        action: 'notepad:getText',
        description: 'Query to get current text from Notepad',
        payload: {
            windowId: 'string?',
            requestId: 'string'
        },
        example: {
            windowId: 'notepad-1',
            requestId: 'query-notepad-1'
        }
    },

    'query:notepad:getText:response': {
        namespace: 'query',
        action: 'notepad:getText:response',
        description: 'Response with Notepad text content',
        payload: {
            requestId: 'string',
            text: 'string',
            windowId: 'string'
        },
        example: {
            requestId: 'query-notepad-1',
            windowId: 'notepad-1',
            text: 'Document content'
        }
    },

    'command:calculator:clear': {
        namespace: 'command',
        action: 'calculator:clear',
        description: 'Command to clear Calculator',
        payload: {
            windowId: 'string?',
            requestId: 'string?'
        },
        example: {
            windowId: 'calculator-1'
        }
    },

    'command:calculator:input': {
        namespace: 'command',
        action: 'calculator:input',
        description: 'Command to input value/operator to Calculator',
        payload: {
            windowId: 'string?',
            value: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'calculator-1',
            value: '5'
        }
    },

    'query:calculator:getValue': {
        namespace: 'query',
        action: 'calculator:getValue',
        description: 'Query Calculator display value',
        payload: {
            windowId: 'string?',
            requestId: 'string'
        },
        example: {
            windowId: 'calculator-1',
            requestId: 'query-calc-1'
        }
    },

    'command:terminal:execute': {
        namespace: 'command',
        action: 'terminal:execute',
        description: 'Command to execute a terminal command',
        payload: {
            windowId: 'string?',
            command: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'terminal-1',
            command: 'dir'
        }
    },

    'command:browser:navigate': {
        namespace: 'command',
        action: 'browser:navigate',
        description: 'Command to navigate Browser to URL',
        payload: {
            windowId: 'string?',
            url: 'string',
            requestId: 'string?'
        },
        example: {
            windowId: 'browser-1',
            url: 'https://example.com'
        }
    },

    // ==========================================
    // TIMER/SCHEDULE EVENTS (for scripting)
    // ==========================================
    'timer:set': {
        namespace: 'timer',
        action: 'set',
        description: 'Set a timer to fire an event',
        payload: {
            timerId: 'string',
            delay: 'number',
            event: 'string',
            payload: 'object?',
            repeat: 'boolean?'
        },
        example: {
            timerId: 'my-timer',
            delay: 5000,
            event: 'custom:timer-fired',
            repeat: false
        }
    },

    'timer:clear': {
        namespace: 'timer',
        action: 'clear',
        description: 'Clear a timer',
        payload: {
            timerId: 'string'
        },
        example: {
            timerId: 'my-timer'
        }
    },

    'timer:fired': {
        namespace: 'timer',
        action: 'fired',
        description: 'Timer has fired',
        payload: {
            timerId: 'string'
        },
        example: {
            timerId: 'my-timer'
        }
    },

    // ==========================================
    // SCRIPT EVENTS (Extended)
    // ==========================================
    'script:start': {
        namespace: 'script',
        action: 'start',
        description: 'Script execution starting',
        payload: {
            scriptId: 'string',
            source: 'string?',
            params: 'object?'
        },
        example: {
            scriptId: 'startup-script',
            source: 'file',
            params: {}
        }
    },

    'script:statement': {
        namespace: 'script',
        action: 'statement',
        description: 'Script statement executed',
        payload: {
            scriptId: 'string',
            line: 'number',
            statement: 'string',
            result: 'any?'
        },
        example: {
            scriptId: 'my-script',
            line: 5,
            statement: 'launch notepad',
            result: { windowId: 'notepad-1' }
        }
    },

    'script:variable:set': {
        namespace: 'script',
        action: 'variable:set',
        description: 'Script variable set',
        payload: {
            scriptId: 'string',
            name: 'string',
            value: 'any',
            type: 'string?'
        },
        example: {
            scriptId: 'my-script',
            name: '$counter',
            value: 10,
            type: 'number'
        }
    },

    'script:function:call': {
        namespace: 'script',
        action: 'function:call',
        description: 'Script function called',
        payload: {
            scriptId: 'string',
            functionName: 'string',
            args: 'array?',
            result: 'any?'
        },
        example: {
            scriptId: 'my-script',
            functionName: 'add',
            args: [5, 3],
            result: 8
        }
    },

    'script:event:subscribe': {
        namespace: 'script',
        action: 'event:subscribe',
        description: 'Script subscribed to event',
        payload: {
            scriptId: 'string',
            eventName: 'string'
        },
        example: {
            scriptId: 'my-script',
            eventName: 'window:open'
        }
    },

    'script:event:emit': {
        namespace: 'script',
        action: 'event:emit',
        description: 'Script emitted event',
        payload: {
            scriptId: 'string',
            eventName: 'string',
            payload: 'object?'
        },
        example: {
            scriptId: 'my-script',
            eventName: 'custom:my-event',
            payload: { data: 'test' }
        }
    },

    // ==========================================
    // TIMER CONTROL EVENTS (Phase 4)
    // ==========================================

    // ==========================================
    // MESSAGING COMMAND EVENTS (Diegetic Channels)
    // ==========================================
    'command:inbox:receive': {
        namespace: 'command',
        action: 'inbox:receive',
        description: 'Command to deliver a message to the in-game inbox',
        payload: {
            from: 'string',
            subject: 'string',
            body: 'string',
            attachments: 'array?',
            priority: 'string?',
            timestamp: 'number'
        },
        example: {
            from: 'system@illuminatos.local',
            subject: 'Welcome',
            body: 'Welcome to IlluminatOS',
            attachments: [],
            priority: 'normal',
            timestamp: 1709654400000
        }
    },

    'command:instant-messenger:receive': {
        namespace: 'command',
        action: 'instant-messenger:receive',
        description: 'Command to deliver an instant message from an NPC',
        payload: {
            from: 'string',
            message: 'string',
            npcId: 'string?',
            avatar: 'string?',
            timestamp: 'number'
        },
        example: {
            from: 'Agent Smith',
            message: 'Meet me at the terminal.',
            npcId: 'smith',
            avatar: null,
            timestamp: 1709654400000
        }
    },

    'command:instant-messenger:typing': {
        namespace: 'command',
        action: 'instant-messenger:typing',
        description: 'Command to show typing indicator for an NPC',
        payload: {
            npcId: 'string',
            durationMs: 'number'
        },
        example: {
            npcId: 'smith',
            durationMs: 3000
        }
    },

    'command:phone:voicemail': {
        namespace: 'command',
        action: 'phone:voicemail',
        description: 'Command to deliver a voicemail message',
        payload: {
            from: 'string',
            message: 'string',
            audioSrc: 'string?',
            timestamp: 'number'
        },
        example: {
            from: 'Unknown',
            message: 'You have a new voicemail.',
            audioSrc: 'assets/audio/voicemail.mp3',
            timestamp: 1709654400000
        }
    },

    'command:phone:incoming': {
        namespace: 'command',
        action: 'phone:incoming',
        description: 'Command to trigger an incoming phone call',
        payload: {
            callerId: 'string',
            routeId: 'string?',
            script: 'array?',
            timestamp: 'number'
        },
        example: {
            callerId: 'Agent Smith',
            routeId: 'route-1',
            script: [],
            timestamp: 1709654400000
        }
    },

    'command:browser:inject': {
        namespace: 'command',
        action: 'browser:inject',
        description: 'Command to inject HTML content into the in-game browser',
        payload: {
            pageId: 'string',
            fragmentId: 'string',
            html: 'string',
            timestamp: 'number'
        },
        example: {
            pageId: 'default',
            fragmentId: 'frag-001',
            html: '<p>Injected content</p>',
            timestamp: 1709654400000
        }
    },

    // ==========================================
    // CAMPAIGN COMMAND EVENTS
    // ==========================================
    'command:campaign:install': {
        namespace: 'command',
        action: 'campaign:install',
        description: 'Command to install a campaign package',
        payload: {
            packageData: 'object',
            requestId: 'string?'
        },
        example: {
            packageData: { id: 'erebus-v65', name: 'Project Erebus' },
            requestId: 'cs-import-1709654400000'
        }
    },

    'command:campaign:uninstall': {
        namespace: 'command',
        action: 'campaign:uninstall',
        description: 'Command to uninstall a campaign',
        payload: {
            campaignId: 'string',
            requestId: 'string?'
        },
        example: {
            campaignId: 'erebus-v65',
            requestId: 'cs-uninstall-1709654400000'
        }
    },

    'command:campaign:enable': {
        namespace: 'command',
        action: 'campaign:enable',
        description: 'Command to enable a campaign for playback',
        payload: {
            campaignId: 'string',
            requestId: 'string?'
        },
        example: {
            campaignId: 'erebus-v65',
            requestId: 'cs-enable-1709654400000'
        }
    },

    'command:campaign:disable': {
        namespace: 'command',
        action: 'campaign:disable',
        description: 'Command to disable a campaign',
        payload: {
            campaignId: 'string',
            requestId: 'string?'
        },
        example: {
            campaignId: 'erebus-v65',
            requestId: 'cs-disable-1709654400000'
        }
    },

    'command:campaign:validate': {
        namespace: 'command',
        action: 'campaign:validate',
        description: 'Command to validate a campaign package',
        payload: {
            campaignId: 'string?',
            packageData: 'object?',
            requestId: 'string?'
        },
        example: {
            campaignId: 'erebus-v65',
            requestId: 'cs-validate-1709654400000'
        }
    },

    // ==========================================
    // CAMPAIGN QUERY EVENTS
    // ==========================================
    'query:campaign:list': {
        namespace: 'query',
        action: 'campaign:list',
        description: 'Query for list of installed campaigns',
        payload: {
            requestId: 'string'
        },
        example: {
            requestId: 'query-campaigns-123'
        }
    },

    'query:campaign:list:response': {
        namespace: 'query',
        action: 'campaign:list:response',
        description: 'Response with list of installed campaigns',
        payload: {
            requestId: 'string',
            campaigns: 'array'
        },
        example: {
            requestId: 'query-campaigns-123',
            campaigns: [{ id: 'erebus-v65', name: 'Project Erebus' }]
        }
    },

    'query:campaign:get': {
        namespace: 'query',
        action: 'campaign:get',
        description: 'Query for a specific campaign by ID',
        payload: {
            campaignId: 'string',
            requestId: 'string'
        },
        example: {
            campaignId: 'erebus-v65',
            requestId: 'query-campaign-123'
        }
    },

    'query:campaign:get:response': {
        namespace: 'query',
        action: 'campaign:get:response',
        description: 'Response with campaign data',
        payload: {
            requestId: 'string',
            campaign: 'object?'
        },
        example: {
            requestId: 'query-campaign-123',
            campaign: { id: 'erebus-v65', name: 'Project Erebus' }
        }
    },

    // ==========================================
    // CONTENT TEMPLATE QUERY EVENTS
    // ==========================================
    'query:content:template': {
        namespace: 'query',
        action: 'content:template',
        description: 'Query for a content template by ID',
        payload: {
            templateId: 'string',
            requestId: 'string'
        },
        example: {
            templateId: 'briefing-001',
            requestId: 'query-template-123'
        }
    },

    'query:content:template:response': {
        namespace: 'query',
        action: 'content:template:response',
        description: 'Response with content template data',
        payload: {
            requestId: 'string',
            template: 'object?'
        },
        example: {
            requestId: 'query-template-123',
            template: { id: 'briefing-001', channel: 'inbox' }
        }
    },

    'query:content:list': {
        namespace: 'query',
        action: 'content:list',
        description: 'Query for list of content templates, optionally filtered by channel',
        payload: {
            channel: 'string?',
            requestId: 'string'
        },
        example: {
            channel: 'inbox',
            requestId: 'query-content-list-123'
        }
    },

    'query:content:list:response': {
        namespace: 'query',
        action: 'content:list:response',
        description: 'Response with list of content templates',
        payload: {
            requestId: 'string',
            templates: 'array'
        },
        example: {
            requestId: 'query-content-list-123',
            templates: [{ id: 'briefing-001', channel: 'inbox' }]
        }
    },

    'query:content:history': {
        namespace: 'query',
        action: 'content:history',
        description: 'Query for content delivery history log',
        payload: {
            requestId: 'string'
        },
        example: {
            requestId: 'query-content-history-123'
        }
    },

    'query:content:history:response': {
        namespace: 'query',
        action: 'content:history:response',
        description: 'Response with content delivery history',
        payload: {
            requestId: 'string',
            history: 'array'
        },
        example: {
            requestId: 'query-content-history-123',
            history: [{ templateId: 'briefing-001', deliveredAt: 1709654400000 }]
        }
    },

    'story:timers:pause': {
        namespace: 'story',
        action: 'timers:pause',
        description: 'All campaign timers paused by operator',
        payload: {
            timestamp: 'number',
            _operatorAction: 'boolean?'
        },
        example: { timestamp: 1709654400000, _operatorAction: true }
    },

    'story:timers:resume': {
        namespace: 'story',
        action: 'timers:resume',
        description: 'All campaign timers resumed by operator',
        payload: {
            timestamp: 'number',
            _operatorAction: 'boolean?'
        },
        example: { timestamp: 1709654400000, _operatorAction: true }
    },
};
