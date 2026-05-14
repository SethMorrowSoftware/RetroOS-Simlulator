/**
 * MediaAssetManager - Media asset pipeline, manifest validation, and budget enforcement
 *
 * Phase 2 of the ARG Expansion Master Plan (Workstream C).
 * Provides:
 *   - Asset manifest model with stable IDs, checksums, locale tags, and fallback variants
 *   - Preload management with priority tiers
 *   - Media budget enforcement (concurrent streams, memory, preload limits)
 *   - Asset validation and lint checks
 *   - Integration with CueGraph for sequenced playback
 *
 * All asset lifecycle events emit canonical media:asset:* and media:budget:* events.
 *
 * Usage:
 *   import MediaAssetManager from './core/MediaAssetManager.js';
 *   MediaAssetManager.initialize();
 *   MediaAssetManager.registerManifest(campaignId, manifest);
 *   const asset = MediaAssetManager.resolve('forest-ambience');
 */

import EventBus from './EventBus.js';

// ==========================================
// CONSTANTS
// ==========================================

/**
 * Default media budget limits
 */
const DEFAULT_BUDGETS = {
    maxConcurrentAudio: 8,
    maxConcurrentVideo: 2,
    maxPreloadedAssets: 32,
    maxPreloadBytes: 50 * 1024 * 1024, // 50 MB
    budgetWarningThreshold: 0.75        // warn at 75% usage
};

/**
 * Supported media types and their extensions
 */
const MEDIA_TYPES = {
    audio: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'webm'],
    video: ['mp4', 'webm', 'ogv'],
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
};

/**
 * Audio channel groups with default priority ordering.
 * Higher priority groups interrupt lower ones when budget is reached.
 */
const AUDIO_GROUPS = {
    voice:    { priority: 100, maxConcurrent: 2 },
    ui:       { priority: 90,  maxConcurrent: 4 },
    diegetic: { priority: 80,  maxConcurrent: 4 },
    music:    { priority: 50,  maxConcurrent: 2 },
    ambience: { priority: 30,  maxConcurrent: 4 },
    stinger:  { priority: 70,  maxConcurrent: 2 }
};

/**
 * Validate a single asset entry from a manifest.
 * @param {Object} asset - Asset entry
 * @param {string} assetId - Asset ID
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateAssetEntry(asset, assetId) {
    const errors = [];

    if (!asset || typeof asset !== 'object') {
        return { valid: false, errors: [`Asset "${assetId}": must be an object`] };
    }

    if (!asset.src || typeof asset.src !== 'string') {
        errors.push(`Asset "${assetId}": missing or invalid "src" (string path required)`);
    }

    if (!asset.type || !['audio', 'video', 'image'].includes(asset.type)) {
        errors.push(`Asset "${assetId}": "type" must be one of: audio, video, image`);
    }

    if (asset.src && asset.type) {
        const ext = asset.src.split('.').pop()?.toLowerCase();
        const allowedExts = MEDIA_TYPES[asset.type];
        if (allowedExts && ext && !allowedExts.includes(ext)) {
            errors.push(`Asset "${assetId}": extension ".${ext}" not typical for type "${asset.type}"`);
        }
    }

    if (asset.sizeBytes !== undefined && (typeof asset.sizeBytes !== 'number' || asset.sizeBytes < 0)) {
        errors.push(`Asset "${assetId}": "sizeBytes" must be a non-negative number`);
    }

    if (asset.checksum !== undefined && typeof asset.checksum !== 'string') {
        errors.push(`Asset "${assetId}": "checksum" must be a string`);
    }

    if (asset.locale !== undefined && typeof asset.locale !== 'string') {
        errors.push(`Asset "${assetId}": "locale" must be a string`);
    }

    if (asset.fallback !== undefined && typeof asset.fallback !== 'string') {
        errors.push(`Asset "${assetId}": "fallback" must be a string (ID of fallback asset)`);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate a full media manifest.
 * @param {Object} manifest - Map of assetId -> asset definition
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function validateMediaManifest(manifest) {
    const errors = [];
    const warnings = [];

    if (!manifest || typeof manifest !== 'object') {
        return { valid: false, errors: ['Media manifest must be an object'], warnings };
    }

    const assetIds = new Set();
    const referencedFallbacks = new Set();

    for (const [assetId, asset] of Object.entries(manifest)) {
        // Validate ID format
        if (!/^[a-z0-9][a-z0-9._-]*$/.test(assetId)) {
            errors.push(`Asset ID "${assetId}": must be lowercase alphanumeric with hyphens/dots/underscores`);
        }

        assetIds.add(assetId);

        const result = validateAssetEntry(asset, assetId);
        errors.push(...result.errors);

        if (asset.fallback) {
            referencedFallbacks.add(asset.fallback);
        }
    }

    // Check for orphaned fallback references
    for (const fallbackId of referencedFallbacks) {
        if (!assetIds.has(fallbackId)) {
            warnings.push(`Fallback asset "${fallbackId}" referenced but not defined in manifest`);
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}


class MediaAssetManagerClass {
    constructor() {
        this.initialized = false;

        // Campaign-scoped asset registries: campaignId -> Map<assetId, assetDef>
        this._manifests = new Map();

        // Preload cache: assetId -> { loaded: boolean, element: HTMLElement|null, sizeBytes }
        this._preloaded = new Map();

        // Active playback tracking
        this._activeCues = new Map(); // cueId -> { type, assetId, group, element, startedAt }

        // Budget configuration (can be overridden per-campaign)
        this._budgets = { ...DEFAULT_BUDGETS };

        // Per-group ducking state
        this._duckState = new Map(); // group -> { originalVolume, level, timer }

        // Current campaign scope
        this._activeCampaignId = null;
    }

    /**
     * Initialize the asset manager
     */
    initialize() {
        if (this.initialized) return;

        // Listen for campaign lifecycle events
        EventBus.on('story:start', (payload) => {
            this._activeCampaignId = payload.campaignId || null;
        });
        EventBus.on('story:end', () => {
            this.stopAllCues();
            this._activeCampaignId = null;
        });

        this.initialized = true;
        console.log('[MediaAssetManager] Initialized');
    }

    // ==========================================
    // MANIFEST REGISTRATION
    // ==========================================

    /**
     * Register a media manifest for a campaign
     * @param {string} campaignId - Campaign identifier
     * @param {Object} manifest - Map of assetId -> asset definition
     * @returns {{valid: boolean, errors: string[], warnings: string[]}}
     */
    registerManifest(campaignId, manifest) {
        const validation = validateMediaManifest(manifest);

        if (!validation.valid) {
            console.warn(`[MediaAssetManager] Manifest for "${campaignId}" has errors:`, validation.errors);
            return validation;
        }

        const assetMap = new Map();
        for (const [assetId, asset] of Object.entries(manifest)) {
            assetMap.set(assetId, { ...asset, id: assetId });
        }

        this._manifests.set(campaignId, assetMap);
        console.log(`[MediaAssetManager] Registered manifest for "${campaignId}" with ${assetMap.size} assets`);

        return validation;
    }

    /**
     * Unregister a campaign's media manifest
     * @param {string} campaignId
     */
    unregisterManifest(campaignId) {
        this._manifests.delete(campaignId);
    }

    /**
     * Resolve an asset by ID across all registered manifests.
     * Tries active campaign first, then falls back to others.
     * @param {string} assetId - Asset identifier
     * @returns {Object|null} Asset definition or null
     */
    resolve(assetId) {
        if (!assetId) return null;

        // Try active campaign first
        if (this._activeCampaignId) {
            const campaignAssets = this._manifests.get(this._activeCampaignId);
            if (campaignAssets) {
                const asset = campaignAssets.get(assetId);
                if (asset) return asset;
            }
        }

        // Search all manifests
        for (const [, campaignAssets] of this._manifests) {
            const asset = campaignAssets.get(assetId);
            if (asset) return asset;
        }

        return null;
    }

    /**
     * Resolve an asset with fallback chain.
     * If the primary asset is missing, follow fallback references.
     * @param {string} assetId
     * @param {number} [maxDepth=3] - Max fallback chain depth
     * @returns {Object|null}
     */
    resolveWithFallback(assetId, maxDepth = 3) {
        let current = assetId;
        const visited = new Set();

        while (current && visited.size < maxDepth) {
            if (visited.has(current)) break; // Prevent circular fallback chains
            visited.add(current);

            const asset = this.resolve(current);
            if (asset) {
                return asset;
            }

            // Asset not found — look for its fallback reference across manifests
            let nextFallback = null;
            for (const [, campaignAssets] of this._manifests) {
                const def = campaignAssets.get(current);
                if (def && def.fallback) {
                    nextFallback = def.fallback;
                    break;
                }
            }
            current = nextFallback;
        }

        return null;
    }

    // ==========================================
    // PRELOAD MANAGEMENT
    // ==========================================

    /**
     * Preload an asset for faster playback
     * @param {string} assetId - Asset identifier
     * @param {Object} [options] - Preload options
     * @param {number} [options.priority=0] - Preload priority (higher = sooner)
     * @returns {Promise<boolean>} True if preloaded successfully
     */
    async preload(assetId, options = {}) {
        const asset = this.resolve(assetId);
        if (!asset) {
            console.warn(`[MediaAssetManager] Cannot preload unknown asset: ${assetId}`);
            return false;
        }

        // Check budget
        if (this._preloaded.size >= this._budgets.maxPreloadedAssets) {
            this._emitBudgetEvent('preloaded_assets', this._preloaded.size, this._budgets.maxPreloadedAssets, true);
            return false;
        }

        // Already preloaded
        if (this._preloaded.has(assetId)) return true;

        EventBus.emit('media:asset:preload', {
            assetId,
            type: asset.type,
            src: asset.src,
            priority: options.priority || 0,
            timestamp: Date.now()
        });

        try {
            let element = null;

            if (asset.type === 'audio') {
                element = new Audio();
                element.preload = 'auto';
                await new Promise((resolve, reject) => {
                    element.addEventListener('canplaythrough', resolve, { once: true });
                    element.addEventListener('error', reject, { once: true });
                    element.src = asset.src;
                });
            } else if (asset.type === 'image') {
                element = new Image();
                await new Promise((resolve, reject) => {
                    element.onload = resolve;
                    element.onerror = reject;
                    element.src = asset.src;
                });
            }
            // Video preload is handled lazily (too expensive for eager preload)

            this._preloaded.set(assetId, {
                loaded: true,
                element,
                sizeBytes: asset.sizeBytes || 0,
                type: asset.type
            });

            EventBus.emit('media:asset:loaded', {
                assetId,
                type: asset.type,
                sizeBytes: asset.sizeBytes || 0,
                timestamp: Date.now()
            });

            return true;
        } catch (err) {
            EventBus.emit('media:asset:error', {
                assetId,
                type: asset.type,
                error: err?.message || String(err),
                timestamp: Date.now()
            });
            return false;
        }
    }

    /**
     * Evict an asset from preload cache
     * @param {string} assetId
     */
    evict(assetId) {
        const entry = this._preloaded.get(assetId);
        if (!entry) return;

        // Clean up element references
        if (entry.element) {
            if (entry.type === 'audio') {
                entry.element.src = '';
            }
            entry.element = null;
        }

        this._preloaded.delete(assetId);
    }

    /**
     * Get preload status for an asset
     * @param {string} assetId
     * @returns {boolean}
     */
    isPreloaded(assetId) {
        return this._preloaded.has(assetId) && this._preloaded.get(assetId).loaded;
    }

    // ==========================================
    // BUDGET ENFORCEMENT
    // ==========================================

    /**
     * Set budget limits (merges with defaults)
     * @param {Object} budgets - Budget overrides
     */
    setBudgets(budgets) {
        if (!budgets || typeof budgets !== 'object') return;
        this._budgets = { ...DEFAULT_BUDGETS, ...budgets };
    }

    /**
     * Get current budget state
     * @returns {Object}
     */
    getBudgetState() {
        const activeAudio = this._countActiveCuesByType('audio');
        const activeVideo = this._countActiveCuesByType('video');

        return {
            audio: { current: activeAudio, limit: this._budgets.maxConcurrentAudio },
            video: { current: activeVideo, limit: this._budgets.maxConcurrentVideo },
            preloaded: { current: this._preloaded.size, limit: this._budgets.maxPreloadedAssets }
        };
    }

    /**
     * Check if a cue can be started within budget limits.
     * @param {string} type - 'audio' or 'video'
     * @param {string} [group] - Audio group name
     * @returns {boolean}
     */
    canStartCue(type, group = null) {
        if (type === 'audio') {
            const activeCount = this._countActiveCuesByType('audio');
            if (activeCount >= this._budgets.maxConcurrentAudio) return false;

            if (group && AUDIO_GROUPS[group]) {
                const groupCount = this._countActiveCuesByGroup(group);
                if (groupCount >= AUDIO_GROUPS[group].maxConcurrent) return false;
            }
            return true;
        }

        if (type === 'video') {
            return this._countActiveCuesByType('video') < this._budgets.maxConcurrentVideo;
        }

        return true;
    }

    // ==========================================
    // ACTIVE CUE TRACKING
    // ==========================================

    /**
     * Register an active cue
     * @param {string} cueId - Cue identifier
     * @param {Object} cueData - Cue metadata
     */
    registerActiveCue(cueId, cueData) {
        this._activeCues.set(cueId, {
            ...cueData,
            startedAt: Date.now()
        });

        EventBus.emit('media:cue:start', {
            cueId,
            type: cueData.type,
            assetId: cueData.assetId,
            timestamp: Date.now()
        });
    }

    /**
     * Unregister an active cue
     * @param {string} cueId - Cue identifier
     * @param {string} [reason='completed'] - Reason for ending
     */
    unregisterActiveCue(cueId, reason = 'completed') {
        const cue = this._activeCues.get(cueId);
        if (!cue) return;

        this._activeCues.delete(cueId);

        EventBus.emit('media:cue:end', {
            cueId,
            type: cue.type,
            reason,
            timestamp: Date.now()
        });
    }

    /**
     * Get active cue info
     * @param {string} cueId
     * @returns {Object|null}
     */
    getActiveCue(cueId) {
        return this._activeCues.get(cueId) || null;
    }

    /**
     * Get all active cues
     * @returns {Object} Map of cueId -> cue data
     */
    getActiveCues() {
        const result = {};
        for (const [id, cue] of this._activeCues) {
            result[id] = { ...cue };
        }
        return result;
    }

    /**
     * Stop all active cues
     */
    stopAllCues() {
        const cueIds = [...this._activeCues.keys()];
        for (const cueId of cueIds) {
            this.unregisterActiveCue(cueId, 'stopped');
        }
    }

    // ==========================================
    // AUDIO GROUP DUCKING
    // ==========================================

    /**
     * Duck an audio group
     * @param {string} group - Audio group name
     * @param {number} level - Ducked volume level (0-1)
     * @param {number} durationMs - Duration before auto-restore
     */
    duckGroup(group, level, durationMs) {
        // Clear existing duck timer
        const existing = this._duckState.get(group);
        if (existing?.timer) clearTimeout(existing.timer);

        const timer = durationMs > 0 ? setTimeout(() => {
            this.restoreGroup(group);
        }, durationMs) : null;

        this._duckState.set(group, {
            level: Math.max(0, Math.min(1, level)),
            timer,
            duckedAt: Date.now()
        });

        EventBus.emit('media:audio:duck', {
            group,
            level,
            durationMs,
            timestamp: Date.now()
        });
    }

    /**
     * Restore a ducked audio group
     * @param {string} group - Audio group name
     */
    restoreGroup(group) {
        const state = this._duckState.get(group);
        if (!state) return;

        if (state.timer) clearTimeout(state.timer);
        this._duckState.delete(group);

        EventBus.emit('media:audio:restore', {
            group,
            timestamp: Date.now()
        });
    }

    /**
     * Get the effective volume multiplier for a group
     * @param {string} group
     * @returns {number} Volume multiplier (0-1)
     */
    getGroupVolumeMultiplier(group) {
        const state = this._duckState.get(group);
        return state ? state.level : 1.0;
    }

    // ==========================================
    // VALIDATION & LINT
    // ==========================================

    /**
     * Validate a media manifest
     * @param {Object} manifest
     * @returns {{valid: boolean, errors: string[], warnings: string[]}}
     */
    validateManifest(manifest) {
        return validateMediaManifest(manifest);
    }

    /**
     * Lint a campaign's media configuration for potential issues.
     * Checks for orphaned assets, invalid references, budget exceedances.
     * @param {string} campaignId
     * @param {Object} [campaignPackage] - Full campaign package for cross-reference
     * @returns {{errors: string[], warnings: string[], info: string[]}}
     */
    lintCampaignMedia(campaignId, campaignPackage = null) {
        const errors = [];
        const warnings = [];
        const info = [];

        const manifest = this._manifests.get(campaignId);
        if (!manifest) {
            return { errors: ['No media manifest registered for campaign'], warnings, info };
        }

        const assetIds = new Set(manifest.keys());
        let totalBytes = 0;

        for (const [assetId, asset] of manifest) {
            // Check fallback chain
            if (asset.fallback && !assetIds.has(asset.fallback)) {
                warnings.push(`Asset "${assetId}" references fallback "${asset.fallback}" not in manifest`);
            }

            // Accumulate size
            if (asset.sizeBytes) {
                totalBytes += asset.sizeBytes;
            }

            // Check for duplicate sources
            for (const [otherId, other] of manifest) {
                if (otherId !== assetId && other.src === asset.src && other.type === asset.type) {
                    info.push(`Assets "${assetId}" and "${otherId}" share the same source: ${asset.src}`);
                }
            }
        }

        // Check total size against preload budget
        if (totalBytes > this._budgets.maxPreloadBytes) {
            warnings.push(
                `Total asset size (${(totalBytes / 1024 / 1024).toFixed(1)} MB) exceeds preload budget ` +
                `(${(this._budgets.maxPreloadBytes / 1024 / 1024).toFixed(1)} MB)`
            );
        }

        // Cross-reference with campaign scripts if available
        if (campaignPackage?.scripts) {
            const referencedAssets = new Set();
            for (const [, source] of Object.entries(campaignPackage.scripts)) {
                if (typeof source !== 'string') continue;
                // Simple pattern matching for asset references in scripts
                const matches = source.matchAll(/audio\.play\s*\(\s*['"]([^'"]+)['"]/g);
                for (const match of matches) {
                    referencedAssets.add(match[1]);
                }
                const videoMatches = source.matchAll(/video\.play\s*\(\s*['"]([^'"]+)['"]/g);
                for (const match of videoMatches) {
                    referencedAssets.add(match[1]);
                }
                const imageMatches = source.matchAll(/image\.show\s*\(\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"]/g);
                for (const match of imageMatches) {
                    referencedAssets.add(match[2]);
                }
            }

            // Check for assets referenced in scripts but not in manifest
            for (const ref of referencedAssets) {
                if (!assetIds.has(ref)) {
                    warnings.push(`Script references asset "${ref}" not found in media manifest`);
                }
            }

            // Check for manifest assets not referenced in any script
            for (const assetId of assetIds) {
                if (!referencedAssets.has(assetId)) {
                    info.push(`Asset "${assetId}" in manifest but not referenced in any script (may be orphaned)`);
                }
            }
        }

        info.push(`Total assets: ${manifest.size}, Total size: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);

        return { errors, warnings, info };
    }

    // ==========================================
    // INTERNALS
    // ==========================================

    /** @private */
    _countActiveCuesByType(type) {
        let count = 0;
        for (const [, cue] of this._activeCues) {
            if (cue.type === type) count++;
        }
        return count;
    }

    /** @private */
    _countActiveCuesByGroup(group) {
        let count = 0;
        for (const [, cue] of this._activeCues) {
            if (cue.group === group) count++;
        }
        return count;
    }

    /** @private */
    _emitBudgetEvent(metric, current, limit, exceeded = false) {
        const eventName = exceeded ? 'media:budget:exceeded' : 'media:budget:warning';
        EventBus.emit(eventName, {
            metric,
            current,
            limit,
            campaignId: this._activeCampaignId,
            timestamp: Date.now()
        });
    }

    /**
     * Get a snapshot of current state for debugging
     * @returns {Object}
     */
    getSnapshot() {
        return {
            manifests: [...this._manifests.keys()],
            preloadedCount: this._preloaded.size,
            activeCues: this.getActiveCues(),
            budgets: { ...this._budgets },
            budgetState: this.getBudgetState(),
            activeCampaignId: this._activeCampaignId
        };
    }

    /**
     * Reset all state (for testing or campaign teardown)
     */
    reset() {
        this.stopAllCues();
        this._preloaded.clear();
        this._manifests.clear();
        this._duckState.clear();
        this._activeCampaignId = null;
        this._budgets = { ...DEFAULT_BUDGETS };
    }
}

// Singleton
const MediaAssetManager = new MediaAssetManagerClass();

// Debug access
if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.mediaAssets = MediaAssetManager;
    // Back-compat alias consumed by ShowrunnerConsole.
    window.__RETROS_DEBUG.mediaAssetManager = MediaAssetManager;
}

export { AUDIO_GROUPS, MEDIA_TYPES, DEFAULT_BUDGETS, validateMediaManifest };
export default MediaAssetManager;
