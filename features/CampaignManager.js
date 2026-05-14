/**
 * CampaignManager - Campaign package installer, validator, and lifecycle manager
 *
 * Workstream C from the ARG Expansion Master Plan.
 * Manages the install/enable/disable/uninstall lifecycle for campaign packages.
 *
 * Campaign packages are structured bundles of RetroScript files, content data,
 * mood presets, and asset references that define a narrative experience.
 *
 * Package layout:
 *   campaign.json          — Manifest (id, name, version, entryScript, dependencies)
 *   scripts/*.retro        — Scene scripts
 *   bindings.json          — Event-to-script trigger wiring
 *   mail/*.json            — Inbox message templates
 *   npc/*.json             — NPC dialogue/persona data
 *   filesystem-seed/**     — Files to inject into virtual FS
 *   moods/*.json           — Mood preset definitions
 *   assets/**              — Media assets (images, sounds)
 *
 * All campaign state is tracked in StorageManager under 'campaignRegistry'.
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus from '../core/EventBus.js';
import StorageManager from '../core/StorageManager.js';
import MediaAssetManager, { validateMediaManifest } from '../core/MediaAssetManager.js';
import MediaCueGraph from '../core/MediaCueGraph.js';

/**
 * Required fields in campaign.json
 */
const REQUIRED_MANIFEST_FIELDS = ['id', 'name', 'version'];

/**
 * Validate a campaign manifest
 * @param {Object} manifest - Campaign manifest (campaign.json contents)
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateManifest(manifest) {
    const errors = [];

    if (!manifest || typeof manifest !== 'object') {
        return { valid: false, errors: ['Manifest must be a JSON object'] };
    }

    for (const field of REQUIRED_MANIFEST_FIELDS) {
        if (!manifest[field] || typeof manifest[field] !== 'string') {
            errors.push(`Missing or invalid required field: "${field}"`);
        }
    }

    // Validate ID format (alphanumeric + hyphens)
    if (manifest.id && !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
        errors.push('Campaign ID must be lowercase alphanumeric with hyphens (e.g., "my-campaign")');
    }

    // Validate version format (semver-ish)
    if (manifest.version && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
        errors.push('Version must follow semver format (e.g., "1.0.0")');
    }

    // Validate entryScript if present
    if (manifest.entryScript && typeof manifest.entryScript !== 'string') {
        errors.push('entryScript must be a string path');
    }

    // Validate engine compatibility
    if (manifest.engine && manifest.engine.minVersion) {
        // Future: compare against actual engine version
    }

    // Validate dependencies array
    if (manifest.dependencies !== undefined && !Array.isArray(manifest.dependencies)) {
        errors.push('dependencies must be an array');
    }

    // Validate capabilities
    if (manifest.capabilities !== undefined && typeof manifest.capabilities !== 'object') {
        errors.push('capabilities must be an object');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate a campaign package structure
 * @param {Object} packageData - Full campaign package
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function validatePackage(packageData) {
    const errors = [];
    const warnings = [];

    if (!packageData || typeof packageData !== 'object') {
        return { valid: false, errors: ['Package must be an object'], warnings };
    }

    // Check manifest
    if (!packageData.manifest) {
        errors.push('Missing campaign.json manifest');
    } else {
        const manifestResult = validateManifest(packageData.manifest);
        errors.push(...manifestResult.errors);
    }

    // Check for entry script
    if (packageData.manifest?.entryScript) {
        if (!packageData.scripts || !packageData.scripts[packageData.manifest.entryScript]) {
            warnings.push(`Entry script "${packageData.manifest.entryScript}" not found in scripts`);
        }
    }

    // Check scripts
    if (packageData.scripts) {
        for (const [name, content] of Object.entries(packageData.scripts)) {
            if (typeof content !== 'string') {
                errors.push(`Script "${name}" must be a string`);
            }
        }
    }

    // Check bindings
    if (packageData.bindings && typeof packageData.bindings !== 'object') {
        errors.push('bindings.json must be an object');
    }

    // Validate media manifests (Phase 2)
    if (packageData.media) {
        const mediaTypes = ['audio', 'video', 'images'];
        for (const mediaType of mediaTypes) {
            if (packageData.media[mediaType]) {
                if (typeof packageData.media[mediaType] !== 'object') {
                    errors.push(`media/${mediaType} manifest must be an object`);
                } else {
                    const mediaResult = validateMediaManifest(packageData.media[mediaType]);
                    for (const err of mediaResult.errors) {
                        errors.push(`media/${mediaType}: ${err}`);
                    }
                    for (const warn of mediaResult.warnings) {
                        warnings.push(`media/${mediaType}: ${warn}`);
                    }
                }
            }
        }
    }

    // Validate cue graphs (Phase 2)
    if (packageData.cueGraphs) {
        if (typeof packageData.cueGraphs !== 'object') {
            errors.push('cueGraphs must be an object');
        } else {
            for (const [graphId, graphDef] of Object.entries(packageData.cueGraphs)) {
                const graphResult = MediaCueGraph.validate(graphDef);
                for (const err of graphResult.errors) {
                    errors.push(`cueGraph "${graphId}": ${err}`);
                }
                for (const warn of graphResult.warnings) {
                    warnings.push(`cueGraph "${graphId}": ${warn}`);
                }
            }
        }
    }

    // Validate media budgets (Phase 2)
    if (packageData.manifest?.mediaBudgets) {
        const budgets = packageData.manifest.mediaBudgets;
        if (typeof budgets !== 'object') {
            errors.push('manifest.mediaBudgets must be an object');
        } else {
            const validBudgetKeys = ['maxConcurrentAudio', 'maxConcurrentVideo', 'maxPreloadedAssets', 'maxPreloadBytes'];
            for (const [key, value] of Object.entries(budgets)) {
                if (!validBudgetKeys.includes(key)) {
                    warnings.push(`Unknown media budget key: "${key}"`);
                } else if (typeof value !== 'number' || value < 0) {
                    errors.push(`mediaBudgets.${key} must be a non-negative number`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}


class CampaignManager extends FeatureBase {
    constructor() {
        super({
            id: 'campaign-manager',
            name: 'Campaign Manager',
            description: 'Installs, validates, and manages narrative campaign packages',
            icon: '📦',
            category: 'core',
            dependencies: [],
            config: {},
            settings: []
        });

        // In-memory campaign registry
        // campaignId -> { manifest, status: 'installed'|'enabled'|'disabled', installedAt }
        this._campaigns = new Map();
    }

    async initialize() {
        this._loadRegistry();

        // Listen for campaign lifecycle commands
        this.subscribe('command:campaign:install', (payload) => {
            this._handleInstall(payload);
        });
        this.subscribe('command:campaign:uninstall', (payload) => {
            this._handleUninstall(payload);
        });
        this.subscribe('command:campaign:enable', (payload) => {
            this._handleEnable(payload);
        });
        this.subscribe('command:campaign:disable', (payload) => {
            this._handleDisable(payload);
        });
        this.subscribe('command:campaign:validate', (payload) => {
            this._handleValidate(payload);
        });

        // Query handlers
        this.subscribe('query:campaign:list', (payload) => {
            const campaigns = this.listCampaigns();
            EventBus.emit('query:campaign:list:response', {
                requestId: payload.requestId,
                campaigns
            });
        });
        this.subscribe('query:campaign:get', (payload) => {
            const campaign = this.getCampaign(payload.campaignId);
            EventBus.emit('query:campaign:get:response', {
                requestId: payload.requestId,
                campaign
            });
        });

        this.log('Initialized with', this._campaigns.size, 'installed campaigns');
    }

    // ==========================================
    // REGISTRY PERSISTENCE
    // ==========================================

    /**
     * Load campaign registry from storage
     * @private
     */
    _loadRegistry() {
        const saved = StorageManager.get('campaignRegistry');
        if (saved && typeof saved === 'object') {
            for (const [id, entry] of Object.entries(saved)) {
                this._campaigns.set(id, entry);
            }
        }
    }

    /**
     * Save campaign registry to storage
     * @private
     */
    _saveRegistry() {
        const data = {};
        for (const [id, entry] of this._campaigns) {
            data[id] = entry;
        }
        StorageManager.set('campaignRegistry', data);
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Install a campaign package
     * @param {Object} packageData - Campaign package data
     * @returns {{success: boolean, errors?: string[], warnings?: string[], campaignId?: string}}
     */
    install(packageData) {
        // Validate package
        const validation = validatePackage(packageData);
        if (!validation.valid) {
            return { success: false, errors: validation.errors, warnings: validation.warnings };
        }

        const manifest = packageData.manifest;
        const campaignId = manifest.id;

        // Check for ID collision
        if (this._campaigns.has(campaignId)) {
            const existing = this._campaigns.get(campaignId);
            if (existing.manifest.version === manifest.version) {
                return { success: false, errors: [`Campaign "${campaignId}" v${manifest.version} already installed`] };
            }
            // Allow version upgrade — uninstall old first
            this.uninstall(campaignId);
        }

        // Dry-run script parse validation (if ScriptEngine available)
        const parseErrors = this._validateScripts(packageData.scripts || {});
        if (parseErrors.length > 0) {
            return { success: false, errors: parseErrors, warnings: validation.warnings };
        }

        // Register campaign
        this._campaigns.set(campaignId, {
            manifest,
            scripts: packageData.scripts || {},
            bindings: packageData.bindings || {},
            mail: packageData.mail || {},
            npc: packageData.npc || {},
            moods: packageData.moods || {},
            media: packageData.media || {},
            cueGraphs: packageData.cueGraphs || {},
            filesystemSeed: packageData.filesystemSeed || {},
            status: 'installed',
            installedAt: Date.now()
        });

        this._saveRegistry();

        // Register media manifests with MediaAssetManager (Phase 2)
        this._registerMediaAssets(campaignId, packageData.media);

        EventBus.emit('story:campaign:install', {
            campaignId,
            name: manifest.name,
            version: manifest.version,
            timestamp: Date.now()
        });

        this.log(`Campaign installed: ${manifest.name} (${campaignId}) v${manifest.version}`);

        return {
            success: true,
            campaignId,
            warnings: validation.warnings
        };
    }

    /**
     * Uninstall a campaign
     * @param {string} campaignId - Campaign ID
     * @returns {boolean} True if campaign was uninstalled
     */
    uninstall(campaignId) {
        if (!this._campaigns.has(campaignId)) return false;

        const campaign = this._campaigns.get(campaignId);

        // Disable first if enabled
        if (campaign.status === 'enabled') {
            this.disable(campaignId);
        } else {
            // Installed/disabled campaigns still have registered media manifests from install().
            MediaAssetManager.unregisterManifest(campaignId);

            // If cue graphs were previously created and persisted, ensure they are removed.
            if (campaign.cueGraphs) {
                for (const graphId of Object.keys(campaign.cueGraphs)) {
                    MediaCueGraph.destroy(`${campaignId}:${graphId}`);
                }
            }
        }

        this._campaigns.delete(campaignId);
        this._saveRegistry();

        EventBus.emit('story:campaign:uninstall', {
            campaignId,
            timestamp: Date.now()
        });

        this.log(`Campaign uninstalled: ${campaignId}`);
        return true;
    }

    /**
     * Enable a campaign for playback
     * @param {string} campaignId - Campaign ID
     * @returns {boolean} True if campaign was enabled
     */
    enable(campaignId) {
        const campaign = this._campaigns.get(campaignId);
        if (!campaign) return false;
        if (campaign.status === 'enabled') return false; // Idempotent

        // Re-register media assets in case this campaign was previously disabled.
        this._registerMediaAssets(campaignId, campaign.media);

        campaign.status = 'enabled';
        this._saveRegistry();

        // Seed filesystem if campaign has filesystem-seed data
        this._seedFilesystem(campaignId, campaign.filesystemSeed);

        // Apply media budgets if specified (Phase 2)
        if (campaign.manifest?.mediaBudgets) {
            MediaAssetManager.setBudgets(campaign.manifest.mediaBudgets);
        }

        // Register cue graphs (Phase 2)
        if (campaign.cueGraphs) {
            for (const [graphId, graphDef] of Object.entries(campaign.cueGraphs)) {
                MediaCueGraph.create(`${campaignId}:${graphId}`, graphDef);
            }
        }

        EventBus.emit('story:campaign:enable', {
            campaignId,
            timestamp: Date.now()
        });

        this.log(`Campaign enabled: ${campaignId}`);
        return true;
    }

    /**
     * Disable a campaign
     * @param {string} campaignId - Campaign ID
     * @returns {boolean} True if campaign was disabled
     */
    disable(campaignId) {
        const campaign = this._campaigns.get(campaignId);
        if (!campaign) return false;
        if (campaign.status === 'disabled' || campaign.status === 'installed') return false;

        campaign.status = 'disabled';
        this._saveRegistry();

        // Clean up media resources (Phase 2)
        MediaAssetManager.unregisterManifest(campaignId);
        // Destroy campaign cue graphs
        if (campaign.cueGraphs) {
            for (const graphId of Object.keys(campaign.cueGraphs)) {
                MediaCueGraph.destroy(`${campaignId}:${graphId}`);
            }
        }

        EventBus.emit('story:campaign:disable', {
            campaignId,
            timestamp: Date.now()
        });

        this.log(`Campaign disabled: ${campaignId}`);
        return true;
    }

    /**
     * Get a campaign by ID
     * @param {string} campaignId - Campaign ID
     * @returns {Object|null} Campaign data
     */
    getCampaign(campaignId) {
        const campaign = this._campaigns.get(campaignId);
        if (!campaign) return null;
        return {
            id: campaignId,
            manifest: campaign.manifest,
            status: campaign.status,
            installedAt: campaign.installedAt,
            hasScripts: Object.keys(campaign.scripts || {}).length > 0,
            hasBindings: Object.keys(campaign.bindings || {}).length > 0,
            hasMail: Object.keys(campaign.mail || {}).length > 0,
            hasMoods: Object.keys(campaign.moods || {}).length > 0,
            hasMedia: Object.keys(campaign.media || {}).length > 0,
            hasCueGraphs: Object.keys(campaign.cueGraphs || {}).length > 0
        };
    }

    /**
     * List all installed campaigns
     * @returns {Object[]} Array of campaign summaries
     */
    listCampaigns() {
        const list = [];
        for (const [id, campaign] of this._campaigns) {
            list.push({
                id,
                name: campaign.manifest.name,
                version: campaign.manifest.version,
                status: campaign.status,
                installedAt: campaign.installedAt
            });
        }
        return list;
    }

    /**
     * Validate a campaign package without installing
     * @param {Object} packageData - Campaign package data
     * @returns {{valid: boolean, errors: string[], warnings: string[]}}
     */
    validate(packageData) {
        const result = validatePackage(packageData);

        // Also validate scripts
        if (packageData.scripts) {
            const parseErrors = this._validateScripts(packageData.scripts);
            result.errors.push(...parseErrors);
            if (parseErrors.length > 0) {
                result.valid = false;
            }
        }

        return result;
    }

    /**
     * Get campaign scripts (for script runner)
     * @param {string} campaignId - Campaign ID
     * @returns {Object|null} Scripts map or null
     */
    getCampaignScripts(campaignId) {
        const campaign = this._campaigns.get(campaignId);
        return campaign ? { ...campaign.scripts } : null;
    }

    /**
     * Get campaign bindings
     * @param {string} campaignId - Campaign ID
     * @returns {Object|null} Bindings or null
     */
    getCampaignBindings(campaignId) {
        const campaign = this._campaigns.get(campaignId);
        return campaign ? { ...campaign.bindings } : null;
    }

    /**
     * Get campaign mood presets
     * @param {string} campaignId - Campaign ID
     * @returns {Object|null} Moods map or null
     */
    getCampaignMoods(campaignId) {
        const campaign = this._campaigns.get(campaignId);
        return campaign ? { ...campaign.moods } : null;
    }

    // ==========================================
    // INTERNAL HELPERS
    // ==========================================

    /**
     * Register media assets from a campaign's media manifests
     * @private
     * @param {string} campaignId - Campaign ID
     * @param {Object} media - Media data { audio: {}, video: {}, images: {} }
     */
    _registerMediaAssets(campaignId, media) {
        if (!media || typeof media !== 'object') return;

        // Merge all media type manifests into a single flat manifest for the asset manager
        const merged = {};
        for (const [, typeManifest] of Object.entries(media)) {
            if (typeManifest && typeof typeManifest === 'object') {
                Object.assign(merged, typeManifest);
            }
        }

        if (Object.keys(merged).length > 0) {
            const result = MediaAssetManager.registerManifest(campaignId, merged);
            if (!result.valid) {
                this.warn(`Media manifest registration for "${campaignId}" had errors:`, result.errors);
            }
        }
    }

    /**
     * Lint a campaign's media configuration
     * @param {string} campaignId - Campaign ID
     * @returns {{errors: string[], warnings: string[], info: string[]}|null}
     */
    lintMedia(campaignId) {
        const campaign = this._campaigns.get(campaignId);
        if (!campaign) return null;

        return MediaAssetManager.lintCampaignMedia(campaignId, {
            scripts: campaign.scripts
        });
    }

    /**
     * Validate scripts by parsing them (dry run)
     * @private
     * @param {Object} scripts - Map of scriptName -> source
     * @returns {string[]} Parse errors
     */
    _validateScripts(scripts) {
        const errors = [];
        // Dynamic import to avoid circular dependency
        try {
            // We import ScriptEngine lazily via context if available
            const ScriptEngine = window.__RETROS_DEBUG?.scriptEngine;
            if (ScriptEngine && typeof ScriptEngine.parse === 'function') {
                for (const [name, source] of Object.entries(scripts)) {
                    if (typeof source !== 'string') continue;
                    const result = ScriptEngine.parse(source);
                    if (!result.success) {
                        errors.push(`Script "${name}": ${result.error?.message || 'Parse error'}`);
                    }
                }
            }
        } catch (e) {
            // ScriptEngine not available — skip parse validation
        }
        return errors;
    }

    /**
     * Seed the virtual filesystem with campaign files
     * @private
     * @param {string} campaignId - Campaign ID
     * @param {Object} seed - Filesystem seed data
     */
    _seedFilesystem(campaignId, seed) {
        if (!seed || typeof seed !== 'object' || Object.keys(seed).length === 0) return;

        try {
            // Use EventBus to request filesystem writes (avoids circular imports)
            const basePath = `C:/Campaigns/${campaignId}`;
            EventBus.emit('command:fs:mkdir', { path: basePath });

            for (const [relativePath, content] of Object.entries(seed)) {
                const fullPath = `${basePath}/${relativePath}`;
                // Create parent directories
                const parts = fullPath.split('/');
                parts.pop(); // Remove filename
                EventBus.emit('command:fs:mkdir', { path: parts.join('/') });
                // Write file
                EventBus.emit('command:fs:write', { path: fullPath, content: String(content) });
            }

            this.log(`Seeded filesystem for campaign: ${campaignId}`);
        } catch (error) {
            this.warn(`Failed to seed filesystem for ${campaignId}:`, error.message);
        }
    }

    /**
     * Handle install command
     * @private
     */
    _handleInstall(payload) {
        payload = payload || {};
        const result = this.install(payload.packageData || payload);
        if (payload.requestId) {
            EventBus.emit('action:result', {
                requestId: payload.requestId,
                success: result.success,
                data: result
            });
        }
    }

    /**
     * Handle uninstall command
     * @private
     */
    _handleUninstall(payload) {
        payload = payload || {};
        const success = this.uninstall(payload.campaignId);
        if (payload.requestId) {
            EventBus.emit('action:result', {
                requestId: payload.requestId,
                success,
                data: { campaignId: payload.campaignId }
            });
        }
    }

    /**
     * Handle enable command
     * @private
     */
    _handleEnable(payload) {
        payload = payload || {};
        const success = this.enable(payload.campaignId);
        if (payload.requestId) {
            EventBus.emit('action:result', {
                requestId: payload.requestId,
                success,
                data: { campaignId: payload.campaignId }
            });
        }
    }

    /**
     * Handle disable command
     * @private
     */
    _handleDisable(payload) {
        payload = payload || {};
        const success = this.disable(payload.campaignId);
        if (payload.requestId) {
            EventBus.emit('action:result', {
                requestId: payload.requestId,
                success,
                data: { campaignId: payload.campaignId }
            });
        }
    }

    /**
     * Handle validate command
     * @private
     */
    _handleValidate(payload) {
        payload = payload || {};
        const result = this.validate(payload.packageData || payload);
        if (payload.requestId) {
            EventBus.emit('action:result', {
                requestId: payload.requestId,
                success: result.valid,
                data: result
            });
        }
    }
}

// Export singleton instance
const campaignManager = new CampaignManager();

// Debug access for Campaign Studio
if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.campaignManager = campaignManager;
}

export default campaignManager;
