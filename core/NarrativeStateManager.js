/**
 * NarrativeStateManager - Persistent story/campaign state for ARG experiences
 *
 * Manages all narrative state: campaigns, scenes, objectives, flags, clues,
 * mood presets, and NPC state. All mutations emit canonical story:* events
 * through the EventBus for script and feature observability.
 *
 * State persists through StorageManager under the key 'narrativeState'.
 * Transient execution details stay in memory unless debugging is enabled.
 *
 * Usage:
 *   import NarrativeStateManager from './core/NarrativeStateManager.js';
 *   NarrativeStateManager.initialize();
 *
 *   NarrativeStateManager.startCampaign('campaign-1');
 *   NarrativeStateManager.enterScene('intro');
 *   NarrativeStateManager.addObjective('find-key', 'Find the hidden key');
 */

import EventBus from './EventBus.js';
import StorageManager from './StorageManager.js';
import MultiplayerClient from './MultiplayerClient.js';

/**
 * Default empty narrative state shape
 */
function createDefaultState() {
    return {
        // Campaign lifecycle
        currentCampaign: null,
        campaignHistory: [],        // [{id, startedAt, endedAt, endingId}]

        // Scene state
        currentScene: null,
        scenes: {},                 // sceneId -> { status: 'entered'|'completed'|'blocked', enteredAt, completedAt }

        // Objective tracking
        objectives: {},             // objectiveId -> { text, status: 'active'|'completed'|'failed', meta, addedAt, resolvedAt }

        // Arbitrary flags for branching
        flags: {},                  // key -> value (any serializable type)

        // Clue/evidence tracking
        clues: {},                  // clueId -> { discovered: true, tags: [], discoveredAt }

        // Mood/atmosphere
        mood: {
            currentPreset: null,
            history: []             // [{presetId, setAt}]
        },

        // NPC persona state
        npcs: {},                   // npcId -> { key: value, ... }

        // Metadata
        _meta: {
            version: 1,
            createdAt: null,
            lastModified: null
        }
    };
}

/**
 * Merge and sanitize a candidate state snapshot against defaults.
 * @param {Object} candidate
 * @returns {Object}
 */
function normalizeState(candidate = {}) {
    const merged = { ...createDefaultState(), ...(candidate || {}) };

    if (!Array.isArray(merged.campaignHistory)) merged.campaignHistory = [];
    if (!merged.scenes || typeof merged.scenes !== 'object') merged.scenes = {};
    if (!merged.objectives || typeof merged.objectives !== 'object') merged.objectives = {};
    if (!merged.flags || typeof merged.flags !== 'object') merged.flags = {};
    if (!merged.clues || typeof merged.clues !== 'object') merged.clues = {};
    if (!merged.npcs || typeof merged.npcs !== 'object') merged.npcs = {};

    merged.mood = {
        currentPreset: merged.mood?.currentPreset || null,
        history: Array.isArray(merged.mood?.history) ? merged.mood.history : []
    };

    merged._meta = {
        version: Number.isFinite(merged._meta?.version) ? merged._meta.version : 1,
        createdAt: merged._meta?.createdAt ?? null,
        lastModified: merged._meta?.lastModified ?? null
    };

    return merged;
}

class NarrativeStateManagerClass {
    constructor() {
        this.state = createDefaultState();
        this.initialized = false;
        this._debugMode = false;
        this._moodTransitionTimer = null;

        // Multiplayer campaign co-op state
        this._campaignRoomId = null;
        this._mpListenerUnsubs = [];
    }

    /**
     * Initialize the narrative state manager.
     * Loads persisted state from StorageManager.
     */
    initialize() {
        if (this.initialized) return;

        const saved = StorageManager.get('narrativeState');
        if (saved && typeof saved === 'object') {
            this.state = normalizeState(saved);
        }

        this.initialized = true;
        console.log('[NarrativeStateManager] Initialized',
            this.state.currentCampaign ? `(campaign: ${this.state.currentCampaign})` : '(no active campaign)');
    }

    // ==========================================
    // PERSISTENCE
    // ==========================================

    /**
     * Save current state to storage
     * @private
     */
    _persist() {
        this.state._meta.lastModified = Date.now();
        StorageManager.set('narrativeState', this.state);
    }

    /**
     * Emit a story event through EventBus
     * @private
     * @param {string} eventName - Canonical story event name (e.g., 'story:scene:enter')
     * @param {Object} payload - Event payload
     */
    _emit(eventName, payload = {}) {
        EventBus.emit(eventName, {
            timestamp: Date.now(),
            campaignId: this.state.currentCampaign,
            ...payload
        });
    }

    // ==========================================
    // CAMPAIGN LIFECYCLE
    // ==========================================

    /**
     * Start a campaign
     * @param {string} campaignId - Campaign identifier
     * @returns {boolean} True if campaign was started (idempotent: false if already active)
     */
    startCampaign(campaignId) {
        if (!campaignId || typeof campaignId !== 'string') return false;

        // Idempotent: already running this campaign
        if (this.state.currentCampaign === campaignId) return false;

        // End previous campaign if one is active
        if (this.state.currentCampaign) {
            this.endCampaign(this.state.currentCampaign, 'auto-ended');
        }

        // Cancel any pending mood transition from the previous campaign
        if (this._moodTransitionTimer) {
            clearTimeout(this._moodTransitionTimer);
            this._moodTransitionTimer = null;
        }

        this.state.currentCampaign = campaignId;
        this.state._meta.createdAt = Date.now();

        // Reset transient state for new campaign
        this.state.currentScene = null;
        this.state.scenes = {};
        this.state.objectives = {};
        this.state.flags = {};
        this.state.clues = {};
        this.state.mood = { currentPreset: null, history: [] };
        this.state.npcs = {};

        this._persist();
        this._emit('story:start', { campaignId });

        console.log(`[NarrativeStateManager] Campaign started: ${campaignId}`);
        return true;
    }

    /**
     * End the current campaign
     * @param {string} campaignId - Campaign to end (must match current)
     * @param {string} [endingId] - Optional ending identifier for branching stories
     * @returns {boolean} True if campaign was ended
     */
    endCampaign(campaignId, endingId = null) {
        if (!campaignId || this.state.currentCampaign !== campaignId) return false;

        const record = {
            id: campaignId,
            startedAt: this.state._meta.createdAt,
            endedAt: Date.now(),
            endingId
        };

        if (!Array.isArray(this.state.campaignHistory)) {
            this.state.campaignHistory = [];
        }
        this.state.campaignHistory.push(record);

        this._emit('story:end', { campaignId, endingId });

        this.state.currentCampaign = null;
        this.state.currentScene = null;
        this._persist();

        console.log(`[NarrativeStateManager] Campaign ended: ${campaignId}${endingId ? ` (ending: ${endingId})` : ''}`);
        return true;
    }

    /**
     * Get the current campaign ID
     * @returns {string|null}
     */
    getCurrentCampaign() {
        return this.state.currentCampaign;
    }

    // ==========================================
    // SCENE MANAGEMENT
    // ==========================================

    /**
     * Enter a scene
     * @param {string} sceneId - Scene identifier
     * @returns {boolean} True if scene was entered
     */
    enterScene(sceneId) {
        if (!sceneId || typeof sceneId !== 'string') return false;

        // Check if scene is blocked
        const existing = this.state.scenes[sceneId];
        if (existing && existing.status === 'blocked') {
            this._emit('story:scene:block', { sceneId, reason: 'Scene is blocked' });
            return false;
        }

        // Exit current scene if different
        const previousScene = this.state.currentScene;
        if (previousScene && previousScene !== sceneId) {
            this._emit('story:scene:exit', { sceneId: previousScene, nextScene: sceneId });
        }

        this.state.currentScene = sceneId;
        this.state.scenes[sceneId] = {
            ...(existing || {}),
            status: 'entered',
            enteredAt: Date.now()
        };

        this._persist();
        this._emit('story:scene:enter', { sceneId, previousScene });
        this._broadcastCampaignEvent('campaign:scene_change', { sceneId });

        return true;
    }

    /**
     * Mark a scene as completed
     * @param {string} sceneId - Scene identifier
     * @returns {boolean} True if scene was completed
     */
    completeScene(sceneId) {
        if (!sceneId || typeof sceneId !== 'string') return false;

        const scene = this.state.scenes[sceneId];
        if (!scene) return false;

        // Idempotent: already completed
        if (scene.status === 'completed') return false;

        scene.status = 'completed';
        scene.completedAt = Date.now();

        this._persist();
        this._emit('story:scene:complete', { sceneId });
        this._broadcastCampaignEvent('campaign:scene_change', { sceneId, status: 'completed' });

        return true;
    }

    /**
     * Check if a scene can be entered (not blocked)
     * @param {string} sceneId - Scene identifier
     * @returns {boolean}
     */
    canEnterScene(sceneId) {
        const scene = this.state.scenes[sceneId];
        if (!scene) return true; // Never visited = can enter
        return scene.status !== 'blocked';
    }

    /**
     * Block a scene from being entered
     * @param {string} sceneId - Scene identifier
     * @param {string} [reason] - Reason for blocking
     */
    blockScene(sceneId, reason = '') {
        if (!sceneId) return;
        this.state.scenes[sceneId] = {
            ...(this.state.scenes[sceneId] || {}),
            status: 'blocked',
            blockedAt: Date.now(),
            blockReason: reason
        };
        this._persist();
        this._emit('story:scene:block', { sceneId, reason });
    }

    /**
     * Unblock a scene
     * @param {string} sceneId - Scene identifier
     */
    unblockScene(sceneId) {
        if (!sceneId) return;
        const scene = this.state.scenes[sceneId];
        if (scene && scene.status === 'blocked') {
            scene.status = 'entered';
            delete scene.blockedAt;
            delete scene.blockReason;
            this._persist();
        }
    }

    /**
     * Get the current scene ID
     * @returns {string|null}
     */
    getCurrentScene() {
        return this.state.currentScene;
    }

    /**
     * Get scene state
     * @param {string} sceneId - Scene identifier
     * @returns {Object|null}
     */
    getScene(sceneId) {
        return this.state.scenes[sceneId] || null;
    }

    // ==========================================
    // OBJECTIVE TRACKING
    // ==========================================

    /**
     * Add an objective
     * @param {string} id - Objective identifier
     * @param {string} text - Human-readable objective description
     * @param {Object} [meta] - Optional metadata
     * @returns {boolean} True if objective was added (false if already exists)
     */
    addObjective(id, text, meta = {}) {
        if (!id || typeof id !== 'string') return false;

        // Idempotent: don't overwrite existing
        if (this.state.objectives[id]) return false;

        this.state.objectives[id] = {
            text: String(text || ''),
            status: 'active',
            meta: meta && typeof meta === 'object' ? meta : {},
            addedAt: Date.now(),
            resolvedAt: null
        };

        this._persist();
        this._emit('story:objective:add', { objectiveId: id, text, meta });
        this._broadcastCampaignEvent('campaign:objective_update', { objectiveId: id, status: 'active', text, meta });

        return true;
    }

    /**
     * Mark an objective as completed
     * @param {string} id - Objective identifier
     * @returns {boolean} True if objective was completed
     */
    completeObjective(id) {
        if (!id) return false;
        const obj = this.state.objectives[id];
        if (!obj || obj.status === 'completed') return false;

        obj.status = 'completed';
        obj.resolvedAt = Date.now();

        this._persist();
        this._emit('story:objective:complete', { objectiveId: id });
        this._broadcastCampaignEvent('campaign:objective_update', { objectiveId: id, status: 'completed' });

        return true;
    }

    /**
     * Mark an objective as failed
     * @param {string} id - Objective identifier
     * @returns {boolean} True if objective was failed
     */
    failObjective(id) {
        if (!id) return false;
        const obj = this.state.objectives[id];
        if (!obj || obj.status !== 'active') return false;

        obj.status = 'failed';
        obj.resolvedAt = Date.now();

        this._persist();
        this._emit('story:objective:fail', { objectiveId: id });
        this._broadcastCampaignEvent('campaign:objective_update', { objectiveId: id, status: 'failed' });

        return true;
    }

    /**
     * Get an objective's state
     * @param {string} id - Objective identifier
     * @returns {Object|null}
     */
    getObjective(id) {
        return this.state.objectives[id] || null;
    }

    /**
     * Get all objectives (optionally filtered by status)
     * @param {string} [status] - Filter by status ('active', 'completed', 'failed')
     * @returns {Object} Map of objectiveId -> objective
     */
    getObjectives(status = null) {
        if (!status) return { ...this.state.objectives };
        const filtered = {};
        for (const [id, obj] of Object.entries(this.state.objectives)) {
            if (obj.status === status) filtered[id] = obj;
        }
        return filtered;
    }

    // ==========================================
    // FLAG MANAGEMENT
    // ==========================================

    /**
     * Set a flag value
     * @param {string} key - Flag key
     * @param {*} value - Flag value (must be JSON-serializable)
     * @returns {boolean} True on success
     */
    setFlag(key, value) {
        if (!key || typeof key !== 'string') return false;

        const oldValue = this.state.flags[key];
        this.state.flags[key] = value;

        this._persist();
        this._emit('story:flag:set', { key, value, oldValue });
        this._broadcastCampaignEvent('campaign:flag_set', { key, value });

        return true;
    }

    /**
     * Get a flag value
     * @param {string} key - Flag key
     * @param {*} [defaultValue] - Default if flag not set
     * @returns {*} Flag value or default
     */
    getFlag(key, defaultValue = null) {
        if (!key || typeof key !== 'string') return defaultValue;
        return key in this.state.flags ? this.state.flags[key] : defaultValue;
    }

    /**
     * Check if a flag exists
     * @param {string} key - Flag key
     * @returns {boolean}
     */
    hasFlag(key) {
        return key in this.state.flags;
    }

    /**
     * Delete a flag
     * @param {string} key - Flag key
     * @returns {boolean} True if flag existed and was deleted
     */
    deleteFlag(key) {
        if (!(key in this.state.flags)) return false;
        delete this.state.flags[key];
        this._persist();
        return true;
    }

    /**
     * Get all flags
     * @returns {Object}
     */
    getAllFlags() {
        return { ...this.state.flags };
    }

    // ==========================================
    // CLUE/EVIDENCE TRACKING
    // ==========================================

    /**
     * Add a clue
     * @param {string} id - Clue identifier
     * @param {string[]} [tags] - Optional categorization tags
     * @returns {boolean} True if clue was added (false if already discovered)
     */
    addClue(id, tags = []) {
        if (!id || typeof id !== 'string') return false;

        // Idempotent: already discovered
        if (this.state.clues[id]) return false;

        this.state.clues[id] = {
            discovered: true,
            tags: Array.isArray(tags) ? tags : [],
            discoveredAt: Date.now()
        };

        this._persist();
        this._emit('story:clue:add', { clueId: id, tags });
        this._broadcastCampaignEvent('campaign:state_update', { state: this.getSnapshot() });

        return true;
    }

    /**
     * Check if a clue has been discovered
     * @param {string} id - Clue identifier
     * @returns {boolean}
     */
    hasClue(id) {
        return !!(this.state.clues[id]?.discovered);
    }

    /**
     * Get a clue's state
     * @param {string} id - Clue identifier
     * @returns {Object|null}
     */
    getClue(id) {
        return this.state.clues[id] || null;
    }

    /**
     * Get all clues (optionally filtered by tag)
     * @param {string} [tag] - Filter by tag
     * @returns {Object} Map of clueId -> clue
     */
    getClues(tag = null) {
        if (!tag) return { ...this.state.clues };
        const filtered = {};
        for (const [id, clue] of Object.entries(this.state.clues)) {
            if (clue.tags && clue.tags.includes(tag)) filtered[id] = clue;
        }
        return filtered;
    }

    /**
     * Mark a clue as revealed (emit event for UI consumption)
     * @param {string} id - Clue identifier
     * @returns {boolean} True if clue exists
     */
    revealClue(id) {
        if (!this.state.clues[id]) return false;
        this._emit('story:clue:revealed', { clueId: id });
        return true;
    }

    // ==========================================
    // MOOD / ATMOSPHERE
    // ==========================================

    /**
     * Set the current mood preset
     * @param {string} presetId - Mood preset identifier
     * @returns {boolean} True on success
     */
    setMood(presetId) {
        if (!presetId || typeof presetId !== 'string') return false;

        const previousPreset = this.state.mood.currentPreset;

        // Idempotent
        if (previousPreset === presetId) return false;

        this.state.mood.currentPreset = presetId;
        this.state.mood.history.push({ presetId, setAt: Date.now() });

        // Limit history to 50 entries
        if (this.state.mood.history.length > 50) {
            this.state.mood.history = this.state.mood.history.slice(-50);
        }

        this._persist();
        this._emit('story:mood:set', { presetId, previousPreset });

        return true;
    }

    /**
     * Transition between mood presets over time
     * @param {string} fromPreset - Source preset
     * @param {string} toPreset - Target preset
     * @param {number} durationMs - Transition duration in milliseconds
     * @returns {boolean} True if transition was initiated
     */
    transitionMood(fromPreset, toPreset, durationMs = 1000) {
        if (!fromPreset || !toPreset || typeof durationMs !== 'number') return false;
        if (durationMs <= 0 || durationMs > 30000) durationMs = 1000;

        // Cancel any pending mood transition
        if (this._moodTransitionTimer) {
            clearTimeout(this._moodTransitionTimer);
            this._moodTransitionTimer = null;
        }

        this._emit('story:mood:transition', { fromPreset, toPreset, durationMs });

        // After transition duration, set the new mood
        this._moodTransitionTimer = setTimeout(() => {
            this._moodTransitionTimer = null;
            this.setMood(toPreset);
        }, durationMs);

        return true;
    }

    /**
     * Get the current mood preset
     * @returns {string|null}
     */
    getCurrentMood() {
        return this.state.mood.currentPreset;
    }

    // ==========================================
    // NPC STATE
    // ==========================================

    /**
     * Set an NPC state value
     * @param {string} npcId - NPC identifier
     * @param {string} key - State key
     * @param {*} value - State value
     * @returns {boolean} True on success
     */
    setNpcState(npcId, key, value) {
        if (!npcId || !key || typeof npcId !== 'string' || typeof key !== 'string') return false;

        if (!this.state.npcs[npcId]) {
            this.state.npcs[npcId] = {};
        }

        this.state.npcs[npcId][key] = value;
        this._persist();

        return true;
    }

    /**
     * Get an NPC state value
     * @param {string} npcId - NPC identifier
     * @param {string} key - State key
     * @param {*} [defaultValue] - Default if not set
     * @returns {*}
     */
    getNpcState(npcId, key, defaultValue = null) {
        if (!npcId || !key) return defaultValue;
        const npc = this.state.npcs[npcId];
        if (!npc || !(key in npc)) return defaultValue;
        return npc[key];
    }

    /**
     * Get all state for an NPC
     * @param {string} npcId - NPC identifier
     * @returns {Object|null}
     */
    getNpc(npcId) {
        return this.state.npcs[npcId] ? { ...this.state.npcs[npcId] } : null;
    }

    // ==========================================
    // MULTIPLAYER CAMPAIGN CO-OP
    // ==========================================

    /**
     * Join a multiplayer campaign room
     * @param {string} campaignId - Campaign room identifier
     * @returns {boolean} True if join was initiated
     */
    joinCampaignRoom(campaignId) {
        if (!campaignId || typeof campaignId !== 'string') return false;
        if (!MultiplayerClient.isConnected()) return false;

        // Leave existing room first
        if (this._campaignRoomId) {
            this.leaveCampaignRoom();
        }

        this._campaignRoomId = `campaign:${campaignId}`;
        MultiplayerClient.joinRoom(this._campaignRoomId);
        this._setupMpListeners();
        this._syncCampaignState();

        console.log(`[NarrativeStateManager] Joined campaign room: ${this._campaignRoomId}`);
        return true;
    }

    /**
     * Leave the current multiplayer campaign room
     */
    leaveCampaignRoom() {
        if (!this._campaignRoomId) return;

        this._teardownMpListeners();

        if (MultiplayerClient.isConnected()) {
            MultiplayerClient.leaveRoom(this._campaignRoomId);
        }

        console.log(`[NarrativeStateManager] Left campaign room: ${this._campaignRoomId}`);
        this._campaignRoomId = null;
    }

    /**
     * Send the full campaign state to room members
     * @private
     */
    _syncCampaignState() {
        if (!this._campaignRoomId || !MultiplayerClient.isConnected()) return;

        MultiplayerClient.sendEvent(this._campaignRoomId, 'campaign:state_update', {
            state: this.getSnapshot(),
            timestamp: Date.now()
        });
    }

    /**
     * Set up multiplayer event listeners for campaign sync
     * @private
     */
    _setupMpListeners() {
        this._teardownMpListeners();

        const unsub1 = MultiplayerClient.on('event:campaign:state_update', (message) => {
            this._handleRemoteStateUpdate(message);
        });

        const unsub2 = MultiplayerClient.on('event:campaign:scene_change', (message) => {
            this._handleRemoteSceneChange(message);
        });

        const unsub3 = MultiplayerClient.on('event:campaign:objective_update', (message) => {
            this._handleRemoteObjectiveUpdate(message);
        });

        const unsub4 = MultiplayerClient.on('event:campaign:flag_set', (message) => {
            this._handleRemoteFlagSet(message);
        });

        this._mpListenerUnsubs = [unsub1, unsub2, unsub3, unsub4];
    }

    /**
     * Remove multiplayer event listeners
     * @private
     */
    _teardownMpListeners() {
        for (const unsub of this._mpListenerUnsubs) {
            if (typeof unsub === 'function') unsub();
        }
        this._mpListenerUnsubs = [];
    }

    /**
     * Broadcast a campaign event to the room if multiplayer is connected
     * @private
     * @param {string} event - Event name (e.g., 'campaign:scene_change')
     * @param {Object} data - Event payload
     */
    _broadcastCampaignEvent(event, data) {
        if (!this._campaignRoomId || !MultiplayerClient.isConnected()) return;
        // Prevent re-broadcasting events that originated from a remote player
        if (this._isProcessingRemoteUpdate) return;

        MultiplayerClient.sendEvent(this._campaignRoomId, event, {
            ...data,
            timestamp: Date.now()
        });
    }

    /**
     * Handle a full state update from a remote player (last-write-wins)
     * @private
     */
    _handleRemoteStateUpdate(message) {
        const payload = message.payload || message;
        const remoteState = payload.state;
        const remoteTimestamp = payload.timestamp || 0;

        if (!remoteState || typeof remoteState !== 'object') return;

        const localTimestamp = this.state._meta.lastModified || 0;

        // Last-write-wins: only apply if remote is newer
        if (remoteTimestamp > localTimestamp) {
            this._isProcessingRemoteUpdate = true;
            try {
                this.state = normalizeState(remoteState);
                this._persist();
                this._emit('story:state:synced', { source: 'remote', timestamp: remoteTimestamp });
                console.log('[NarrativeStateManager] Applied remote state update (newer timestamp)');
            } finally {
                this._isProcessingRemoteUpdate = false;
            }
        }
    }

    /**
     * Handle a remote scene change (last-write-wins)
     * @private
     */
    _handleRemoteSceneChange(message) {
        const payload = message.payload || message;
        const { sceneId, timestamp: remoteTimestamp = 0 } = payload;

        if (!sceneId) return;

        const localScene = this.state.scenes[sceneId];
        const localTimestamp = localScene?.enteredAt || 0;

        if (remoteTimestamp > localTimestamp) {
            this._isProcessingRemoteUpdate = true;
            try {
                this.state.currentScene = sceneId;
                this.state.scenes[sceneId] = {
                    ...(localScene || {}),
                    status: 'entered',
                    enteredAt: remoteTimestamp
                };
                this._persist();
                this._emit('story:scene:enter', { sceneId, source: 'remote' });
            } finally {
                this._isProcessingRemoteUpdate = false;
            }
        }
    }

    /**
     * Handle a remote objective update (last-write-wins)
     * @private
     */
    _handleRemoteObjectiveUpdate(message) {
        const payload = message.payload || message;
        const { objectiveId, status, text, meta, timestamp: remoteTimestamp = 0 } = payload;

        if (!objectiveId) return;

        const existing = this.state.objectives[objectiveId];
        const localTimestamp = existing?.resolvedAt || existing?.addedAt || 0;

        if (remoteTimestamp > localTimestamp) {
            this._isProcessingRemoteUpdate = true;
            try {
                if (!existing && status === 'active') {
                    // New objective from remote
                    this.state.objectives[objectiveId] = {
                        text: text || '',
                        status: 'active',
                        meta: meta || {},
                        addedAt: remoteTimestamp,
                        resolvedAt: null
                    };
                } else if (existing) {
                    existing.status = status;
                    if (status === 'completed' || status === 'failed') {
                        existing.resolvedAt = remoteTimestamp;
                    }
                }
                this._persist();
                const eventSuffix = status === 'active' ? 'add' : status === 'completed' ? 'complete' : 'fail';
                this._emit(`story:objective:${eventSuffix}`, {
                    objectiveId,
                    source: 'remote'
                });
            } finally {
                this._isProcessingRemoteUpdate = false;
            }
        }
    }

    /**
     * Handle a remote flag set (last-write-wins)
     * @private
     */
    _handleRemoteFlagSet(message) {
        const payload = message.payload || message;
        const { key, value, timestamp: remoteTimestamp = 0 } = payload;

        if (!key) return;

        // For flags, we always accept remote if timestamp is newer than our last modification
        const localTimestamp = this.state._meta.lastModified || 0;

        if (remoteTimestamp > localTimestamp) {
            this._isProcessingRemoteUpdate = true;
            try {
                this.state.flags[key] = value;
                this._persist();
                this._emit('story:flag:set', { key, value, source: 'remote' });
            } finally {
                this._isProcessingRemoteUpdate = false;
            }
        }
    }

    // ==========================================
    // STATE INSPECTION / EXPORT
    // ==========================================

    /**
     * Get a snapshot of the full narrative state
     * @returns {Object}
     */
    getSnapshot() {
        return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * Import narrative state (e.g., from a save or campaign checkpoint)
     * @param {Object} snapshot - State snapshot to import
     * @returns {boolean} True on success
     */
    importSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;

        this.state = normalizeState(snapshot);
        this._persist();

        console.log('[NarrativeStateManager] State imported');
        return true;
    }

    /**
     * Reset all narrative state
     */
    reset() {
        if (this._moodTransitionTimer) {
            clearTimeout(this._moodTransitionTimer);
            this._moodTransitionTimer = null;
        }
        this.leaveCampaignRoom();
        this.state = createDefaultState();
        this._persist();
        console.log('[NarrativeStateManager] State reset');
    }

    /**
     * Enable/disable debug mode
     * @param {boolean} enabled
     */
    setDebugMode(enabled) {
        this._debugMode = enabled;
    }
}

// Singleton instance
const NarrativeStateManager = new NarrativeStateManagerClass();

// Add to global debug object
if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.narrativeState = NarrativeStateManager;
    // Back-compat alias consumed by ShowrunnerConsole/ContentTemplateManager.
    window.__RETROS_DEBUG.narrativeStateManager = NarrativeStateManager;
}

export default NarrativeStateManager;
