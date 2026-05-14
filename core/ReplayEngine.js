/**
 * ReplayEngine - Deterministic timeline reconstruction from telemetry streams
 *
 * Phase 4 (Workstream J) from the ARG Expansion Master Plan.
 * Replays recorded telemetry events at original or accelerated speed,
 * emitting them back through EventBus for live visualization.
 *
 * Features:
 *   - Load a telemetry snapshot and reconstruct the timeline
 *   - Playback at variable speed (1x, 2x, 4x, 8x, pause)
 *   - Step-by-step execution for debugging
 *   - Divergence detection: compare expected vs actual branch paths
 *   - Export divergence reports
 *
 * Non-goal: ReplayEngine does NOT mutate real narrative state.
 * It emits events on a separate 'replay:*' namespace so listeners
 * can visualize without corrupting the live campaign.
 */

import EventBus from './EventBus.js';

class ReplayEngineClass {
    constructor() {
        this._initialized = false;
        this._events = [];
        this._cursor = 0;
        this._playing = false;
        this._speed = 1;
        this._timer = null;
        this._startedAt = null;
        this._baseTimestamp = null;

        // Divergence tracking
        this._expectedBranch = null;
        this._divergences = [];
    }

    /**
     * Initialize the replay engine.
     */
    initialize() {
        if (this._initialized) return;
        this._initialized = true;
        console.log('[ReplayEngine] Initialized');
    }

    // ==========================================
    // LOADING
    // ==========================================

    /**
     * Load a telemetry snapshot for replay.
     * @param {Object} snapshot - From TelemetryCollector.exportSnapshot()
     */
    loadSnapshot(snapshot) {
        this.stop();
        this._events = (snapshot?.events || [])
            .slice()
            .sort((a, b) => a.timestamp - b.timestamp);
        this._cursor = 0;
        this._divergences = [];
        this._baseTimestamp = this._events.length > 0 ? this._events[0].timestamp : null;

        EventBus.emit('replay:loaded', {
            eventCount: this._events.length,
            sessionId: snapshot?.sessionId,
            campaignRunId: snapshot?.campaignRunId,
            timestamp: Date.now()
        });

        return {
            eventCount: this._events.length,
            duration: this._events.length > 0
                ? this._events[this._events.length - 1].timestamp - this._events[0].timestamp
                : 0
        };
    }

    /**
     * Load raw event array for replay.
     * @param {Array} events - Array of telemetry records with .timestamp
     */
    loadEvents(events) {
        this.stop();
        this._events = (events || [])
            .slice()
            .sort((a, b) => a.timestamp - b.timestamp);
        this._cursor = 0;
        this._divergences = [];
        this._baseTimestamp = this._events.length > 0 ? this._events[0].timestamp : null;
        return { eventCount: this._events.length };
    }

    /**
     * Set an expected branch path for divergence detection.
     * @param {string[]} expectedScenes - Ordered list of expected scene IDs
     */
    setExpectedBranch(expectedScenes) {
        this._expectedBranch = expectedScenes ? [...expectedScenes] : null;
        this._divergences = [];
    }

    // ==========================================
    // PLAYBACK CONTROLS
    // ==========================================

    /**
     * Start or resume playback.
     * @param {number} speed - Playback speed multiplier (default 1)
     */
    play(speed) {
        if (this._events.length === 0) return;
        if (speed !== undefined) this._speed = Math.max(0.25, Math.min(32, speed));

        this._playing = true;
        this._startedAt = Date.now();

        EventBus.emit('replay:play', {
            speed: this._speed,
            cursor: this._cursor,
            total: this._events.length
        });

        this._scheduleNext();
    }

    /**
     * Pause playback.
     */
    pause() {
        this._playing = false;
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        EventBus.emit('replay:pause', { cursor: this._cursor });
    }

    /**
     * Stop playback and reset cursor.
     */
    stop() {
        this._playing = false;
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._cursor = 0;
        this._startedAt = null;
        EventBus.emit('replay:stop', { timestamp: Date.now() });
    }

    /**
     * Step forward one event (for debugging).
     */
    step() {
        if (this._cursor >= this._events.length) {
            EventBus.emit('replay:end', { timestamp: Date.now() });
            return null;
        }

        const event = this._events[this._cursor];
        this._emitReplayEvent(event);
        this._cursor++;

        EventBus.emit('replay:step', {
            cursor: this._cursor,
            total: this._events.length,
            event: event
        });

        return event;
    }

    /**
     * Seek to a specific position in the timeline.
     * @param {number} position - Index in the event array
     */
    seek(position) {
        this._cursor = Math.max(0, Math.min(position, this._events.length));
        EventBus.emit('replay:seek', {
            cursor: this._cursor,
            total: this._events.length
        });
    }

    /**
     * Seek to a specific timestamp.
     * @param {number} timestamp - Unix timestamp to seek to
     */
    seekToTime(timestamp) {
        let idx = 0;
        for (let i = 0; i < this._events.length; i++) {
            if (this._events[i].timestamp >= timestamp) {
                idx = i;
                break;
            }
            idx = i + 1;
        }
        this.seek(idx);
    }

    /**
     * Set playback speed.
     * @param {number} speed - Multiplier (0.25 - 32)
     */
    setSpeed(speed) {
        this._speed = Math.max(0.25, Math.min(32, speed));
        // If playing, reschedule with new speed
        if (this._playing) {
            if (this._timer) clearTimeout(this._timer);
            this._scheduleNext();
        }
    }

    // ==========================================
    // STATE QUERIES
    // ==========================================

    /**
     * Get current playback state.
     */
    getState() {
        return {
            playing: this._playing,
            speed: this._speed,
            cursor: this._cursor,
            total: this._events.length,
            progress: this._events.length > 0 ? this._cursor / this._events.length : 0,
            currentEvent: this._events[this._cursor] || null,
            elapsed: this._getElapsedReplayTime(),
            totalDuration: this._getTotalDuration()
        };
    }

    /**
     * Get divergence report.
     */
    getDivergenceReport() {
        return {
            expectedBranch: this._expectedBranch,
            divergences: [...this._divergences],
            hasDivergence: this._divergences.length > 0
        };
    }

    /**
     * Get all events within a time window.
     * @param {number} startMs - Start offset from beginning (ms)
     * @param {number} endMs - End offset from beginning (ms)
     */
    getEventsInWindow(startMs, endMs) {
        if (!this._baseTimestamp) return [];
        const start = this._baseTimestamp + startMs;
        const end = this._baseTimestamp + endMs;
        return this._events.filter(e => e.timestamp >= start && e.timestamp <= end);
    }

    // ==========================================
    // INTERNAL
    // ==========================================

    _scheduleNext() {
        if (!this._playing || this._cursor >= this._events.length) {
            if (this._cursor >= this._events.length) {
                this._playing = false;
                EventBus.emit('replay:end', {
                    timestamp: Date.now(),
                    divergences: this._divergences.length
                });
            }
            return;
        }

        const current = this._events[this._cursor];
        const next = this._events[this._cursor + 1];

        // Emit current event
        this._emitReplayEvent(current);
        this._checkDivergence(current);
        this._cursor++;

        // Update progress
        EventBus.emit('replay:progress', {
            cursor: this._cursor,
            total: this._events.length,
            progress: this._cursor / this._events.length
        });

        if (!next || this._cursor >= this._events.length) {
            this._playing = false;
            EventBus.emit('replay:end', {
                timestamp: Date.now(),
                divergences: this._divergences.length
            });
            return;
        }

        // Calculate delay for next event based on speed
        const gap = next.timestamp - current.timestamp;
        const delay = Math.max(1, gap / this._speed);

        // Cap delay at 5 seconds to avoid long waits in replays
        const cappedDelay = Math.min(delay, 5000);

        this._timer = setTimeout(() => this._scheduleNext(), cappedDelay);
    }

    _emitReplayEvent(event) {
        EventBus.emit('replay:event', {
            originalType: event.type,
            namespace: event.namespace,
            data: event.data,
            context: event.context,
            originalTimestamp: event.timestamp,
            replayTimestamp: Date.now()
        });
    }

    _checkDivergence(event) {
        if (!this._expectedBranch || event.type !== 'scene:enter') return;

        const sceneId = event.data?.sceneId;
        if (!sceneId) return;

        // Find which scene we expected at this funnel step
        const sceneEnterCount = this._events
            .slice(0, this._cursor)
            .filter(e => e.type === 'scene:enter')
            .length;

        const expectedScene = this._expectedBranch[sceneEnterCount - 1];
        if (expectedScene && expectedScene !== sceneId) {
            this._divergences.push({
                step: sceneEnterCount,
                expected: expectedScene,
                actual: sceneId,
                timestamp: event.timestamp,
                cursor: this._cursor
            });

            EventBus.emit('replay:divergence', {
                step: sceneEnterCount,
                expected: expectedScene,
                actual: sceneId
            });
        }
    }

    _getElapsedReplayTime() {
        if (!this._baseTimestamp || this._cursor === 0) return 0;
        const currentEvent = this._events[Math.min(this._cursor, this._events.length - 1)];
        return currentEvent.timestamp - this._baseTimestamp;
    }

    _getTotalDuration() {
        if (this._events.length < 2) return 0;
        return this._events[this._events.length - 1].timestamp - this._events[0].timestamp;
    }
}

const ReplayEngine = new ReplayEngineClass();

// Expose for debug
if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.replayEngine = ReplayEngine;
}

export default ReplayEngine;
