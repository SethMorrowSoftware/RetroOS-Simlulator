/**
 * Network event schemas
 * Auto-split from core/EventSchema.js
 */

export const networkEvents = {
    // ==========================================
    // NETWORK EVENTS
    // ==========================================
    'network:request': {
        namespace: 'network',
        action: 'request',
        description: 'Network request initiated',
        payload: {
            id: 'string',
            url: 'string',
            method: 'string',
            headers: 'object?'
        },
        example: {
            id: 'req-1',
            url: 'https://api.example.com/data',
            method: 'GET'
        }
    },

    'network:response': {
        namespace: 'network',
        action: 'response',
        description: 'Network response received',
        payload: {
            id: 'string',
            url: 'string',
            status: 'number',
            duration: 'number',
            size: 'number?'
        },
        example: {
            id: 'req-1',
            url: 'https://api.example.com/data',
            status: 200,
            duration: 150,
            size: 1024
        }
    },

    'network:error': {
        namespace: 'network',
        action: 'error',
        description: 'Network request failed',
        payload: {
            id: 'string',
            url: 'string',
            error: 'string',
            status: 'number?'
        },
        example: {
            id: 'req-1',
            url: 'https://api.example.com/data',
            error: 'Connection refused'
        }
    },

    // ==========================================
    // PERFORMANCE EVENTS
    // ==========================================
    'perf:fps': {
        namespace: 'perf',
        action: 'fps',
        description: 'FPS update',
        payload: {
            fps: 'number',
            frameTime: 'number?'
        },
        example: {
            fps: 60,
            frameTime: 16.67
        }
    },

    'perf:fps:low': {
        namespace: 'perf',
        action: 'fps:low',
        description: 'FPS dropped below threshold',
        payload: {
            fps: 'number',
            threshold: 'number'
        },
        example: {
            fps: 15,
            threshold: 30
        }
    },

    'perf:memory': {
        namespace: 'perf',
        action: 'memory',
        description: 'Memory usage update',
        payload: {
            usedJSHeapSize: 'number',
            totalJSHeapSize: 'number',
            jsHeapSizeLimit: 'number?'
        },
        example: {
            usedJSHeapSize: 50000000,
            totalJSHeapSize: 100000000,
            jsHeapSizeLimit: 2000000000
        }
    },

    'perf:longtask': {
        namespace: 'perf',
        action: 'longtask',
        description: 'Long task detected (blocking main thread)',
        payload: {
            duration: 'number',
            startTime: 'number',
            source: 'string?'
        },
        example: {
            duration: 150,
            startTime: 1234567890,
            source: 'script-execution'
        }
    },

    'perf:measure': {
        namespace: 'perf',
        action: 'measure',
        description: 'Performance measurement recorded',
        payload: {
            name: 'string',
            duration: 'number',
            startMark: 'string?',
            endMark: 'string?'
        },
        example: {
            name: 'app-launch-notepad',
            duration: 45,
            startMark: 'launch-start',
            endMark: 'launch-end'
        }
    },

    // ==========================================
    // DEBUG EVENTS
    // ==========================================
    'debug:log': {
        namespace: 'debug',
        action: 'log',
        description: 'Debug log message',
        payload: {
            level: 'string',
            message: 'string',
            source: 'string?',
            data: 'any?'
        },
        example: {
            level: 'info',
            message: 'App initialized',
            source: 'notepad'
        }
    },

    'debug:breakpoint': {
        namespace: 'debug',
        action: 'breakpoint',
        description: 'Script breakpoint hit',
        payload: {
            scriptId: 'string',
            line: 'number',
            variables: 'object?'
        },
        example: {
            scriptId: 'my-script',
            line: 15,
            variables: { x: 5, y: 10 }
        }
    },

    'debug:step': {
        namespace: 'debug',
        action: 'step',
        description: 'Script debug step',
        payload: {
            scriptId: 'string',
            line: 'number',
            statement: 'string?'
        },
        example: {
            scriptId: 'my-script',
            line: 16,
            statement: 'set $x = 10'
        }
    },

    'debug:variable:change': {
        namespace: 'debug',
        action: 'variable:change',
        description: 'Script variable changed (debug mode)',
        payload: {
            scriptId: 'string',
            name: 'string',
            value: 'any',
            oldValue: 'any?'
        },
        example: {
            scriptId: 'my-script',
            name: '$counter',
            value: 5,
            oldValue: 4
        }
    },

    // ==========================================
    // USER EVENTS
    // ==========================================
    'user:action': {
        namespace: 'user',
        action: 'action',
        description: 'Generic user action for analytics',
        payload: {
            actionType: 'string',
            target: 'string?',
            data: 'any?'
        },
        example: {
            actionType: 'button_click',
            target: 'save-button',
            data: { appId: 'notepad' }
        }
    },

    'user:preference:change': {
        namespace: 'user',
        action: 'preference:change',
        description: 'User preference changed',
        payload: {
            key: 'string',
            value: 'any',
            oldValue: 'any?'
        },
        example: {
            key: 'theme',
            value: 'dark',
            oldValue: 'light'
        }
    },

    // ==========================================
    // SESSION EVENTS
    // ==========================================
    'session:start': {
        namespace: 'session',
        action: 'start',
        description: 'Session started',
        payload: {
            sessionId: 'string',
            timestamp: 'number'
        },
        example: {
            sessionId: 'sess-12345',
            timestamp: 1234567890
        }
    },

    'session:end': {
        namespace: 'session',
        action: 'end',
        description: 'Session ended',
        payload: {
            sessionId: 'string',
            duration: 'number',
            reason: 'string?'
        },
        example: {
            sessionId: 'sess-12345',
            duration: 3600000,
            reason: 'user_closed'
        }
    },

    'session:activity': {
        namespace: 'session',
        action: 'activity',
        description: 'Session activity recorded',
        payload: {
            sessionId: 'string',
            activity: 'string',
            timestamp: 'number'
        },
        example: {
            sessionId: 'sess-12345',
            activity: 'app_launch',
            timestamp: 1234567890
        }
    },

    // ==========================================
    // SERVER-SENT EVENTS (SSE)
    // ==========================================
    'sse:announcement.updated': {
        namespace: 'sse',
        action: 'announcement.updated',
        description: 'SSE event: an announcement was created or updated on the server',
        payload: {
            id: 'number?',
            title: 'string?',
            message: 'string?'
        },
        example: {
            id: 42,
            title: 'Maintenance',
            message: 'Servers will restart at midnight.'
        }
    },

    'sse:announcement.deleted': {
        namespace: 'sse',
        action: 'announcement.deleted',
        description: 'SSE event: an announcement was removed from the server',
        payload: {
            id: 'number?'
        },
        example: {
            id: 42
        }
    },

    'sse:system.app.launch': {
        namespace: 'sse',
        action: 'system.app.launch',
        description: 'SSE event: remote command to launch an application',
        payload: {
            app_id: 'string',
            params: 'object?'
        },
        example: {
            app_id: 'notepad',
            params: { filePath: ['C:', 'Users', 'User', 'readme.txt'] }
        }
    },

    'sse:system.filesystem.command': {
        namespace: 'sse',
        action: 'system.filesystem.command',
        description: 'SSE event: remote filesystem operation command',
        payload: {
            operation: 'string',
            path: 'string',
            content: 'string?',
            recursive: 'boolean?'
        },
        example: {
            operation: 'write_file',
            path: 'C:/Users/User/remote.txt',
            content: 'Written remotely',
            recursive: false
        }
    },

    'sse:system.default_filesystem.updated': {
        namespace: 'sse',
        action: 'system.default_filesystem.updated',
        description: 'SSE event: admin updated the default filesystem configuration',
        payload: {},
        example: {}
    },

    'sse:system.dialog': {
        namespace: 'sse',
        action: 'system.dialog',
        description: 'SSE event: admin sends a dialog (alert/confirm/prompt) to all clients',
        payload: {
            type: 'string',
            title: 'string?',
            message: 'string',
            icon: 'string?',
            defaultValue: 'string?'
        },
        example: {
            type: 'alert',
            title: 'System Message',
            message: 'Server maintenance in 10 minutes.',
            icon: '⚠️'
        }
    },

    'sse:system.notification': {
        namespace: 'sse',
        action: 'system.notification',
        description: 'SSE event: admin sends a toast notification to all clients',
        payload: {
            type: 'string?',
            title: 'string?',
            message: 'string?',
            icon: 'string?',
            duration: 'number?',
            position: 'string?'
        },
        example: {
            type: 'info',
            title: 'Update',
            message: 'New features available!',
            duration: 5000,
            position: 'top-right'
        }
    },

    'sse:system.sound': {
        namespace: 'sse',
        action: 'system.sound',
        description: 'SSE event: admin triggers a sound effect on all clients',
        payload: {
            sound: 'string',
            volume: 'number?'
        },
        example: {
            sound: 'notify',
            volume: 0.5
        }
    },

    'sse:system.effect': {
        namespace: 'sse',
        action: 'system.effect',
        description: 'SSE event: admin triggers a visual effect on all clients',
        payload: {
            effect: 'string'
        },
        example: {
            effect: 'shake'
        }
    },

    'sse:narrative.story.advance': {
        namespace: 'sse',
        action: 'narrative.story.advance',
        description: 'SSE event: advance the narrative to the next chapter or beat',
        payload: {
            title: 'string?',
            message: 'string?',
            chapterId: 'string?'
        },
        example: {
            title: 'Chapter 2',
            message: 'The system awakens...',
            chapterId: 'chapter_2'
        }
    },

    'sse:narrative.mood.shift': {
        namespace: 'sse',
        action: 'narrative.mood.shift',
        description: 'SSE event: change the ambient mood/atmosphere',
        payload: {
            mood: 'string',
            intensity: 'number?'
        },
        example: {
            mood: 'mysterious',
            intensity: 0.8
        }
    },

    'sse:narrative.character.speak': {
        namespace: 'sse',
        action: 'narrative.character.speak',
        description: 'SSE event: have a character say something via dialog',
        payload: {
            characterName: 'string?',
            characterIcon: 'string?',
            message: 'string?'
        },
        example: {
            characterName: 'Clippy',
            characterIcon: '📎',
            message: 'It looks like you are trying to escape...'
        }
    },

    'sse:theme.updated': {
        namespace: 'sse',
        action: 'theme.updated',
        description: 'SSE event: a theme was modified on the server',
        payload: {
            theme_id: 'number',
            changes: 'array?'
        },
        example: {
            theme_id: 3,
            changes: ['name', 'data']
        }
    },
};
