/**
 * PluginLoader - Loads and manages third-party plugins
 * Plugins can provide new features, apps, themes, and more
 *
 * Plugin Structure:
 *   /plugins/features/my-plugin/
 *     ├── index.js           (plugin entry point)
 *     ├── MyFeature.js       (feature implementation)
 *     └── README.md          (plugin documentation)
 *
 * Plugin Export Format:
 *   export default {
 *       id: 'my-plugin',
 *       name: 'My Plugin',
 *       version: '1.0.0',
 *       author: 'Author Name',
 *       features: [new MyFeature()],
 *       apps: [new MyApp()],
 *       onLoad: () => { },
 *       onUnload: () => { }
 *   };
 */

import FeatureRegistry from './FeatureRegistry.js';
import EventBus from './EventBus.js';
import StorageManager from './StorageManager.js';
import SubscriptionManager from './SubscriptionManager.js';

class PluginLoaderClass {
    constructor() {
        // Map of plugin id -> plugin object
        this.plugins = new Map();

        // Map of feature id -> plugin id (track which plugin provides which feature)
        this.pluginFeatures = new Map();

        // Map of app id -> plugin id (track which plugin provides which app)
        this.pluginApps = new Map();

        // Loaded state
        this.initialized = false;
    }

    /**
     * Normalize a manifest into a safe shape.
     * Keeps only valid plugin entries and normalizes enabled/path fields.
     * @param {*} manifest
     * @returns {{plugins: Array<{path: string, enabled: boolean}>}}
     * @private
     */
    _normalizeManifest(manifest) {
        const plugins = Array.isArray(manifest?.plugins)
            ? manifest.plugins
            : [];

        return {
            plugins: plugins
                .filter(plugin => plugin && typeof plugin.path === 'string' && plugin.path.trim())
                .map(plugin => ({
                    path: plugin.path.trim(),
                    enabled: plugin.enabled !== false
                }))
        };
    }

    /**
     * Validate the shape of a plugin module before any registration runs.
     * Returns a string explaining the first problem found, or `null` if the
     * plugin looks well-formed. Caller is expected to reject and not load.
     *
     * Catches the cases that used to produce silent half-loads:
     *   - missing/empty `id`
     *   - `features` / `apps` declared but not an array
     *   - duplicate feature IDs within the plugin
     *   - duplicate app IDs within the plugin
     *   - feature `dependencies` that don't resolve in the current registry
     *
     * @param {Object} plugin
     * @returns {string|null}
     * @private
     */
    _validatePluginManifest(plugin) {
        if (!plugin || typeof plugin !== 'object') {
            return 'plugin module did not export an object';
        }
        if (typeof plugin.id !== 'string' || !plugin.id.trim()) {
            return 'plugin is missing a string `id`';
        }
        if (plugin.id.length > 64) {
            return `plugin id "${plugin.id}" is too long (max 64 chars)`;
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(plugin.id)) {
            return `plugin id "${plugin.id}" must match /^[a-zA-Z0-9._-]+$/`;
        }
        if (plugin.features !== undefined && !Array.isArray(plugin.features)) {
            return '`features` must be an array';
        }
        if (plugin.apps !== undefined && !Array.isArray(plugin.apps)) {
            return '`apps` must be an array';
        }
        if (plugin.onLoad !== undefined && typeof plugin.onLoad !== 'function') {
            return '`onLoad` must be a function';
        }
        if (plugin.onUnload !== undefined && typeof plugin.onUnload !== 'function') {
            return '`onUnload` must be a function';
        }

        // Catch duplicate feature/app IDs within the plugin so we can fail
        // before partial registration.
        if (Array.isArray(plugin.features)) {
            const seen = new Set();
            for (const feature of plugin.features) {
                if (!feature || typeof feature.id !== 'string' || !feature.id) {
                    return 'every entry in `features` must have a string id';
                }
                if (seen.has(feature.id)) {
                    return `duplicate feature id "${feature.id}" within plugin`;
                }
                seen.add(feature.id);

                // Validate declared feature dependencies up front so we don't
                // register a feature whose dep won't resolve. Plugin features
                // can depend on either core features or features earlier in
                // this same manifest, so check both registries.
                if (Array.isArray(feature.dependencies)) {
                    for (const dep of feature.dependencies) {
                        const knownLocally = plugin.features.some(f => f.id === dep);
                        const knownGlobally = FeatureRegistry.get(dep) !== undefined;
                        if (!knownLocally && !knownGlobally) {
                            return `feature "${feature.id}" depends on missing "${dep}"`;
                        }
                    }
                }
            }
        }

        if (Array.isArray(plugin.apps)) {
            const seen = new Set();
            for (const app of plugin.apps) {
                if (!app || typeof app.id !== 'string' || !app.id) {
                    return 'every entry in `apps` must have a string id';
                }
                if (seen.has(app.id)) {
                    return `duplicate app id "${app.id}" within plugin`;
                }
                seen.add(app.id);
            }
        }

        return null;
    }

    /**
     * Track plugin-owned apps only when registration succeeded.
     * Prevents accidental ownership claims on duplicate app IDs.
     * @private
     */
    _trackRegisteredPluginApp(app, pluginId, registrationResult) {
        const appId = app?.id;
        if (!appId || registrationResult !== true) return;
        if (app.pluginId !== pluginId) return;
        this.pluginApps.set(appId, pluginId);
    }

    /**
     * Unregister a plugin app only if ownership still matches.
     * @private
     */
    async _unregisterPluginApp(appId, pluginId) {
        const { default: AppRegistry } = await import('../apps/AppRegistry.js');
        const app = AppRegistry.get(appId);

        // Nothing to unregister, just clean stale tracking
        if (!app) {
            this.pluginApps.delete(appId);
            return;
        }

        // Never unregister apps we don't own
        if (app.pluginId !== pluginId) {
            console.warn(`[PluginLoader] Skipping unregister for app "${appId}" - ownership mismatch (expected ${pluginId}, found ${app.pluginId || 'none'})`);
            this.pluginApps.delete(appId);
            return;
        }

        AppRegistry.unregister(appId);
        this.pluginApps.delete(appId);
    }

    /**
     * Load a plugin from a module
     * @param {Object} pluginModule - Imported plugin module
     * @returns {boolean} Success status
     */
    async loadPlugin(pluginModule) {
        const plugin = pluginModule?.default || pluginModule;

        // W3.7 — manifest validation BEFORE any registration. A plugin
        // with a missing id, duplicate feature ids, or a feature whose
        // declared dependency doesn't exist used to silently half-load.
        // Now we reject up front.
        const validationError = this._validatePluginManifest(plugin);
        if (validationError) {
            console.error(`[PluginLoader] Rejected plugin: ${validationError}`);
            return false;
        }

        // Check if already loaded (covered above by id presence guarantee)
        if (this.plugins.has(plugin.id)) {
            console.warn(`[PluginLoader] Plugin "${plugin.id}" already loaded`);
            return false;
        }

        // W3.7 — transactional load. We collect which features/apps we
        // managed to register so we can roll them back precisely if any
        // later step (onLoad, app registration, feature init) throws.
        // The plugin is NOT marked `loaded: true` until everything succeeds.
        const registeredFeatureIds = [];
        const registeredAppIds = [];

        try {
            // Register features if provided
            if (Array.isArray(plugin.features)) {
                for (const feature of plugin.features) {
                    // Mark feature as plugin-provided
                    feature.category = 'plugin';
                    feature.pluginId = plugin.id;

                    FeatureRegistry.register(feature);
                    this.pluginFeatures.set(feature.id, plugin.id);
                    registeredFeatureIds.push(feature.id);
                }
            }

            // Register apps if provided (if AppRegistry is available)
            if (Array.isArray(plugin.apps)) {
                // Import AppRegistry dynamically to avoid circular dependencies
                const { default: AppRegistry } = await import('../apps/AppRegistry.js');
                for (const app of plugin.apps) {
                    app.pluginId = plugin.id;
                    const registrationResult = AppRegistry.register(app);
                    this._trackRegisteredPluginApp(app, plugin.id, registrationResult);
                    if (registrationResult === true) {
                        registeredAppIds.push(app.id);
                    }
                }
            }

            // Call plugin's onLoad hook if provided.
            // Wrap in SubscriptionManager.runAs so any raw EventBus.on() /
            // StateManager.subscribe() calls inside onLoad are tracked
            // against this plugin's ID and cleaned up on unload.
            if (typeof plugin.onLoad === 'function') {
                await SubscriptionManager.runAs(plugin.id, () => plugin.onLoad());
            }

            // Everything succeeded — NOW it's safe to mark the plugin as loaded.
            this.plugins.set(plugin.id, {
                ...plugin,
                loaded: true,
                loadTime: Date.now()
            });

            console.log(`[PluginLoader] Loaded plugin: ${plugin.name || plugin.id} v${plugin.version || '1.0.0'}`);

            EventBus.emit('plugin:loaded', {
                pluginId: plugin.id,
                name: plugin.name,
                version: plugin.version
            });

            return true;
        } catch (error) {
            console.error(`[PluginLoader] Failed to load plugin "${plugin.id}" — rolling back:`, error);

            // Roll back ONLY the registrations we tracked above. We don't
            // walk pluginFeatures/pluginApps blindly because another plugin
            // could share a feature ID transiently (unlikely, but the maps
            // are the wrong source of truth for "what did THIS load do").
            for (const featureId of registeredFeatureIds) {
                try {
                    await FeatureRegistry.unregister(featureId);
                } catch (e) {
                    console.warn(`[PluginLoader] Rollback unregister feature "${featureId}" failed:`, e);
                }
                this.pluginFeatures.delete(featureId);
            }
            for (const appId of registeredAppIds) {
                try {
                    await this._unregisterPluginApp(appId, plugin.id);
                } catch (e) {
                    console.warn(`[PluginLoader] Rollback unregister app "${appId}" failed:`, e);
                }
            }

            // Release any subscriptions that onLoad managed to register
            // before it threw.
            SubscriptionManager.unsubscribeAll(plugin.id);

            // Run onUnload as a courtesy if it's defined, so plugins that
            // hold non-subscription resources (timers, fetch handles) can
            // clean themselves up symmetrically.
            if (typeof plugin.onUnload === 'function') {
                try {
                    await plugin.onUnload();
                } catch (e) {
                    console.warn(`[PluginLoader] Plugin onUnload during rollback also failed:`, e);
                }
            }

            return false;
        }
    }

    /**
     * Load a plugin from a path (dynamic import)
     * @param {string} pluginPath - Path to plugin module
     * @returns {boolean} Success status
     */
    async loadPluginFromPath(pluginPath) {
        // Enforce strict allowlist to prevent arbitrary code execution
        const ALLOWED_PATTERN = /^\.\/plugins\/features\/[a-zA-Z0-9_-]+\/index\.js$/;
        if (!ALLOWED_PATTERN.test(pluginPath)) {
            console.error(`[PluginLoader] Blocked untrusted plugin path: ${pluginPath}`);
            return false;
        }

        try {
            const pluginModule = await import(pluginPath);
            return await this.loadPlugin(pluginModule);
        } catch (error) {
            console.error(`[PluginLoader] Failed to load plugin from ${pluginPath}:`, error);
            return false;
        }
    }

    /**
     * Load all plugins from the manifest
     */
    async loadAllPlugins() {
        console.log('[PluginLoader] Loading plugins...');

        // Get plugin manifest from storage
        const manifest = this.getPluginManifest();

        if (!manifest || !manifest.plugins || manifest.plugins.length === 0) {
            console.log('[PluginLoader] No plugins configured');
            return;
        }

        // Load each plugin (isolated so one failure doesn't stop others)
        for (const pluginConfig of manifest.plugins) {
            if (pluginConfig.enabled !== false) {
                try {
                    await this.loadPluginFromPath(pluginConfig.path);
                } catch (err) {
                    console.error(`[PluginLoader] Failed to load plugin at '${pluginConfig.path}':`, err);
                }
            }
        }

        this.initialized = true;
        console.log(`[PluginLoader] Loaded ${this.plugins.size} plugins`);

        EventBus.emit('plugins:loaded', { count: this.plugins.size });
    }

    /**
     * Unload a plugin
     * @param {string} pluginId - Plugin ID
     * @returns {boolean} Success status
     */
    async unloadPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            console.warn(`[PluginLoader] Plugin "${pluginId}" not found`);
            return false;
        }

        try {
            // Unregister all features from this plugin (disables, cleans up, removes from registry)
            const featuresToRemove = [...this.pluginFeatures.entries()].filter(([, pid]) => pid === pluginId);
            for (const [featureId] of featuresToRemove) {
                await FeatureRegistry.unregister(featureId);
                this.pluginFeatures.delete(featureId);
            }

            // Unregister all apps from this plugin
            const appsToRemove = [...this.pluginApps.entries()].filter(([, pid]) => pid === pluginId);
            for (const [appId] of appsToRemove) {
                await this._unregisterPluginApp(appId, pluginId);
            }

            // Call plugin's onUnload hook if provided
            if (typeof plugin.onUnload === 'function') {
                try {
                    await plugin.onUnload();
                } catch (error) {
                    console.error(`[PluginLoader] Error in plugin ${pluginId} onUnload:`, error);
                }
            }

            // Release any subscriptions still tracked against this plugin
            // (raw EventBus.on() / StateManager.subscribe() calls inside
            // onLoad that bypassed feature-level cleanup).
            SubscriptionManager.unsubscribeAll(pluginId);

            this.plugins.delete(pluginId);

            console.log(`[PluginLoader] Unloaded plugin: ${pluginId}`);

            EventBus.emit('plugin:unloaded', { id: pluginId });

            return true;
        } catch (error) {
            console.error(`[PluginLoader] Failed to unload plugin ${pluginId}:`, error);
            return false;
        }
    }

    /**
     * Get plugin manifest from storage
     * @returns {Object} Plugin manifest
     */
    getPluginManifest() {
        const rawManifest = StorageManager.get('plugin_manifest');
        return this._normalizeManifest(rawManifest);
    }

    /**
     * Save plugin manifest to storage
     * @param {Object} manifest - Plugin manifest
     */
    savePluginManifest(manifest) {
        StorageManager.set('plugin_manifest', this._normalizeManifest(manifest));
    }

    /**
     * Add a plugin to the manifest
     * @param {Object} pluginConfig - Plugin configuration { path, enabled }
     */
    addToManifest(pluginConfig) {
        const manifest = this.getPluginManifest();
        const normalizedInput = this._normalizeManifest({ plugins: [pluginConfig] });
        const nextPlugin = normalizedInput.plugins[0];
        if (!nextPlugin) {
            console.warn('[PluginLoader] Ignoring invalid plugin config in addToManifest');
            return;
        }

        // Check if already exists
        const existing = manifest.plugins.find(p => p.path === nextPlugin.path);
        if (existing) {
            existing.enabled = nextPlugin.enabled;
        } else {
            manifest.plugins.push(nextPlugin);
        }

        this.savePluginManifest(manifest);
    }

    /**
     * Remove a plugin from the manifest
     * @param {string} pluginPath - Path to remove
     */
    removeFromManifest(pluginPath) {
        if (typeof pluginPath !== 'string' || !pluginPath.trim()) {
            console.warn('[PluginLoader] Ignoring invalid plugin path in removeFromManifest');
            return;
        }

        const normalizedPath = pluginPath.trim();
        const manifest = this.getPluginManifest();
        manifest.plugins = manifest.plugins.filter(p => p.path !== normalizedPath);
        this.savePluginManifest(manifest);
    }

    /**
     * Get all loaded plugins
     * @returns {Array} Array of plugin objects
     */
    getAll() {
        return Array.from(this.plugins.values());
    }

    /**
     * Get a specific plugin
     * @param {string} pluginId - Plugin ID
     * @returns {Object|undefined} Plugin object
     */
    get(pluginId) {
        return this.plugins.get(pluginId);
    }

    /**
     * Check if a plugin is loaded
     * @param {string} pluginId - Plugin ID
     * @returns {boolean}
     */
    isLoaded(pluginId) {
        return this.plugins.has(pluginId);
    }

    /**
     * Get features provided by a plugin
     * @param {string} pluginId - Plugin ID
     * @returns {string[]} Array of feature IDs
     */
    getPluginFeatures(pluginId) {
        const features = [];
        for (const [featureId, pid] of this.pluginFeatures) {
            if (pid === pluginId) {
                features.push(featureId);
            }
        }
        return features;
    }

    /**
     * Get the plugin that provides a feature
     * @param {string} featureId - Feature ID
     * @returns {string|undefined} Plugin ID
     */
    getFeaturePlugin(featureId) {
        return this.pluginFeatures.get(featureId);
    }

    /**
     * Get debug info about plugins
     * @returns {Object}
     */
    getDebugInfo() {
        return {
            initialized: this.initialized,
            pluginCount: this.plugins.size,
            plugins: Array.from(this.plugins.entries()).map(([id, plugin]) => ({
                id,
                name: plugin.name,
                version: plugin.version,
                author: plugin.author,
                features: this.getPluginFeatures(id)
            }))
        };
    }

    /**
     * Log plugin status to console
     */
    logStatus() {
        console.group('[PluginLoader] Status');
        console.log('Total plugins:', this.plugins.size);

        for (const [id, plugin] of this.plugins) {
            console.log(`  ${plugin.name || id} v${plugin.version || '1.0.0'} by ${plugin.author || 'Unknown'}`);
            const features = this.getPluginFeatures(id);
            if (features.length > 0) {
                console.log(`    Features: ${features.join(', ')}`);
            }
        }

        console.groupEnd();
    }
}

// Singleton instance
const PluginLoader = new PluginLoaderClass();

export default PluginLoader;
