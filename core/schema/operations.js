/**
 * Operations event schemas
 * Auto-split from core/EventSchema.js
 */

export const operationsEvents = {
    // ==========================================
    // ADDITIONAL OPERATIONAL EVENTS
    // ==========================================

    'app:close:error': {
        namespace: 'app',
        action: 'close:error',
        description: 'Error occurred while closing an application',
        payload: { appId: 'string', error: 'string' },
        example: { appId: 'notepad', error: 'Failed to save before closing' }
    },

    'autoexec:start': {
        namespace: 'autoexec',
        action: 'start',
        description: 'Autoexec script execution started',
        payload: { scriptPath: 'string?' },
        example: { scriptPath: 'C:/autoexec.retro' }
    },

    'autoexec:complete': {
        namespace: 'autoexec',
        action: 'complete',
        description: 'Autoexec script execution completed',
        payload: { scriptPath: 'string?', success: 'boolean?' },
        example: { scriptPath: 'C:/autoexec.retro', success: true }
    },

    'autoexec:error': {
        namespace: 'autoexec',
        action: 'error',
        description: 'Autoexec script execution failed',
        payload: { scriptPath: 'string?', error: 'string' },
        example: { scriptPath: 'C:/autoexec.retro', error: 'Syntax error on line 5' }
    },

    'browser:navigated': {
        namespace: 'browser',
        action: 'navigated',
        description: 'Browser finished navigating to a URL',
        payload: { url: 'string' },
        example: { url: 'https://example.com' }
    },

    'bsod:trigger': {
        namespace: 'bsod',
        action: 'trigger',
        description: 'Trigger Blue Screen of Death display',
        payload: { message: 'string?' },
        example: { message: 'FATAL_ERROR' }
    },

    'clipboard:changed': {
        namespace: 'clipboard',
        action: 'changed',
        description: 'Clipboard content changed (copy or cut)',
        payload: { items: 'object?', source: 'string?' },
        example: { items: [{ path: 'C:/file.txt' }], source: 'mycomputer' }
    },

    'clipboard:cut-state': {
        namespace: 'clipboard',
        action: 'cut-state',
        description: 'Clipboard cut state changed (items pending move)',
        payload: { paths: 'object?', active: 'boolean?' },
        example: { paths: ['C:/file.txt'], active: true }
    },

    'feature:dependency-failed': {
        namespace: 'feature',
        action: 'dependency-failed',
        description: 'Feature skipped because a dependency failed to initialize',
        payload: { featureId: 'string', failedDependencies: 'object' },
        example: { featureId: 'clippy', failedDependencies: ['sound-system'] }
    },

    'feature:unregistered': {
        namespace: 'feature',
        action: 'unregistered',
        description: 'Feature removed from the registry (plugin unload)',
        payload: { featureId: 'string', name: 'string' },
        example: { featureId: 'dvd-bouncer', name: 'DVD Bouncer' }
    },

    'filesystem:directory:changed': {
        namespace: 'filesystem',
        action: 'directory:changed',
        description: 'Directory contents changed (file added/removed/renamed). Optional `source` identifies the writer so reconcilers can skip events they originated.',
        payload: { path: 'string', source: 'string?' },
        example: { path: 'C:/Users/Desktop' }
    },

    'filesystem:file:changed': {
        namespace: 'filesystem',
        action: 'file:changed',
        description: 'File content or metadata changed',
        payload: { path: 'string', source: 'string?' },
        example: { path: 'C:/Users/Desktop/notes.txt' }
    },

    'fs:directory:move': {
        namespace: 'fs',
        action: 'directory:move',
        description: 'Directory moved from one location to another',
        payload: { sourcePath: 'string', destPath: 'string', fileName: 'string', itemType: 'string' },
        example: { sourcePath: 'C:/old/folder', destPath: 'C:/new/folder', fileName: 'folder', itemType: 'directory' }
    },

    'fs:directory:copy': {
        namespace: 'fs',
        action: 'directory:copy',
        description: 'Directory copied to another location',
        payload: { sourcePath: 'string', destPath: 'string', fileName: 'string', itemType: 'string' },
        example: { sourcePath: 'C:/old/folder', destPath: 'C:/new/folder', fileName: 'folder', itemType: 'directory' }
    },

    'macro:recording': {
        namespace: 'macro',
        action: 'recording',
        description: 'Macro recording state changed',
        payload: { macroId: 'string', started: 'boolean' },
        example: { macroId: 'macro_1', started: true }
    },

    'macro:recorded': {
        namespace: 'macro',
        action: 'recorded',
        description: 'Macro recording completed and saved',
        payload: { macroId: 'string', eventCount: 'number' },
        example: { macroId: 'macro_1', eventCount: 5 }
    },

    'macro:playing': {
        namespace: 'macro',
        action: 'playing',
        description: 'Macro playback started',
        payload: { macroId: 'string', eventCount: 'number' },
        example: { macroId: 'macro_1', eventCount: 5 }
    },

    'macro:complete': {
        namespace: 'macro',
        action: 'complete',
        description: 'Macro playback finished',
        payload: { macroId: 'string' },
        example: { macroId: 'macro_1' }
    },

    'mediaplayer:play': {
        namespace: 'mediaplayer',
        action: 'play',
        description: 'Media player started playback',
        payload: { track: 'string?', index: 'number?' },
        example: { track: 'song.mp3', index: 0 }
    },

    'mediaplayer:pause': {
        namespace: 'mediaplayer',
        action: 'pause',
        description: 'Media player paused',
        payload: {},
        example: {}
    },

    'mediaplayer:stop': {
        namespace: 'mediaplayer',
        action: 'stop',
        description: 'Media player stopped',
        payload: {},
        example: {}
    },

    'mediaplayer:volume:changed': {
        namespace: 'mediaplayer',
        action: 'volume:changed',
        description: 'Media player volume changed',
        payload: { volume: 'number' },
        example: { volume: 0.75 }
    },

    'mycomputer:navigate': {
        namespace: 'mycomputer',
        action: 'navigate',
        description: 'Request to navigate My Computer to a path',
        payload: { path: 'string', windowId: 'string?' },
        example: { path: 'C:/Users/Desktop' }
    },

    'mycomputer:navigated': {
        namespace: 'mycomputer',
        action: 'navigated',
        description: 'My Computer finished navigating to a path',
        payload: { path: 'string', windowId: 'string?' },
        example: { path: 'C:/Users/Desktop' }
    },

    'mycomputer:deleted': {
        namespace: 'mycomputer',
        action: 'deleted',
        description: 'Item deleted from My Computer',
        payload: { path: 'string', name: 'string?' },
        example: { path: 'C:/file.txt', name: 'file.txt' }
    },

    'mycomputer:folder:created': {
        namespace: 'mycomputer',
        action: 'folder:created',
        description: 'New folder created in My Computer',
        payload: { path: 'string', name: 'string?' },
        example: { path: 'C:/New Folder', name: 'New Folder' }
    },

    'mycomputer:renamed': {
        namespace: 'mycomputer',
        action: 'renamed',
        description: 'Item renamed in My Computer',
        payload: { path: 'string', oldName: 'string?', newName: 'string?' },
        example: { path: 'C:/file.txt', oldName: 'old.txt', newName: 'new.txt' }
    },

    'paint:tool:changed': {
        namespace: 'paint',
        action: 'tool:changed',
        description: 'Paint tool selection changed',
        payload: { tool: 'string' },
        example: { tool: 'brush' }
    },

    'paint:color:changed': {
        namespace: 'paint',
        action: 'color:changed',
        description: 'Paint color changed',
        payload: { color: 'string' },
        example: { color: '#ff0000' }
    },

    'paint:brushSize:changed': {
        namespace: 'paint',
        action: 'brushSize:changed',
        description: 'Paint brush size changed',
        payload: { size: 'number' },
        example: { size: 5 }
    },

    'paint:canvas:cleared': {
        namespace: 'paint',
        action: 'canvas:cleared',
        description: 'Paint canvas cleared',
        payload: {},
        example: {}
    },

    'pet:toggle': {
        namespace: 'pet',
        action: 'toggle',
        description: 'Desktop pet visibility toggled',
        payload: { visible: 'boolean?' },
        example: { visible: true }
    },

    'pet:change': {
        namespace: 'pet',
        action: 'change',
        description: 'Desktop pet type changed',
        payload: { petType: 'string?' },
        example: { petType: 'cat' }
    },

    'plugin:unloaded': {
        namespace: 'plugin',
        action: 'unloaded',
        description: 'Plugin unloaded and cleaned up',
        payload: { id: 'string' },
        example: { id: 'dvd-bouncer' }
    },

    'taskbar:update': {
        namespace: 'taskbar',
        action: 'update',
        description: 'Request taskbar to refresh its state',
        payload: {},
        example: {}
    },

    'mediaplayer:playing': {
        namespace: 'mediaplayer',
        action: 'playing',
        description: 'Video player started playback',
        payload: { src: 'string?', title: 'string?' },
        example: { src: 'video.mp4', title: 'Sample Video' }
    },

    'mediaplayer:stop': {
        namespace: 'mediaplayer',
        action: 'stop',
        description: 'Video player stopped',
        payload: {},
        example: {}
    },

    'mediaplayer:loaded': {
        namespace: 'mediaplayer',
        action: 'loaded',
        description: 'Video loaded and ready to play',
        payload: { src: 'string?', duration: 'number?' },
        example: { src: 'video.mp4', duration: 120 }
    },

    'mediaplayer:ended': {
        namespace: 'mediaplayer',
        action: 'ended',
        description: 'Video playback ended',
        payload: {},
        example: {}
    },

    'mediaplayer:error': {
        namespace: 'mediaplayer',
        action: 'error',
        description: 'Video player encountered an error',
        payload: { error: 'string' },
        example: { error: 'Failed to load video' }
    },

    'mediaplayer:timeupdate': {
        namespace: 'mediaplayer',
        action: 'timeupdate',
        description: 'Video playback position updated',
        payload: { currentTime: 'number?', duration: 'number?' },
        example: { currentTime: 30, duration: 120 }
    },

    'mediaplayer:playlist:add': {
        namespace: 'mediaplayer',
        action: 'playlist:add',
        description: 'Video added to playlist',
        payload: { src: 'string?', title: 'string?' },
        example: { src: 'video.mp4', title: 'Sample' }
    },

    'mediaplayer:playlist:ended': {
        namespace: 'mediaplayer',
        action: 'playlist:ended',
        description: 'Video playlist completed all items',
        payload: {},
        example: {}
    },

    'mediaplayer:requested': {
        namespace: 'mediaplayer',
        action: 'requested',
        description: 'Video playback requested from script/external source',
        payload: { src: 'string', title: 'string?' },
        example: { src: 'video.mp4', title: 'Sample' }
    },
};
