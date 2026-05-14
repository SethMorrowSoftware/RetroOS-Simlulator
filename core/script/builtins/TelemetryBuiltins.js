/**
 * TelemetryBuiltins - RetroScript built-in functions for telemetry and analytics
 *
 * Phase 4 (Workstream J) from the ARG Expansion Master Plan.
 * Exposes telemetry recording and querying to campaign scripts.
 *
 * Namespaces:
 *   telemetry.*  — recording checkpoints, puzzle attempts, custom metrics
 *   analytics.*  — querying dwell times, funnels, engagement data
 *   replay.*     — loading and controlling replay playback
 */

import TelemetryCollector from '../../TelemetryCollector.js';
import ReplayEngine from '../../ReplayEngine.js';

/**
 * Register all telemetry builtins with the interpreter.
 * @param {Interpreter} interpreter
 */
export function registerTelemetryBuiltins(interpreter) {

    // ==========================================
    // telemetry.* — Recording
    // ==========================================

    interpreter.registerBuiltin('telemetry.checkpoint', (checkpointId, meta) => {
        if (typeof checkpointId !== 'string' || !checkpointId) {
            throw new Error('telemetry.checkpoint: checkpointId is required (string)');
        }
        const EventBus = (typeof window !== 'undefined' && window.__RETROS_DEBUG?.eventBus)
            ? window.__RETROS_DEBUG.eventBus
            : null;
        // Also emit the canonical event so TelemetryCollector picks it up
        if (EventBus) {
            EventBus.emit('story:telemetry:checkpoint', {
                checkpointId,
                ...(meta && typeof meta === 'object' ? meta : {})
            });
        }
        return true;
    });

    interpreter.registerBuiltin('telemetry.puzzleAttempt', (puzzleId, success, hintUsed) => {
        if (typeof puzzleId !== 'string' || !puzzleId) {
            throw new Error('telemetry.puzzleAttempt: puzzleId is required (string)');
        }
        const EventBus = (typeof window !== 'undefined' && window.__RETROS_DEBUG?.eventBus)
            ? window.__RETROS_DEBUG.eventBus
            : null;
        if (EventBus) {
            EventBus.emit('story:telemetry:puzzle:attempt', {
                puzzleId,
                success: Boolean(success),
                hintUsed: Boolean(hintUsed)
            });
        }
        return true;
    });

    interpreter.registerBuiltin('telemetry.dropoff', (reason) => {
        const EventBus = (typeof window !== 'undefined' && window.__RETROS_DEBUG?.eventBus)
            ? window.__RETROS_DEBUG.eventBus
            : null;
        if (EventBus) {
            EventBus.emit('story:telemetry:dropoff', { reason: reason || '' });
        }
        return true;
    });

    interpreter.registerBuiltin('telemetry.setSampling', (namespace, rate) => {
        if (typeof namespace !== 'string') {
            throw new Error('telemetry.setSampling: namespace is required (string)');
        }
        if (typeof rate !== 'number' || rate < 0 || rate > 1) {
            throw new Error('telemetry.setSampling: rate must be a number between 0 and 1');
        }
        TelemetryCollector.setSamplingRate(namespace, rate);
        return true;
    });

    interpreter.registerBuiltin('telemetry.reset', () => {
        TelemetryCollector.reset();
        return true;
    });

    // ==========================================
    // analytics.* — Querying
    // ==========================================

    interpreter.registerBuiltin('analytics.sceneDwellTimes', () => {
        return TelemetryCollector.getSceneDwellTimes();
    });

    interpreter.registerBuiltin('analytics.sceneFunnel', () => {
        return TelemetryCollector.getSceneFunnel();
    });

    interpreter.registerBuiltin('analytics.objectiveFunnel', () => {
        return TelemetryCollector.getObjectiveFunnel();
    });

    interpreter.registerBuiltin('analytics.puzzleAttempts', () => {
        return TelemetryCollector.getPuzzleAttempts();
    });

    interpreter.registerBuiltin('analytics.mediaEngagement', () => {
        return TelemetryCollector.getMediaEngagement();
    });

    interpreter.registerBuiltin('analytics.checkpoints', () => {
        return TelemetryCollector.getCheckpoints();
    });

    interpreter.registerBuiltin('analytics.query', (filter) => {
        return TelemetryCollector.query(filter && typeof filter === 'object' ? filter : {});
    });

    interpreter.registerBuiltin('analytics.exportSnapshot', () => {
        return TelemetryCollector.exportSnapshot();
    });

    interpreter.registerBuiltin('analytics.bufferSize', () => {
        return TelemetryCollector.getBuffer().length;
    });

    // ==========================================
    // replay.* — Playback
    // ==========================================

    interpreter.registerBuiltin('replay.load', (snapshot) => {
        if (!snapshot || typeof snapshot !== 'object') {
            throw new Error('replay.load: snapshot object is required');
        }
        return ReplayEngine.loadSnapshot(snapshot);
    });

    interpreter.registerBuiltin('replay.play', (speed) => {
        ReplayEngine.play(speed);
        return true;
    });

    interpreter.registerBuiltin('replay.pause', () => {
        ReplayEngine.pause();
        return true;
    });

    interpreter.registerBuiltin('replay.stop', () => {
        ReplayEngine.stop();
        return true;
    });

    interpreter.registerBuiltin('replay.step', () => {
        return ReplayEngine.step();
    });

    interpreter.registerBuiltin('replay.seek', (position) => {
        ReplayEngine.seek(position);
        return true;
    });

    interpreter.registerBuiltin('replay.setSpeed', (speed) => {
        ReplayEngine.setSpeed(speed);
        return true;
    });

    interpreter.registerBuiltin('replay.state', () => {
        return ReplayEngine.getState();
    });

    interpreter.registerBuiltin('replay.divergences', () => {
        return ReplayEngine.getDivergenceReport();
    });

    interpreter.registerBuiltin('replay.setExpectedBranch', (scenes) => {
        if (!Array.isArray(scenes)) {
            throw new Error('replay.setExpectedBranch: array of scene IDs is required');
        }
        ReplayEngine.setExpectedBranch(scenes);
        return true;
    });
}
