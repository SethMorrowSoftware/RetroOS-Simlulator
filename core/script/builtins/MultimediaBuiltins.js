/**
 * MultimediaBuiltins - Multimedia cue scripting functions for RetroScript
 *
 * Phase 2 of the ARG Expansion Master Plan (Workstream A §4.2).
 * Provides the multimedia API namespaces:
 *   audio.*    — Audio cue playback, ducking, and channel grouping
 *   video.*    — Video cue playback, seeking, and control
 *   image.*    — Image layer show/hide with transitions
 *   subtitle.* — Text overlay tracks for diegetic messaging
 *   fx.*       — Visual effect presets (screen shake, glitch, flash, etc.)
 *
 * All mutating helpers emit canonical media:* events.
 * APIs are idempotent where practical.
 * All helpers have deterministic failure responses.
 *
 * Available from Script Runner, Terminal `retro`, and autoexec scripts.
 */

import MediaScanner from '../../MediaScanner.js';

export function registerMultimediaBuiltins(interpreter) {

    /**
     * Helper: get MediaAssetManager from context
     * @returns {Object|null}
     */
    function getMAM() {
        return interpreter.context.MediaAssetManager || null;
    }

    /**
     * Helper: get EventBus from context
     * @returns {Object|null}
     */
    function getEventBus() {
        return interpreter.context.EventBus || null;
    }

    /**
     * Helper: resolve a source path or assetId to a playable URL.
     * Tries MediaAssetManager manifest first, then filesystem path resolution.
     * @param {string} source - Asset ID, filesystem path, or URL
     * @param {string} type - Expected media type ('audio', 'video', 'image')
     * @returns {{src: string, assetId: string|null}} Resolved source info
     */
    function resolveSource(source, type) {
        const mam = getMAM();
        let src = String(source || '');
        let assetId = null;

        // Try asset manifest first
        if (mam) {
            const asset = mam.resolve(src);
            if (asset && (!type || asset.type === type)) {
                return { src: asset.src, assetId: asset.id };
            }
        }

        // Try filesystem path resolution
        if (src.includes('C:') || src.includes('c:')) {
            const parts = src.replace(/\\/g, '/').split('/').filter(Boolean);
            const resolved = MediaScanner.resolveMediaUrl(parts);
            if (resolved) src = resolved;
        }

        return { src, assetId };
    }

    /**
     * Helper: generate a cue ID from source if none provided
     */
    function makeCueId(prefix, source) {
        return `${prefix}-${String(source || 'unknown').replace(/[^a-z0-9]/gi, '-').substring(0, 32)}-${Date.now().toString(36)}`;
    }

    // ==========================================
    // audio.* — Audio cue playback and control
    // ==========================================

    /**
     * audio.play(assetId, opts?) — Play an audio cue
     * opts: { cueId?, group?, volume?, loop?, fadeInMs?, priority? }
     * Emits: media:audio:play
     * @returns {string|false} cueId on success, false on failure
     */
    interpreter.registerBuiltin('audio.play', (source, opts = {}) => {
        const bus = getEventBus();
        const mam = getMAM();
        if (!bus || !source) return false;

        const { src, assetId } = resolveSource(source, 'audio');
        if (!src) return false;

        const group = String(opts.group || 'music');
        const cueId = String(opts.cueId || makeCueId('audio', source));

        // Budget check
        if (mam && !mam.canStartCue('audio', group)) {
            bus.emit('media:budget:exceeded', {
                metric: 'concurrent_audio',
                current: mam.getBudgetState().audio.current,
                limit: mam.getBudgetState().audio.limit,
                rejected: cueId,
                timestamp: Date.now()
            });
            return false;
        }

        // Register active cue
        if (mam) {
            mam.registerActiveCue(cueId, {
                type: 'audio',
                assetId: assetId || source,
                group,
                src
            });
        }

        // Emit the cue play event
        bus.emit('media:audio:play', {
            cueId,
            assetId: assetId || String(source),
            group,
            volume: opts.volume !== undefined ? Number(opts.volume) : undefined,
            loop: Boolean(opts.loop),
            fadeInMs: opts.fadeInMs !== undefined ? Number(opts.fadeInMs) : undefined,
            priority: opts.priority !== undefined ? Number(opts.priority) : undefined,
            timestamp: Date.now()
        });

        // Also emit standard audio:play for SoundSystem compatibility
        const volume = opts.volume !== undefined ? Number(opts.volume) : undefined;
        const groupMultiplier = mam ? mam.getGroupVolumeMultiplier(group) : 1;
        const effectiveVolume = volume !== undefined ? volume * groupMultiplier : undefined;

        bus.emit('audio:play', {
            src,
            volume: effectiveVolume,
            loop: Boolean(opts.loop),
            force: true,
            _cueId: cueId,
            _group: group
        });

        return cueId;
    });

    /**
     * audio.stop(cueId?) — Stop an audio cue or all audio
     * Emits: media:audio:stop
     */
    interpreter.registerBuiltin('audio.stop', (cueId) => {
        const bus = getEventBus();
        const mam = getMAM();
        if (!bus) return false;

        bus.emit('media:audio:stop', {
            cueId: cueId ? String(cueId) : undefined,
            timestamp: Date.now()
        });

        if (cueId) {
            // Stop specific cue
            if (mam) {
                const cue = mam.getActiveCue(String(cueId));
                if (cue) {
                    bus.emit('audio:stop', { src: cue.src });
                    mam.unregisterActiveCue(String(cueId), 'stopped');
                }
            }
        } else {
            // Stop all audio cues
            if (mam) {
                const active = mam.getActiveCues();
                for (const [id, cue] of Object.entries(active)) {
                    if (cue.type === 'audio') {
                        mam.unregisterActiveCue(id, 'stopped');
                    }
                }
            }
            bus.emit('audio:stopall', {});
        }

        return true;
    });

    /**
     * audio.duck(group, level, durationMs) — Duck an audio group's volume
     * Emits: media:audio:duck
     */
    interpreter.registerBuiltin('audio.duck', (group, level, durationMs) => {
        const bus = getEventBus();
        const mam = getMAM();
        if (!bus || !group) return false;

        const safeLevel = Math.max(0, Math.min(1, Number(level) || 0));
        const safeDuration = Math.max(0, Number(durationMs) || 3000);

        if (mam) {
            mam.duckGroup(String(group), safeLevel, safeDuration);
        } else {
            bus.emit('media:audio:duck', {
                group: String(group),
                level: safeLevel,
                durationMs: safeDuration,
                timestamp: Date.now()
            });
        }

        return true;
    });

    /**
     * audio.restore(group) — Restore a ducked audio group
     * Emits: media:audio:restore
     */
    interpreter.registerBuiltin('audio.restore', (group) => {
        const bus = getEventBus();
        const mam = getMAM();
        if (!bus || !group) return false;

        if (mam) {
            mam.restoreGroup(String(group));
        } else {
            bus.emit('media:audio:restore', {
                group: String(group),
                timestamp: Date.now()
            });
        }

        return true;
    });

    /**
     * audio.isPlaying(cueId) — Check if a specific cue is playing
     */
    interpreter.registerBuiltin('audio.isPlaying', (cueId) => {
        const mam = getMAM();
        if (!mam || !cueId) return false;
        return mam.getActiveCue(String(cueId)) !== null;
    });

    /**
     * audio.activeCues() — List all active audio cues
     */
    interpreter.registerBuiltin('audio.activeCues', () => {
        const mam = getMAM();
        if (!mam) return [];
        const cues = mam.getActiveCues();
        return Object.entries(cues)
            .filter(([, c]) => c.type === 'audio')
            .map(([id, c]) => ({ cueId: id, assetId: c.assetId, group: c.group }));
    });

    // ==========================================
    // video.* — Video cue playback
    // ==========================================

    /**
     * video.play(assetId, opts?) — Play a video cue
     * opts: { cueId?, volume?, loop?, fullscreen? }
     * Emits: media:video:play
     * @returns {string|false} cueId on success, false on failure
     */
    interpreter.registerBuiltin('video.play', async (source, opts = {}) => {
        const bus = getEventBus();
        const mam = getMAM();
        if (!bus || !source) return false;

        const { src, assetId } = resolveSource(source, 'video');
        if (!src) return false;

        const cueId = String(opts.cueId || makeCueId('video', source));

        // Budget check
        if (mam && !mam.canStartCue('video')) {
            bus.emit('media:budget:exceeded', {
                metric: 'concurrent_video',
                current: mam.getBudgetState().video.current,
                limit: mam.getBudgetState().video.limit,
                rejected: cueId,
                timestamp: Date.now()
            });
            return false;
        }

        if (mam) {
            mam.registerActiveCue(cueId, {
                type: 'video',
                assetId: assetId || source,
                src
            });
        }

        bus.emit('media:video:play', {
            cueId,
            assetId: assetId || String(source),
            volume: opts.volume !== undefined ? Number(opts.volume) : undefined,
            loop: Boolean(opts.loop),
            fullscreen: Boolean(opts.fullscreen),
            timestamp: Date.now()
        });

        // Launch video player via the unified command registry
        try {
            const name = src.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Video';
            await bus.executeCommand('app:launch', {
                appId: 'mediaplayer',
                params: {
                    src,
                    name,
                    volume: opts.volume,
                    loop: Boolean(opts.loop),
                    fullscreen: Boolean(opts.fullscreen),
                    _cueId: cueId
                }
            });
        } catch (e) {
            console.warn('[MultimediaBuiltins] video.play launch error:', e);
            if (mam) mam.unregisterActiveCue(cueId, 'error');
            return false;
        }

        return cueId;
    });

    /**
     * video.stop(cueId?) — Stop a video cue
     * Emits: media:video:stop
     */
    interpreter.registerBuiltin('video.stop', async (cueId) => {
        const bus = getEventBus();
        const mam = getMAM();
        if (!bus) return false;

        bus.emit('media:video:stop', {
            cueId: cueId ? String(cueId) : undefined,
            timestamp: Date.now()
        });

        if (mam && cueId) {
            mam.unregisterActiveCue(String(cueId), 'stopped');
        }

        try {
            await bus.executeCommand('mediaplayer:stop', {});
        } catch { /* ignore */ }

        return true;
    });

    /**
     * video.pause(cueId) — Pause a video cue
     * Emits: media:video:pause
     */
    interpreter.registerBuiltin('video.pause', (cueId) => {
        const bus = getEventBus();
        if (!bus || !cueId) return false;

        bus.emit('media:video:pause', {
            cueId: String(cueId),
            timestamp: Date.now()
        });

        return true;
    });

    /**
     * video.seek(cueId, positionMs) — Seek a video to a position
     * Emits: media:video:seek
     */
    interpreter.registerBuiltin('video.seek', (cueId, positionMs) => {
        const bus = getEventBus();
        if (!bus || !cueId) return false;

        bus.emit('media:video:seek', {
            cueId: String(cueId),
            positionMs: Math.max(0, Number(positionMs) || 0),
            timestamp: Date.now()
        });

        return true;
    });

    // ==========================================
    // image.* — Image overlay layers
    // ==========================================

    /**
     * image.show(layerId, assetId, opts?) — Show an image on a named layer
     * opts: { opacity?, fadeInMs?, position?, src? }
     * Emits: media:image:show
     */
    interpreter.registerBuiltin('image.show', (layerId, source, opts = {}) => {
        const bus = getEventBus();
        if (!bus || !layerId || !source) return false;

        const { src, assetId } = resolveSource(source, 'image');
        if (!src) return false;

        bus.emit('media:image:show', {
            layerId: String(layerId),
            assetId: assetId || String(source),
            src,
            opacity: opts.opacity !== undefined ? Math.max(0, Math.min(1, Number(opts.opacity))) : 1,
            fadeInMs: opts.fadeInMs !== undefined ? Math.max(0, Number(opts.fadeInMs)) : 0,
            position: opts.position ? String(opts.position) : 'center',
            timestamp: Date.now()
        });

        return true;
    });

    /**
     * image.clear(layerId?) — Clear an image layer (or all layers)
     * Emits: media:image:clear
     */
    interpreter.registerBuiltin('image.clear', (layerId) => {
        const bus = getEventBus();
        if (!bus) return false;

        bus.emit('media:image:clear', {
            layerId: layerId ? String(layerId) : undefined,
            fadeOutMs: 0,
            timestamp: Date.now()
        });

        return true;
    });

    // ==========================================
    // subtitle.* — Text overlay tracks
    // ==========================================

    /**
     * subtitle.show(trackId, text, opts?) — Show a subtitle on a track
     * opts: { durationMs?, style?, position? }
     * Emits: media:subtitle:show
     */
    interpreter.registerBuiltin('subtitle.show', (trackId, text, opts = {}) => {
        const bus = getEventBus();
        if (!bus || !trackId || !text) return false;

        bus.emit('media:subtitle:show', {
            trackId: String(trackId),
            text: String(text),
            durationMs: opts.durationMs !== undefined ? Math.max(0, Number(opts.durationMs)) : undefined,
            style: opts.style ? String(opts.style) : undefined,
            position: opts.position ? String(opts.position) : 'bottom',
            timestamp: Date.now()
        });

        // Auto-clear after duration if specified
        if (opts.durationMs && Number(opts.durationMs) > 0) {
            setTimeout(() => {
                bus.emit('media:subtitle:clear', {
                    trackId: String(trackId),
                    timestamp: Date.now()
                });
            }, Number(opts.durationMs));
        }

        return true;
    });

    /**
     * subtitle.clear(trackId?) — Clear subtitle track(s)
     * Emits: media:subtitle:clear
     */
    interpreter.registerBuiltin('subtitle.clear', (trackId) => {
        const bus = getEventBus();
        if (!bus) return false;

        bus.emit('media:subtitle:clear', {
            trackId: trackId ? String(trackId) : undefined,
            timestamp: Date.now()
        });

        return true;
    });

    // ==========================================
    // fx.* — Visual effect presets
    // ==========================================

    /**
     * fx.apply(presetId, opts?) — Apply a visual effect
     * presetId: 'screen-shake' | 'glitch' | 'flash' | 'vignette' | 'scanlines' | 'static' | 'chromatic'
     * opts: { intensity?, durationMs? }
     * Emits: media:fx:apply
     */
    interpreter.registerBuiltin('fx.apply', (presetId, opts = {}) => {
        const bus = getEventBus();
        if (!bus || !presetId) return false;

        const intensity = opts.intensity !== undefined ? Math.max(0, Math.min(1, Number(opts.intensity))) : 0.5;
        const durationMs = opts.durationMs !== undefined ? Math.max(0, Number(opts.durationMs)) : undefined;

        bus.emit('media:fx:apply', {
            presetId: String(presetId),
            intensity,
            durationMs,
            timestamp: Date.now()
        });

        // Auto-clear after duration if specified
        if (durationMs && durationMs > 0) {
            setTimeout(() => {
                bus.emit('media:fx:clear', {
                    presetId: String(presetId),
                    timestamp: Date.now()
                });
            }, durationMs);
        }

        return true;
    });

    /**
     * fx.clear(presetId?) — Clear a visual effect (or all effects)
     * Emits: media:fx:clear
     */
    interpreter.registerBuiltin('fx.clear', (presetId) => {
        const bus = getEventBus();
        if (!bus) return false;

        bus.emit('media:fx:clear', {
            presetId: presetId ? String(presetId) : undefined,
            timestamp: Date.now()
        });

        return true;
    });

    // ==========================================
    // media.* — Cross-cutting media helpers
    // ==========================================

    /**
     * media.preload(assetId, opts?) — Preload an asset for faster playback
     * opts: { priority? }
     */
    interpreter.registerBuiltin('media.preload', async (assetId, opts = {}) => {
        const mam = getMAM();
        if (!mam || !assetId) return false;

        return await mam.preload(String(assetId), {
            priority: opts.priority !== undefined ? Number(opts.priority) : 0
        });
    });

    /**
     * media.resolve(assetId) — Resolve an asset ID to its definition
     */
    interpreter.registerBuiltin('media.resolve', (assetId) => {
        const mam = getMAM();
        if (!mam || !assetId) return null;

        const asset = mam.resolve(String(assetId));
        if (!asset) return null;

        return {
            id: asset.id,
            type: asset.type,
            src: asset.src,
            locale: asset.locale || null,
            fallback: asset.fallback || null
        };
    });

    /**
     * media.budget() — Get current media budget state
     */
    interpreter.registerBuiltin('media.budget', () => {
        const mam = getMAM();
        if (!mam) return null;
        return mam.getBudgetState();
    });

    /**
     * media.stopAll() — Stop all active media cues
     */
    interpreter.registerBuiltin('media.stopAll', () => {
        const bus = getEventBus();
        const mam = getMAM();
        if (!bus) return false;

        if (mam) mam.stopAllCues();
        bus.emit('audio:stopall', {});

        return true;
    });
}

export default registerMultimediaBuiltins;
