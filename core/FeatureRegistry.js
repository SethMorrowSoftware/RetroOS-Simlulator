/**
 * FeatureRegistry - Central registry for all features
 * Manages feature registration, initialization, enabling/disabling, and querying
 *
 * Similar to AppRegistry but for system features
 *
 * Usage:
 *   FeatureRegistry.register(featureInstance);
 *   await FeatureRegistry.initializeAll();
 *   FeatureRegistry.enable('featureid');
 *   FeatureRegistry.disable('featureid');
 */

import EventBus from './EventBus.js';
import StorageManager from './StorageManager.js';

// Feature categories
export const FEATURE_CATEGORIES = {
    CORE: 'core',           // Essential system features (can't be disabled)
    ENHANCEMENT: 'enhancement',  // Optional enhancements (can be disabled)
    PLUGIN: 'plugin'        // Third-party plugins
};

class FeatureRegistryClass {
    constructor() {
        // Map of feature id -> FeatureBase instance
        this.features = new Map();

        // Map of feature id -> metadata
        this.metadata = new Map();

        // Global hooks that run for all features
        this.globalHooks = new Map(); // hookName -> [handlers]

        // Initialization order (dependency-sorted)
        this.initOrder = [];

        // Track initialization state
        this.initialized = false;

        // Debug logging flag — set to true for verbose output
        this.debug = false;
    }

    /**
     * Log a message if debug mode is enabled
     * @param  {...any} args - Arguments to pass to console.log
     */
    _log(...args) {
        if (this.debug) {
            console.log(...args);
        }
    }

    /**
     * Register a feature
     * @param {FeatureBase} feature - Feature instance
     * @param {Object} overrideMeta - Optional metadata overrides
     */
    register(feature, overrideMeta = {}) {
        // Validate feature object
        if (!feature || typeof feature !== 'object') {
            console.error('[FeatureRegistry] Invalid feature object:', feature);
            return;
        }

        if (!feature.id) {
            console.error('[FeatureRegistry] Feature missing id:', feature);
            return;
        }

        if (this.features.has(feature.id)) {
            throw new Error(`[FeatureRegistry] Feature "${feature.id}" already registered. Unregister it first before re-registering.`);
        }

        this.features.set(feature.id, feature);

        // Build metadata from feature instance and overrides
        const meta = {
            ...feature.getMetadata(),
            ...overrideMeta
        };
        this.metadata.set(feature.id, meta);

        this._log(`[FeatureRegistry] Registered: ${feature.name} (${feature.id}) [${meta.category}]`);
        this._log(`[FeatureRegistry] Total registered: ${this.features.size} features, ${this.metadata.size} metadata entries`);

        // Emit registration event
        EventBus.emit('feature:registered', { featureId: feature.id, name: feature.name, category: meta.category });
    }

    /**
     * Unregister a feature (for plugin unload/hot-reload)
     * Disables the feature if enabled, cleans up resources, and removes from registry.
     * @param {string} featureId - Feature ID
     */
    async unregister(featureId) {
        const feature = this.features.get(featureId);
        if (!feature) {
            console.warn(`[FeatureRegistry] Cannot unregister "${featureId}" - not found`);
            return;
        }

        // Disable first if enabled (handles dependents, saves state, emits events,
        // and runs cleanup + resets initialized flag)
        if (feature.isEnabled()) {
            try {
                await this.disable(featureId);
            } catch (error) {
                console.warn(`[FeatureRegistry] Error disabling "${featureId}" during unregister:`, error);
            }
        }

        // Final cleanup for features that were already disabled but may
        // still hold resources (e.g., hooks). Safe to call even after disable()
        // since cleanup() is idempotent (clears already-empty arrays).
        try {
            feature.cleanup();
        } catch (error) {
            console.warn(`[FeatureRegistry] Error cleaning up "${featureId}" during unregister:`, error);
        }

        // Remove from registry
        this.features.delete(featureId);
        this.metadata.delete(featureId);

        // Remove from init order
        this.initOrder = this.initOrder.filter(id => id !== featureId);

        this._log(`[FeatureRegistry] Unregistered: ${feature.name} (${featureId})`);
        EventBus.emit('feature:unregistered', { featureId, name: feature.name });
    }

    /**
     * Register multiple features at once
     * @param {FeatureBase[]} features - Array of feature instances
     */
    registerAll(features) {
        this._log(`[FeatureRegistry] registerAll called with ${features?.length || 0} features`);

        if (!Array.isArray(features)) {
            console.error('[FeatureRegistry] registerAll: features is not an array:', features);
            return;
        }

        features.forEach((feature, index) => {
            try {
                this._log(`[FeatureRegistry] Registering feature ${index + 1}/${features.length}: ${feature?.id || 'INVALID'}`);
                this.register(feature);
            } catch (err) {
                console.error(`[FeatureRegistry] Failed to register feature '${feature?.id || index}':`, err);
            }
        });

        this._log(`[FeatureRegistry] registerAll complete. Total: ${this.features.size} features`);
    }

    /**
     * Initialize all registered features in dependency order
     */
    async initializeAll() {
        this._log('[FeatureRegistry] Initializing all features...');

        // Sort by dependencies
        this.initOrder = this.resolveDependencies();

        // Track features that failed to initialize so dependents can be skipped
        const failedFeatures = new Set();

        // Initialize in order
        for (const featureId of this.initOrder) {
            const feature = this.features.get(featureId);
            if (!feature) continue;

            // Load saved enabled state
            feature.loadEnabledState();

            // Update metadata with current enabled state
            const meta = this.metadata.get(featureId);
            if (meta) {
                meta.enabled = feature.isEnabled();
                meta.config = feature.getAllConfig();
            }

            // Check if feature should be enabled
            if (feature.isEnabled()) {
                // Check if any dependency failed — skip this feature if so
                const failedDeps = feature.dependencies.filter(d => failedFeatures.has(d));
                if (failedDeps.length > 0) {
                    console.warn(`[FeatureRegistry] Skipped ${feature.name}: dependency failed (${failedDeps.join(', ')})`);
                    failedFeatures.add(featureId);
                    EventBus.emit('feature:dependency-failed', { featureId, failedDependencies: failedDeps });
                    continue;
                }

                try {
                    // Trigger before-init hook
                    this.triggerGlobalHook('feature:before-init', { featureId });

                    await feature.initialize();
                    feature.initialized = true;

                    // Update initialized state in metadata
                    if (meta) {
                        meta.initialized = true;
                    }

                    // Trigger after-init hook
                    this.triggerGlobalHook('feature:after-init', { featureId });

                    this._log(`[FeatureRegistry] Initialized: ${feature.name}`);
                } catch (error) {
                    console.error(`[FeatureRegistry] Failed to initialize ${feature.name}:`, error);
                    failedFeatures.add(featureId);
                }
            } else {
                this._log(`[FeatureRegistry] Skipped (disabled): ${feature.name}`);
            }
        }

        this.initialized = true;
        this._log(`[FeatureRegistry] Initialization complete - ${this.features.size} features registered`);
        if (failedFeatures.size > 0) {
            console.warn(`[FeatureRegistry] ${failedFeatures.size} feature(s) failed to initialize:`, [...failedFeatures]);
        }

        // Emit initialization complete event
        EventBus.emit('features:initialized');
    }

    /**
     * Enable a feature at runtime
     * @param {string} featureId - Feature ID
     */
    async enable(featureId) {
        const feature = this.features.get(featureId);
        if (!feature) {
            throw new Error(`Feature ${featureId} not found`);
        }

        // Check dependencies
        if (!feature.checkDependencies((depId) => this.isEnabled(depId))) {
            throw new Error(`Cannot enable ${featureId}: dependencies not met`);
        }

        await feature.enable();

        // Update metadata
        const meta = this.metadata.get(featureId);
        if (meta) {
            meta.enabled = true;
            this.metadata.set(featureId, meta);
        }

        // Emit event
        EventBus.emit('feature:enabled', { featureId });
        this.triggerGlobalHook('feature:enabled', { featureId });
    }

    /**
     * Disable a feature at runtime
     * @param {string} featureId - Feature ID
     */
    async disable(featureId) {
        const feature = this.features.get(featureId);
        if (!feature) {
            throw new Error(`Feature ${featureId} not found`);
        }

        // Check if this is a core feature (can't be disabled)
        const meta = this.metadata.get(featureId);
        if (meta && meta.category === FEATURE_CATEGORIES.CORE) {
            throw new Error(`Cannot disable core feature: ${featureId}`);
        }

        // Check if other features depend on this one
        const dependents = this.getDependents(featureId);
        if (dependents.length > 0) {
            // Disable dependents first. Isolate failures so one dependent's
            // broken cleanup() doesn't leave the rest of the graph half-disabled.
            const failures = [];
            for (const depId of dependents) {
                if (this.isEnabled(depId)) {
                    try {
                        await this.disable(depId);
                    } catch (err) {
                        failures.push({ depId, error: err });
                        console.error(`[FeatureRegistry] Dependent ${depId} failed to disable cleanly:`, err);
                        EventBus.emit('feature:disable:error', {
                            featureId: depId,
                            dependencyOf: featureId,
                            error: err && err.message ? err.message : String(err)
                        });
                    }
                }
            }
            if (failures.length > 0) {
                console.warn(`[FeatureRegistry] ${failures.length} dependent(s) of ${featureId} failed to disable; continuing.`);
            }
        }

        await feature.disable();

        // Update metadata
        if (meta) {
            meta.enabled = false;
            this.metadata.set(featureId, meta);
        }

        // Emit event
        EventBus.emit('feature:disabled', { featureId });
        this.triggerGlobalHook('feature:disabled', { featureId });
    }

    /**
     * Toggle a feature's enabled state
     * @param {string} featureId - Feature ID
     * @returns {boolean} New enabled state
     */
    async toggle(featureId) {
        if (this.isEnabled(featureId)) {
            await this.disable(featureId);
            return false;
        } else {
            await this.enable(featureId);
            return true;
        }
    }

    /**
     * Check if a feature is enabled
     * @param {string} featureId - Feature ID
     * @returns {boolean}
     */
    isEnabled(featureId) {
        const feature = this.features.get(featureId);
        return feature?.isEnabled() ?? false;
    }

    /**
     * Check if a feature is initialized
     * @param {string} featureId - Feature ID
     * @returns {boolean}
     */
    isInitialized(featureId) {
        const feature = this.features.get(featureId);
        return feature?.initialized ?? false;
    }

    /**
     * Get a feature instance
     * @param {string} featureId - Feature ID
     * @returns {FeatureBase|undefined}
     */
    get(featureId) {
        return this.features.get(featureId);
    }

    /**
     * Get all feature metadata with current state
     * @returns {Object[]}
     */
    getAll() {
        this._log('[FeatureRegistry] getAll() - metadata size:', this.metadata.size, 'features size:', this.features.size);
        // Return metadata merged with current feature state
        return Array.from(this.metadata.values()).map(meta => {
            const feature = this.features.get(meta.id);
            if (feature) {
                return {
                    ...meta,
                    enabled: feature.isEnabled(),
                    initialized: feature.initialized,
                    config: feature.getAllConfig()
                };
            }
            return meta;
        });
    }

    /**
     * Get features by category
     * @param {string} category - Category name
     * @returns {Object[]}
     */
    getByCategory(category) {
        return Array.from(this.metadata.values())
            .filter(m => m.category === category);
    }

    /**
     * Get all enabled features
     * @returns {Object[]}
     */
    getEnabled() {
        return Array.from(this.metadata.values())
            .filter(m => m.enabled);
    }

    /**
     * Get all disabled features
     * @returns {Object[]}
     */
    getDisabled() {
        return Array.from(this.metadata.values())
            .filter(m => !m.enabled);
    }

    /**
     * Get features that depend on a given feature
     * @param {string} featureId - Feature ID
     * @returns {string[]} Array of dependent feature IDs
     */
    getDependents(featureId) {
        const dependents = [];
        for (const [id, feature] of this.features) {
            if (feature.dependencies.includes(featureId)) {
                dependents.push(id);
            }
        }
        return dependents;
    }

    /**
     * Resolve dependencies and return initialization order
     * Uses topological sort to ensure dependencies are initialized first
     * @returns {string[]} Feature IDs in initialization order
     */
    resolveDependencies() {
        const visited = new Set();
        const order = [];
        const visiting = new Set(); // For cycle detection
        const unresolvedDeps = new Map(); // featureId -> [missing dep IDs]

        const visit = (featureId) => {
            if (visited.has(featureId)) return;
            if (visiting.has(featureId)) {
                console.warn(`[FeatureRegistry] Circular dependency detected involving: ${featureId}`);
                return;
            }

            visiting.add(featureId);

            const feature = this.features.get(featureId);
            if (feature) {
                // Visit dependencies first
                for (const depId of feature.dependencies) {
                    if (this.features.has(depId)) {
                        visit(depId);
                    } else {
                        console.warn(`[FeatureRegistry] Missing dependency: "${depId}" required by "${featureId}" is not registered`);
                        if (!unresolvedDeps.has(featureId)) {
                            unresolvedDeps.set(featureId, []);
                        }
                        unresolvedDeps.get(featureId).push(depId);
                    }
                }
            }

            visiting.delete(featureId);
            visited.add(featureId);
            order.push(featureId);
        };

        // Visit all features
        for (const featureId of this.features.keys()) {
            visit(featureId);
        }

        // Emit warnings for features with unresolved dependencies
        if (unresolvedDeps.size > 0) {
            for (const [featureId, missing] of unresolvedDeps) {
                EventBus.emit('feature:unresolved-dependency', { featureId, missingDependencies: missing });
            }
        }

        return order;
    }

    // ===== GLOBAL HOOKS =====

    /**
     * Register a global hook that runs for all features
     * @param {string} hookName - Hook name (e.g., 'feature:before-init')
     * @param {Function} handler - Hook handler
     * @returns {Function} Unregister function
     */
    registerGlobalHook(hookName, handler) {
        if (!this.globalHooks.has(hookName)) {
            this.globalHooks.set(hookName, []);
        }
        this.globalHooks.get(hookName).push(handler);

        return () => {
            const handlers = this.globalHooks.get(hookName);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        };
    }

    /**
     * Trigger a global hook
     * @param {string} hookName - Hook name
     * @param {*} data - Data to pass to handlers
     */
    triggerGlobalHook(hookName, data) {
        const handlers = this.globalHooks.get(hookName) || [];
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`[FeatureRegistry] Global hook ${hookName} error:`, error);
            }
        });
    }

    // ===== CONFIGURATION =====

    /**
     * Get a feature's config value
     * @param {string} featureId - Feature ID
     * @param {string} key - Config key
     * @param {*} defaultValue - Default value
     * @returns {*}
     */
    getFeatureConfig(featureId, key, defaultValue) {
        const feature = this.features.get(featureId);
        return feature?.getConfig(key, defaultValue);
    }

    /**
     * Set a feature's config value
     * @param {string} featureId - Feature ID
     * @param {string} key - Config key
     * @param {*} value - Value to set
     */
    setFeatureConfig(featureId, key, value) {
        const feature = this.features.get(featureId);
        if (feature) {
            feature.setConfig(key, value);
            EventBus.emit('feature:config-changed', { featureId, key, value });
        }
    }

    /**
     * Reset a feature's config to defaults
     * @param {string} featureId - Feature ID
     */
    resetFeatureConfig(featureId) {
        const feature = this.features.get(featureId);
        if (feature) {
            feature.resetConfig();
            EventBus.emit('feature:config-reset', { featureId });
        }
    }

    // ===== DEBUGGING =====

    /**
     * Get debug info about all features
     * @returns {Object}
     */
    getDebugInfo() {
        const info = {
            totalFeatures: this.features.size,
            initialized: this.initialized,
            initOrder: this.initOrder,
            features: {}
        };

        for (const [id, feature] of this.features) {
            info.features[id] = {
                name: feature.name,
                enabled: feature.isEnabled(),
                initialized: feature.initialized,
                category: feature.category,
                dependencies: feature.dependencies,
                config: feature.getAllConfig()
            };
        }

        return info;
    }

    /**
     * Log feature status to console
     */
    logStatus() {
        console.group('[FeatureRegistry] Status');
        console.log('Total features:', this.features.size);
        console.log('Initialization order:', this.initOrder);

        for (const [id, feature] of this.features) {
            const status = feature.isEnabled() ? '✅' : '❌';
            const init = feature.initialized ? '(initialized)' : '(not initialized)';
            console.log(`  ${status} ${feature.name} [${feature.category}] ${init}`);
        }

        console.groupEnd();
    }
}

// Singleton instance
const FeatureRegistry = new FeatureRegistryClass();

export default FeatureRegistry;
