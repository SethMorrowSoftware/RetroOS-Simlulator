/**
 * Dialog event schemas
 * Auto-split from core/EventSchema.js
 */

export const dialogEvents = {
    // ==========================================
    // DIALOG EVENTS
    // ==========================================
    'dialog:alert': {
        namespace: 'dialog',
        action: 'alert',
        description: 'Show an alert dialog',
        payload: {
            message: 'string',
            title: 'string?',
            icon: 'string?',
            requestId: 'string?'
        },
        example: {
            message: 'File saved successfully',
            title: 'Success',
            icon: '✅'
        }
    },

    'dialog:alert:response': {
        namespace: 'dialog',
        action: 'alert:response',
        description: 'Response when alert dialog is dismissed',
        payload: {
            requestId: 'string',
            acknowledged: 'boolean?'
        },
        example: {
            requestId: 'alert-123',
            acknowledged: true
        }
    },

    'dialog:confirm': {
        namespace: 'dialog',
        action: 'confirm',
        description: 'Show a confirmation dialog',
        payload: {
            message: 'string',
            title: 'string?',
            confirmText: 'string?',
            cancelText: 'string?',
            requestId: 'string?'
        },
        example: {
            message: 'Are you sure you want to delete this file?',
            title: 'Confirm Delete',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        }
    },

    'dialog:confirm:response': {
        namespace: 'dialog',
        action: 'confirm:response',
        description: 'Response from a confirmation dialog',
        payload: {
            requestId: 'string',
            confirmed: 'boolean'
        },
        example: {
            requestId: 'confirm-123',
            confirmed: true
        }
    },

    'dialog:prompt': {
        namespace: 'dialog',
        action: 'prompt',
        description: 'Show an input prompt dialog',
        payload: {
            message: 'string',
            title: 'string?',
            defaultValue: 'string?',
            placeholder: 'string?',
            requestId: 'string?'
        },
        example: {
            message: 'Enter file name:',
            title: 'New File',
            defaultValue: 'untitled.txt'
        }
    },

    'dialog:prompt:response': {
        namespace: 'dialog',
        action: 'prompt:response',
        description: 'Response from a prompt dialog',
        payload: {
            requestId: 'string',
            value: 'string?',
            cancelled: 'boolean'
        },
        example: {
            requestId: 'prompt-123',
            value: 'myfile.txt',
            cancelled: false
        }
    },

    'dialog:file-open': {
        namespace: 'dialog',
        action: 'file-open',
        description: 'Show file open dialog',
        payload: {
            title: 'string?',
            filter: 'string?',
            directory: 'string?',
            requestId: 'string?'
        },
        example: {
            title: 'Open File',
            filter: '.txt,.md',
            directory: '/documents'
        }
    },

    'dialog:file-open:response': {
        namespace: 'dialog',
        action: 'file-open:response',
        description: 'Response from file open dialog',
        payload: {
            requestId: 'string',
            path: 'string?',
            cancelled: 'boolean'
        },
        example: {
            requestId: 'file-open-123',
            path: '/documents/readme.txt',
            cancelled: false
        }
    },

    'dialog:file-save': {
        namespace: 'dialog',
        action: 'file-save',
        description: 'Show file save dialog',
        payload: {
            title: 'string?',
            defaultName: 'string?',
            filter: 'string?',
            directory: 'string?',
            requestId: 'string?'
        },
        example: {
            title: 'Save File',
            defaultName: 'document.txt',
            directory: '/documents'
        }
    },

    'dialog:file-save:response': {
        namespace: 'dialog',
        action: 'file-save:response',
        description: 'Response from file save dialog',
        payload: {
            requestId: 'string',
            path: 'string?',
            cancelled: 'boolean'
        },
        example: {
            requestId: 'file-save-123',
            path: '/documents/document.txt',
            cancelled: false
        }
    },

    // ==========================================
    // WELCOME DIALOG EVENTS
    // ==========================================
    'dialog:welcome:dismissed': {
        namespace: 'dialog',
        action: 'welcome:dismissed',
        description: 'Welcome dialog was dismissed by the user',
        payload: {
            timestamp: 'number'
        },
        example: {
            timestamp: 1709654400000
        }
    },

    // ==========================================
    // NOTIFICATION EVENTS
    // ==========================================
    'notification:show': {
        namespace: 'notification',
        action: 'show',
        description: 'Show a notification toast',
        payload: {
            message: 'string',
            title: 'string?',
            type: 'string?',
            duration: 'number?',
            icon: 'string?'
        },
        example: {
            message: 'File saved',
            title: 'Success',
            type: 'success',
            duration: 3000
        }
    },

    'notification:dismiss': {
        namespace: 'notification',
        action: 'dismiss',
        description: 'Dismiss a notification',
        payload: {
            id: 'string?'
        },
        example: {
            id: 'notification-123'
        }
    },
};
