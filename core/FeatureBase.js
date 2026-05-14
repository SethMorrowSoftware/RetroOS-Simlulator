/**
 * FeatureBase - Base class for all features
 * Provides common functionality and lifecycle methods similar to AppBase
 *
 * Features extend this class and implement:
 *   - initialize(): Setup feature, subscribe to events
 *   - enable(): Enable feature at runtime
 *   - disable(): Disable feature at runtime
 *   - cleanup(): Clean up resources when disabled
 *
 * Events emitted:
 *   - feature:initialize - When feature starts initializing
 *   - feature:ready - When feature initialization completes
 *   - feature:enable - When feature is enabled
 *   - feature:disable - When feature is disabled
 *   - feature:error - When an error occurs in the feature
 *   - feature:config:change - When feature configuration changes
 *
 * Usage:
 *   class MyFeature extends FeatureBase {
 *       constructor() {
 *           super({
 *               id: 'myfeature',
 *               name: 'My Feature',
 *               description: 'Does something awesome',
 *               icon: '✨',
 *               category: 'enhancement',
 *               dependencies: [],
 *               config: {}
 *           });
 *       }
 *
 *       async initialize() {
 *           // Setup logic
 *       }
 *   }
 */

import EventBus, { Events } from './EventBus.js';
import StateManager from './StateManager.js';
import StorageManager from './StorageManager.js';
import { getConfig } from './ConfigLoader.js';

class FeatureBase {
    /**
     * Create a feature instance
     * @param {Object} metadata - Feature metadata
     */
    constructor(metadata = {}) {
        this.id = metadata.id || 'unknown-feature';
        this.name = metadata.name || 'Unknown Feature';
        this.description = metadata.description || '';
        this.icon = metadata.icon || '⚡';
        this.category = metadata.category || 'enhancement';
        this.dependencies = metadata.dependencies || [];

        // Runtime state
        this.enabled = true;
        this.initialized = false;

        // Configuration
        this.config = metadata.config || {};
        this.defaultConfig = { ...this.config };

        // Settings definitions for UI generation
        this.settings = metadata.settings || [];

        // Event tracking for cleanup
        this.eventUnsubscribers = [];
        this.boundHandlers = new Map(); // target -> [{ event, handler, options }]

        // Hook system for extensibility
        this.hooks = new Map(); // hookName -> [handlers]
    }

    // ===== LIFECYCLE METHODS (Override in subclass) =====

    /**
     * Initialize the feature
     * Called during boot sequence
     * Override this in your feature class
     */
    async initialize() {
        // Override in subclass
    }

    /**
     * Enable the feature at runtime
     * Called when user enables the feature in settings
     */
    async enable() {
        try {
            if (!this.initialized) {
                // Emit initialize event
                EventBus.emit(Events.FEATURE_INITIALIZE, {
                    featureId: this.id,
                    config: this.config
                });

                await this.initialize();
                this.initialized = true;

                // Emit ready event
                EventBus.emit(Events.FEATURE_READY, {
                    featureId: this.id
                });
            }

            this.enabled = true;
            this.saveEnabledState(true);

            // Emit enable event
            EventBus.emit(Events.FEATURE_ENABLE, {
                featureId: this.id,
                name: this.name
            });

            console.log(`[${this.name}] Enabled`);
        } catch (error) {
            EventBus.emit(Events.FEATURE_ERROR, {
                featureId: this.id,
                error: error.message,
                fatal: false
            });
            throw error;
        }
    }

    /**
     * Disable the feature at runtime
     * Called when user disables the feature in settings
     */
    async disable() {
        try {
            this.cleanup();
            this.enabled = false;
            this.initialized = false;
            this.saveEnabledState(false);

            // Emit disable event
            EventBus.emit(Events.FEATURE_DISABLE, {
                featureId: this.id,
                name: this.name
            });

            console.log(`[${this.name}] Disabled`);
        } catch (error) {
            EventBus.emit(Events.FEATURE_ERROR, {
                featureId: this.id,
                error: error.message,
                fatal: false
            });
            throw error;
        }
    }

    /**
     * Cleanup resources
     * Override for feature-specific cleanup
     */
    cleanup() {
        // Clean up EventBus subscriptions
        this.eventUnsubscribers.forEach(unsub => {
            if (typeof unsub === 'function') {
                unsub();
            }
        });
        this.eventUnsubscribers = [];

        // Clean up DOM event handlers
        this.boundHandlers.forEach((handlers, target) => {
            handlers.forEach(({ event, handler, options }) => {
                try {
                    target.removeEventListener(event, handler, options);
                } catch (e) {
                    // Target may no longer exist
                }
            });
        });
        this.boundHandlers.clear();
    }

    // ===== STATE HELPERS =====

    /**
     * Check if feature is enabled
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Load enabled state from storage, with server config as fallback.
     * Priority: localStorage user preference > server config (admin panel) > constructor default.
     * @returns {boolean}
     */
    loadEnabledState() {
        const saved = StorageManager.get(`feature_${this.id}_enabled`);
        if (saved !== null) {
            // User has explicitly toggled this feature — respect their preference
            this.enabled = saved === true || saved === 'true';
        } else {
            // No user preference — check server config from admin panel
            const serverEnabled = getConfig(`features.${this.id}.enabled`, undefined);
            if (serverEnabled !== undefined) {
                this.enabled = serverEnabled === true;
            }
            // else: keep the constructor default
        }
        return this.enabled;
    }

    /**
     * Save enabled state to storage
     * @param {boolean} enabled
     */
    saveEnabledState(enabled) {
        StorageManager.set(`feature_${this.id}_enabled`, enabled);
    }

    // ===== CONFIGURATION HELPERS =====

    /**
     * Get a config value
     * @param {string} key - Config key
     * @param {*} defaultValue - Default value if not set
     * @returns {*}
     */
    getConfig(key, defaultValue) {
        // First check persisted config
        const savedConfig = this.loadConfigFromStorage();
        if (key in savedConfig) {
            return savedConfig[key];
        }
        // Then check instance config
        if (key in this.config) {
            return this.config[key];
        }
        // Finally return default
        return defaultValue ?? this.defaultConfig[key];
    }

    /**
     * Set a config value
     * @param {string} key - Config key
     * @param {*} value - Value to set
     */
    setConfig(key, value) {
        const oldValue = this.config[key];
        this.config[key] = value;
        this.saveConfigToStorage();

        // Emit config change event
        EventBus.emit(Events.FEATURE_CONFIG_CHANGE, {
            featureId: this.id,
            key,
            value,
            oldValue
        });

        // Trigger config change hook
        this.triggerHook('config:changed', { key, value, oldValue });
    }

    /**
     * Get all config values
     * @returns {Object}
     */
    getAllConfig() {
        const savedConfig = this.loadConfigFromStorage();
        return { ...this.defaultConfig, ...this.config, ...savedConfig };
    }

    /**
     * Reset config to defaults
     */
    resetConfig() {
        this.config = { ...this.defaultConfig };
        StorageManager.remove(`feature_${this.id}_config`);
        this.triggerHook('config:reset', {});
    }

    /**
     * Load config from storage
     * @returns {Object}
     */
    loadConfigFromStorage() {
        const saved = StorageManager.get(`feature_${this.id}_config`);
        return saved || {};
    }

    /**
     * Save config to storage
     */
    saveConfigToStorage() {
        StorageManager.set(`feature_${this.id}_config`, this.config);
    }

    // ===== EVENT HELPERS =====

    /**
     * Subscribe to an EventBus event with auto-cleanup
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @returns {Function} Unsubscribe function
     */
    subscribe(event, handler) {
        const boundHandler = handler.bind(this);
        const unsubscribe = EventBus.on(event, boundHandler);
        this.eventUnsubscribers.push(unsubscribe);
        return unsubscribe;
    }

    /**
     * Emit an event through EventBus
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        EventBus.emit(event, data);
    }

    /**
     * Add a DOM event listener with auto-cleanup
     * @param {EventTarget} target - Event target
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - Event options
     */
    addHandler(target, event, handler, options = {}) {
        const boundHandler = handler.bind(this);
        target.addEventListener(event, boundHandler, options);

        // Track for cleanup
        if (!this.boundHandlers.has(target)) {
            this.boundHandlers.set(target, []);
        }
        this.boundHandlers.get(target).push({ event, handler: boundHandler, options });
    }

    /**
     * Remove a DOM event listener
     * @param {EventTarget} target - Event target
     * @param {string} event - Event name
     */
    removeHandler(target, event) {
        if (this.boundHandlers.has(target)) {
            const handlers = this.boundHandlers.get(target);
            const filtered = handlers.filter(h => {
                if (h.event === event) {
                    target.removeEventListener(event, h.handler, h.options);
                    return false;
                }
                return true;
            });
            this.boundHandlers.set(target, filtered);
        }
    }

    // ===== HOOK SYSTEM =====

    /**
     * Register a hook handler
     * Allows other features to extend this feature's behavior
     * @param {string} hookName - Hook name
     * @param {Function} handler - Hook handler
     * @returns {Function} Unregister function
     */
    registerHook(hookName, handler) {
        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }
        this.hooks.get(hookName).push(handler);

        // Return unregister function
        return () => {
            const handlers = this.hooks.get(hookName);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        };
    }

    /**
     * Trigger a hook
     * @param {string} hookName - Hook name
     * @param {*} data - Data to pass to handlers
     * @returns {Array} Results from all handlers
     */
    triggerHook(hookName, data) {
        const handlers = this.hooks.get(hookName) || [];
        return handlers.map(handler => {
            try {
                return handler(data);
            } catch (error) {
                console.error(`[${this.name}] Hook ${hookName} error:`, error);
                return null;
            }
        });
    }

    // ===== DEPENDENCY HELPERS =====

    /**
     * Check if all dependencies are met
     * @param {Function} isFeatureEnabled - Function to check if a feature is enabled
     * @returns {boolean}
     */
    checkDependencies(isFeatureEnabled) {
        return this.dependencies.every(dep => isFeatureEnabled(dep));
    }

    // ===== UTILITY HELPERS =====

    /**
     * Get the feature metadata
     * @returns {Object}
     */
    getMetadata() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            icon: this.icon,
            category: this.category,
            enabled: this.enabled,
            initialized: this.initialized,
            dependencies: this.dependencies,
            settings: this.settings,
            config: this.getAllConfig()
        };
    }

    /**
     * Play a sound effect
     * @param {string} type - Sound type
     * @param {boolean} force - Force play even if sound is disabled
     */
    playSound(type, force = false) {
        EventBus.emit('sound:play', { type, force });
    }

    /**
     * Log a message with feature prefix
     * @param {...any} args - Log arguments
     */
    log(...args) {
        console.log(`[${this.name}]`, ...args);
    }

    /**
     * Log a warning with feature prefix
     * @param {...any} args - Warning arguments
     */
    warn(...args) {
        console.warn(`[${this.name}]`, ...args);
    }

    /**
     * Log an error with feature prefix
     * @param {...any} args - Error arguments
     */
    error(...args) {
        console.error(`[${this.name}]`, ...args);
    }
}

export default FeatureBase;
