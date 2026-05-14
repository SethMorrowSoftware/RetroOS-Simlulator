/**
 * TelemetryCollector - Event middleware for ARG campaign analytics
 *
 * Phase 4 (Workstream J) from the ARG Expansion Master Plan.
 * Captures narrative, multimedia, and player-action events for analytics.
 *
 * Features:
 *   - Event middleware that taps into SemanticEventBus
 *   - Configurable sampling and filtering per event namespace
 *   - Correlation IDs (campaignRunId, sessionId, sceneId)
 *   - Local ring buffer with optional backend flush
 *   - Scene/objective funnel tracking
 *   - Dwell-time measurement per scene
 *   - Puzzle attempt and hint-usage counters
 *   - Multimedia engagement metrics (skips, replays, mute rates)
 *   - Drop-off checkpoint markers
 *
 * Non-goal: This module never mutates narrative state or blocks event flow.
 */

import EventBus from './EventBus.js';

class TelemetryCollectorClass {
    constructor() {
        this._initialized = false;

        // Ring buffer of telemetry records
        this._buffer = [];
        this._maxBufferSize = 2000;

        // Correlation context
        this._sessionId = null;
        this._campaignRunId = null;
        this._currentSceneId = null;

        // Scene dwell-time tracking
        this._sceneDwellStart = null;
        this._sceneDwellMap = {};    // sceneId -> { totalMs, visits }

        // Funnel tracking
        this._funnelSteps = [];      // ordered list of { sceneId, timestamp }
        this._objectiveFunnel = {};  // objectiveId -> { status, firstSeen, completedAt }

        // Puzzle tracking
        this._puzzleAttempts = {};   // puzzleId -> { attempts, successes, hintCount }

        // Media engagement tracking
        this._mediaEngagement = {};  // assetId -> { started, completed, skipped, replayed, totalMs }

        // Drop-off checkpoints
        this._checkpoints = [];

        // Sampling config: namespace -> probability (0-1)
        this._samplingRates = {
            'story': 1.0,
            'media': 0.5,
            'app': 0.1,
            'window': 0.05,
            'system': 0.2
        };

        // Listeners to detach on destroy
        this._listeners = [];
    }

    /**
     * Initialize the telemetry collector.
     * Wires up event listeners for all tracked namespaces.
     */
    initialize() {
        if (this._initialized) return;
        this._initialized = true;

        this._sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Narrative / story events
        this._listen('story:start', (d) => this._onStoryStart(d));
        this._listen('story:end', (d) => this._onStoryEnd(d));
        this._listen('story:scene:enter', (d) => this._onSceneEnter(d));
        this._listen('story:scene:complete', (d) => this._onSceneComplete(d));
        this._listen('story:scene:exit', (d) => this._onSceneExit(d));
        this._listen('story:objective:add', (d) => this._onObjectiveAdd(d));
        this._listen('story:objective:complete', (d) => this._onObjectiveComplete(d));
        this._listen('story:objective:fail', (d) => this._onObjectiveFail(d));
        this._listen('story:flag:set', (d) => this._record('flag:set', d, 'story'));
        this._listen('story:clue:add', (d) => this._record('clue:add', d, 'story'));
        this._listen('story:mood:set', (d) => this._record('mood:set', d, 'story'));
        this._listen('story:mood:transition', (d) => this._record('mood:transition', d, 'story'));

        // Telemetry-specific events
        this._listen('story:telemetry:checkpoint', (d) => this._onCheckpoint(d));
        this._listen('story:telemetry:puzzle:attempt', (d) => this._onPuzzleAttempt(d));
        this._listen('story:telemetry:dropoff', (d) => this._onDropoff(d));

        // Media events
        this._listen('media:audio:play', (d) => this._onMediaStart(d, 'audio'));
        this._listen('media:audio:stop', (d) => this._onMediaStop(d, 'audio'));
        this._listen('media:video:play', (d) => this._onMediaStart(d, 'video'));
        this._listen('media:video:stop', (d) => this._onMediaStop(d, 'video'));
        this._listen('media:image:show', (d) => this._record('media:image:show', d, 'media'));
        this._listen('media:fx:apply', (d) => this._record('media:fx:apply', d, 'media'));

        // Operator/inject events (always sampled at 100%)
        this._listen('story:inject', (d) => this._record('operator:inject', d, 'story'));
        this._listen('story:override', (d) => this._record('operator:override', d, 'story'));

        console.log('[TelemetryCollector] Initialized — session:', this._sessionId);
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Begin a campaign run. Creates a new campaignRunId.
     */
    startCampaignRun(campaignId) {
        this._campaignRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        this._record('campaign:run:start', { campaignId, campaignRunId: this._campaignRunId }, 'story');
        return this._campaignRunId;
    }

    /**
     * End a campaign run.
     */
    endCampaignRun(endingId) {
        this._record('campaign:run:end', { campaignRunId: this._campaignRunId, endingId }, 'story');
        this._campaignRunId = null;
    }

    /**
     * Set the sampling rate for a given event namespace.
     * @param {string} namespace - e.g. 'story', 'media', 'app'
     * @param {number} rate - 0.0 to 1.0
     */
    setSamplingRate(namespace, rate) {
        this._samplingRates[namespace] = Math.max(0, Math.min(1, rate));
    }

    /**
     * Get the full event buffer (read-only copy).
     */
    getBuffer() {
        return [...this._buffer];
    }

    /**
     * Get buffer entries matching a filter.
     * @param {Object} filter - { type?, namespace?, sceneId?, since?, limit? }
     */
    query(filter = {}) {
        let results = [...this._buffer];

        if (filter.type) {
            results = results.filter(r => r.type === filter.type);
        }
        if (filter.namespace) {
            results = results.filter(r => r.namespace === filter.namespace);
        }
        if (filter.sceneId) {
            results = results.filter(r => r.context?.sceneId === filter.sceneId);
        }
        if (filter.since) {
            results = results.filter(r => r.timestamp >= filter.since);
        }
        if (filter.limit) {
            results = results.slice(-filter.limit);
        }

        return results;
    }

    /**
     * Get scene dwell-time analytics.
     */
    getSceneDwellTimes() {
        // Include current scene if still dwelling
        const result = { ...this._sceneDwellMap };
        if (this._currentSceneId && this._sceneDwellStart) {
            const current = result[this._currentSceneId] || { totalMs: 0, visits: 0 };
            result[this._currentSceneId] = {
                totalMs: current.totalMs + (Date.now() - this._sceneDwellStart),
                visits: current.visits
            };
        }
        return result;
    }

    /**
     * Get the scene funnel — ordered progression through scenes.
     */
    getSceneFunnel() {
        return [...this._funnelSteps];
    }

    /**
     * Get objective funnel analytics.
     */
    getObjectiveFunnel() {
        return { ...this._objectiveFunnel };
    }

    /**
     * Get puzzle attempt analytics.
     */
    getPuzzleAttempts() {
        return { ...this._puzzleAttempts };
    }

    /**
     * Get media engagement metrics.
     */
    getMediaEngagement() {
        return { ...this._mediaEngagement };
    }

    /**
     * Get all checkpoints reached.
     */
    getCheckpoints() {
        return [...this._checkpoints];
    }

    /**
     * Export a complete analytics snapshot for the current run.
     */
    exportSnapshot() {
        return {
            sessionId: this._sessionId,
            campaignRunId: this._campaignRunId,
            exportedAt: Date.now(),
            bufferSize: this._buffer.length,
            sceneDwellTimes: this.getSceneDwellTimes(),
            sceneFunnel: this.getSceneFunnel(),
            objectiveFunnel: this.getObjectiveFunnel(),
            puzzleAttempts: this.getPuzzleAttempts(),
            mediaEngagement: this.getMediaEngagement(),
            checkpoints: this.getCheckpoints(),
            events: this.getBuffer()
        };
    }

    /**
     * Flush the buffer and return the flushed records.
     * Useful for sending to a backend.
     */
    flush() {
        const flushed = [...this._buffer];
        this._buffer = [];
        return flushed;
    }

    /**
     * Clear all accumulated data and reset counters.
     */
    reset() {
        this._buffer = [];
        this._funnelSteps = [];
        this._objectiveFunnel = {};
        this._puzzleAttempts = {};
        this._mediaEngagement = {};
        this._checkpoints = [];
        this._sceneDwellMap = {};
        this._sceneDwellStart = null;
        this._currentSceneId = null;
        this._campaignRunId = null;
    }

    /**
     * Destroy and detach all listeners.
     */
    destroy() {
        for (const { event, handler } of this._listeners) {
            EventBus.off(event, handler);
        }
        this._listeners = [];
        this._initialized = false;
    }

    // ==========================================
    // EVENT HANDLERS
    // ==========================================

    _onStoryStart(data) {
        this.startCampaignRun(data?.campaignId);
    }

    _onStoryEnd(data) {
        this._finishSceneDwell();
        this.endCampaignRun(data?.endingId);
    }

    _onSceneEnter(data) {
        const sceneId = data?.sceneId;
        if (!sceneId) return;

        // End dwell on previous scene
        this._finishSceneDwell();

        this._currentSceneId = sceneId;
        this._sceneDwellStart = Date.now();

        this._funnelSteps.push({ sceneId, timestamp: Date.now() });
        this._record('scene:enter', data, 'story');
    }

    _onSceneComplete(data) {
        this._record('scene:complete', data, 'story');
    }

    _onSceneExit(data) {
        this._finishSceneDwell();
        this._record('scene:exit', data, 'story');
    }

    _onObjectiveAdd(data) {
        const id = data?.objectiveId || data?.id;
        if (id && !this._objectiveFunnel[id]) {
            this._objectiveFunnel[id] = {
                status: 'active',
                firstSeen: Date.now(),
                completedAt: null,
                failedAt: null
            };
        }
        this._record('objective:add', data, 'story');
    }

    _onObjectiveComplete(data) {
        const id = data?.objectiveId || data?.id;
        if (id && this._objectiveFunnel[id]) {
            this._objectiveFunnel[id].status = 'completed';
            this._objectiveFunnel[id].completedAt = Date.now();
        }
        this._record('objective:complete', data, 'story');
    }

    _onObjectiveFail(data) {
        const id = data?.objectiveId || data?.id;
        if (id && this._objectiveFunnel[id]) {
            this._objectiveFunnel[id].status = 'failed';
            this._objectiveFunnel[id].failedAt = Date.now();
        }
        this._record('objective:fail', data, 'story');
    }

    _onCheckpoint(data) {
        this._checkpoints.push({
            checkpointId: data?.checkpointId,
            sceneId: data?.sceneId || this._currentSceneId,
            timestamp: Date.now()
        });
        this._record('checkpoint', data, 'story');
    }

    _onPuzzleAttempt(data) {
        const id = data?.puzzleId;
        if (!id) return;

        if (!this._puzzleAttempts[id]) {
            this._puzzleAttempts[id] = { attempts: 0, successes: 0, hintCount: 0 };
        }
        this._puzzleAttempts[id].attempts++;
        if (data?.success) {
            this._puzzleAttempts[id].successes++;
        }
        if (data?.hintUsed) {
            this._puzzleAttempts[id].hintCount++;
        }
        this._record('puzzle:attempt', data, 'story');
    }

    _onDropoff(data) {
        this._record('dropoff', {
            ...data,
            sceneId: data?.sceneId || this._currentSceneId
        }, 'story');
    }

    _onMediaStart(data, mediaType) {
        const assetId = data?.assetId || data?.cueId || 'unknown';
        if (!this._mediaEngagement[assetId]) {
            this._mediaEngagement[assetId] = {
                type: mediaType,
                started: 0,
                completed: 0,
                skipped: 0,
                replayed: 0,
                startedAt: null
            };
        }
        const entry = this._mediaEngagement[assetId];
        if (entry.started > 0 && entry.startedAt === null) {
            entry.replayed++;
        }
        entry.started++;
        entry.startedAt = Date.now();
        this._record(`media:${mediaType}:play`, data, 'media');
    }

    _onMediaStop(data, mediaType) {
        const assetId = data?.assetId || data?.cueId;
        if (assetId && this._mediaEngagement[assetId]) {
            const entry = this._mediaEngagement[assetId];
            if (data?._skipped) {
                entry.skipped++;
            } else {
                entry.completed++;
            }
            entry.startedAt = null;
        }
        this._record(`media:${mediaType}:stop`, data, 'media');
    }

    // ==========================================
    // INTERNAL
    // ==========================================

    _finishSceneDwell() {
        if (this._currentSceneId && this._sceneDwellStart) {
            const elapsed = Date.now() - this._sceneDwellStart;
            if (!this._sceneDwellMap[this._currentSceneId]) {
                this._sceneDwellMap[this._currentSceneId] = { totalMs: 0, visits: 0 };
            }
            this._sceneDwellMap[this._currentSceneId].totalMs += elapsed;
            this._sceneDwellMap[this._currentSceneId].visits++;
        }
        this._sceneDwellStart = null;
    }

    /**
     * Record a telemetry entry into the buffer.
     * Applies sampling and attaches correlation context.
     */
    _record(type, data, namespace) {
        // Apply sampling
        const rate = this._samplingRates[namespace] ?? 1.0;
        if (rate < 1.0 && Math.random() > rate) return;

        const record = {
            type,
            namespace,
            timestamp: Date.now(),
            context: {
                sessionId: this._sessionId,
                campaignRunId: this._campaignRunId,
                sceneId: this._currentSceneId
            },
            data: data ? { ...data } : {}
        };

        this._buffer.push(record);

        // Trim buffer if it exceeds max
        if (this._buffer.length > this._maxBufferSize) {
            this._buffer.splice(0, this._buffer.length - this._maxBufferSize);
        }
    }

    /**
     * Subscribe to an EventBus event and track the listener for cleanup.
     */
    _listen(event, handler) {
        EventBus.on(event, handler);
        this._listeners.push({ event, handler });
    }
}

const TelemetryCollector = new TelemetryCollectorClass();

// Expose for debug/showrunner
if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.telemetryCollector = TelemetryCollector;
}

export default TelemetryCollector;
