/**
 * SystemBuiltins - System integration functions for RetroScript
 */

export function registerSystemBuiltins(interpreter) {
    // Sleep/delay function - pause script execution
    interpreter.registerBuiltin('sleep', async (ms) => {
        const milliseconds = Number(ms) || 0;
        if (milliseconds > 0 && milliseconds <= 30000) { // Max 30 seconds
            await new Promise(resolve => setTimeout(resolve, milliseconds));
        }
        return milliseconds;
    });

    // Wait alias for sleep
    interpreter.registerBuiltin('wait', async (ms) => {
        const milliseconds = Number(ms) || 0;
        if (milliseconds > 0 && milliseconds <= 30000) {
            await new Promise(resolve => setTimeout(resolve, milliseconds));
        }
        return milliseconds;
    });

    // Get focused window info
    interpreter.registerBuiltin('getFocusedWindow', () => {
        const StateManager = interpreter.context.StateManager;
        if (StateManager) {
            const windows = StateManager.getState('windows') || [];
            const focused = windows.find(w => !w.minimized);
            if (focused) {
                return {
                    id: focused.id,
                    title: focused.title,
                    minimized: focused.minimized || false,
                    maximized: focused.maximized || false
                };
            }
        }
        return null;
    });

    // Emit custom event from script
    interpreter.registerBuiltin('emitEvent', (eventName, payload = {}) => {
        const EventBus = interpreter.context.EventBus;
        if (EventBus && typeof eventName === 'string') {
            EventBus.emit(eventName, payload);
            return true;
        }
        return false;
    });

    // Window management
    interpreter.registerBuiltin('getWindows', () => {
        const WindowManager = interpreter.context.WindowManager;
        if (WindowManager) {
            return WindowManager.getWindows().map(w => ({
                id: w.id,
                appId: w.appId,
                title: w.title,
                minimized: w.minimized,
                maximized: w.maximized
            }));
        }
        return [];
    });

    // App registry
    interpreter.registerBuiltin('getApps', () => {
        const AppRegistry = interpreter.context.AppRegistry;
        if (AppRegistry) {
            return AppRegistry.getAll().map(app => ({
                id: app.id,
                name: app.name,
                category: app.category
            }));
        }
        return [];
    });

    // Environment info
    interpreter.registerBuiltin('getEnv', () => {
        return {
            platform: 'RetrOS',
            version: '5.0',
            language: 'RetroScript',
            timestamp: Date.now()
        };
    });

    // Query system state
    interpreter.registerBuiltin('query', (type, ...args) => {
        const QueryHandler = interpreter.context.QueryHandler;
        if (QueryHandler) {
            return QueryHandler.query(type, args);
        }
        return null;
    });

    // Execute command
    interpreter.registerBuiltin('exec', async (command, payload) => {
        const CommandBus = interpreter.context.CommandBus;
        if (CommandBus) {
            try {
                return await CommandBus.execute(command, payload || {});
            } catch (error) {
                console.error('[SystemBuiltins] exec error:', error);
                return null;
            }
        }
        return null;
    });

    // Clipboard (if available)
    interpreter.registerBuiltin('copyToClipboard', async (text) => {
        try {
            await navigator.clipboard.writeText(String(text));
            return true;
        } catch (error) {
            console.error('[SystemBuiltins] clipboard error:', error);
            return false;
        }
    });

    // Storage
    interpreter.registerBuiltin('getStorage', (key) => {
        const StorageManager = interpreter.context.StorageManager;
        if (StorageManager) {
            return StorageManager.get(String(key));
        }
        return null;
    });

    interpreter.registerBuiltin('setStorage', (key, value) => {
        const StorageManager = interpreter.context.StorageManager;
        if (StorageManager) {
            StorageManager.set(String(key), value);
            return true;
        }
        return false;
    });
}

export default registerSystemBuiltins;
