/**
 * Filesystem event schemas
 * Auto-split from core/EventSchema.js
 */

export const filesystemEvents = {
    // ==========================================
    // FILESYSTEM EVENTS
    // ==========================================
    'fs:file:create': {
        namespace: 'fs',
        action: 'file:create',
        description: 'File created in virtual filesystem',
        payload: {
            path: 'string',
            type: 'string',
            content: 'any?'
        },
        example: {
            path: '/documents/readme.txt',
            type: 'file',
            content: 'Hello world'
        }
    },

    'fs:file:update': {
        namespace: 'fs',
        action: 'file:update',
        description: 'File updated',
        payload: {
            path: 'string',
            content: 'any'
        },
        example: {
            path: '/documents/readme.txt',
            content: 'Updated content'
        }
    },

    'fs:file:delete': {
        namespace: 'fs',
        action: 'file:delete',
        description: 'File deleted',
        payload: {
            path: 'string'
        },
        example: {
            path: '/documents/readme.txt'
        }
    },

    'fs:directory:create': {
        namespace: 'fs',
        action: 'directory:create',
        description: 'Directory created',
        payload: {
            path: 'string'
        },
        example: {
            path: '/documents/projects'
        }
    },

    // ==========================================
    // FILESYSTEM CHANGE EVENTS (broader than fs:*)
    // ==========================================
    'filesystem:changed': {
        namespace: 'filesystem',
        action: 'changed',
        description: 'General filesystem change notification (triggers UI refresh)',
        payload: {
            path: 'string?',
            type: 'string?'
        },
        example: {
            path: '/documents',
            type: 'file'
        }
    },

    // ==========================================
    // RECYCLE BIN EVENTS
    // ==========================================
    'recyclebin:update': {
        namespace: 'recyclebin',
        action: 'update',
        description: 'Recycle bin contents changed',
        payload: {
            count: 'number?'
        },
        example: {
            count: 5
        }
    },

    'recyclebin:recycle-file': {
        namespace: 'recyclebin',
        action: 'recycle-file',
        description: 'File moved to recycle bin',
        payload: {
            iconId: 'string',
            path: 'string?',
            originalPath: 'string?'
        },
        example: {
            iconId: 'icon-readme',
            path: '/recyclebin/readme.txt',
            originalPath: '/documents/readme.txt'
        }
    },

    'recyclebin:restore': {
        namespace: 'recyclebin',
        action: 'restore',
        description: 'File restored from recycle bin',
        payload: {
            iconId: 'string',
            originalPath: 'string'
        },
        example: {
            iconId: 'icon-readme',
            originalPath: '/documents/readme.txt'
        }
    },

    'recyclebin:empty': {
        namespace: 'recyclebin',
        action: 'empty',
        description: 'Recycle bin emptied',
        payload: {
            count: 'number?'
        },
        example: {
            count: 3
        }
    },

    // ==========================================
    // CLIPBOARD EVENTS
    // ==========================================
    'clipboard:copy': {
        namespace: 'clipboard',
        action: 'copy',
        description: 'Content copied to clipboard',
        payload: {
            content: 'any',
            type: 'string?'
        },
        example: {
            content: 'Hello world',
            type: 'text'
        }
    },

    'clipboard:paste': {
        namespace: 'clipboard',
        action: 'paste',
        description: 'Paste from clipboard requested',
        payload: {
            target: 'string?'
        },
        example: {
            target: 'notepad-1'
        }
    },

    // ==========================================
    // FILESYSTEM EVENTS (Extended)
    // ==========================================
    'fs:file:read': {
        namespace: 'fs',
        action: 'file:read',
        description: 'File read operation',
        payload: {
            path: 'string',
            size: 'number?'
        },
        example: {
            path: 'C:/Documents/readme.txt',
            size: 1024
        }
    },

    'fs:file:rename': {
        namespace: 'fs',
        action: 'file:rename',
        description: 'File renamed',
        payload: {
            oldPath: 'string',
            newPath: 'string',
            oldName: 'string',
            newName: 'string'
        },
        example: {
            oldPath: 'C:/Documents/old.txt',
            newPath: 'C:/Documents/new.txt',
            oldName: 'old.txt',
            newName: 'new.txt'
        }
    },

    'fs:file:move': {
        namespace: 'fs',
        action: 'file:move',
        description: 'File moved to new location',
        payload: {
            sourcePath: 'string',
            destPath: 'string',
            fileName: 'string'
        },
        example: {
            sourcePath: 'C:/Documents/file.txt',
            destPath: 'C:/Backup/file.txt',
            fileName: 'file.txt'
        }
    },

    'fs:file:copy': {
        namespace: 'fs',
        action: 'file:copy',
        description: 'File copied',
        payload: {
            sourcePath: 'string',
            destPath: 'string',
            fileName: 'string'
        },
        example: {
            sourcePath: 'C:/Documents/file.txt',
            destPath: 'C:/Backup/file.txt',
            fileName: 'file.txt'
        }
    },

    'fs:directory:delete': {
        namespace: 'fs',
        action: 'directory:delete',
        description: 'Directory deleted',
        payload: {
            path: 'string',
            recursive: 'boolean?'
        },
        example: {
            path: 'C:/Documents/OldFolder',
            recursive: true
        }
    },

    'fs:directory:rename': {
        namespace: 'fs',
        action: 'directory:rename',
        description: 'Directory renamed',
        payload: {
            oldPath: 'string',
            newPath: 'string',
            oldName: 'string',
            newName: 'string'
        },
        example: {
            oldPath: 'C:/Documents/OldName',
            newPath: 'C:/Documents/NewName',
            oldName: 'OldName',
            newName: 'NewName'
        }
    },

    'fs:directory:open': {
        namespace: 'fs',
        action: 'directory:open',
        description: 'Directory opened/browsed',
        payload: {
            path: 'string',
            itemCount: 'number?'
        },
        example: {
            path: 'C:/Documents',
            itemCount: 15
        }
    },

    'fs:error': {
        namespace: 'fs',
        action: 'error',
        description: 'Filesystem error occurred',
        payload: {
            operation: 'string',
            path: 'string',
            error: 'string',
            code: 'string?'
        },
        example: {
            operation: 'write',
            path: 'C:/System/protected.txt',
            error: 'Permission denied',
            code: 'EPERM'
        }
    },

    'fs:permission:denied': {
        namespace: 'fs',
        action: 'permission:denied',
        description: 'File operation permission denied',
        payload: {
            operation: 'string',
            path: 'string'
        },
        example: {
            operation: 'delete',
            path: 'C:/Windows/System32/kernel.dll'
        }
    },

    'fs:file:deleted:track': {
        namespace: 'fs',
        action: 'file:deleted:track',
        description: 'File deletion tracked for media scanner cleanup',
        payload: {
            path: 'string',
            fileName: 'string',
            parentPath: 'string'
        },
        example: {
            path: 'C:/Users/User/Music/song.mp3',
            fileName: 'song.mp3',
            parentPath: 'C:/Users/User/Music'
        }
    },

    // ==========================================
    // EXPLORER EVENTS
    // ==========================================
    'explorer:upload': {
        namespace: 'explorer',
        action: 'upload',
        description: 'File upload requested from explorer context menu',
        payload: {
            currentPath: 'string?'
        },
        example: {
            currentPath: 'C:/Users/User/Documents'
        }
    },

    'fs:watch:change': {
        namespace: 'fs',
        action: 'watch:change',
        description: 'Watched path changed',
        payload: {
            path: 'string',
            changeType: 'string',
            fileName: 'string?'
        },
        example: {
            path: 'C:/Documents',
            changeType: 'modified',
            fileName: 'document.txt'
        }
    },
};
