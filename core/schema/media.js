/**
 * Media event schemas
 * Auto-split from core/EventSchema.js
 */

export const mediaEvents = {
    // ==========================================
    // SOUND EVENTS
    // ==========================================
    'sound:play': {
        namespace: 'sound',
        action: 'play',
        description: 'Play a system sound',
        payload: {
            type: 'string',
            volume: 'number?'
        },
        example: {
            type: 'open',
            volume: 0.5
        }
    },

    'sound:volume': {
        namespace: 'sound',
        action: 'volume',
        description: 'Volume changed',
        payload: {
            volume: 'number'
        },
        example: {
            volume: 0.7
        }
    },

    'sound:setVolume': {
        namespace: 'sound',
        action: 'setVolume',
        description: 'Set system sound volume (from RetroScript or programmatic control)',
        payload: {
            volume: 'number'
        },
        example: {
            volume: 0.5
        }
    },

    // ==========================================
    // AUDIO PLAYBACK EVENTS (Media files)
    // ==========================================
    'audio:play': {
        namespace: 'audio',
        action: 'play',
        description: 'Start audio playback',
        payload: {
            url: 'string',
            title: 'string?'
        },
        example: {
            url: '/music/song.mp3',
            title: 'My Favorite Song'
        }
    },

    'audio:pause': {
        namespace: 'audio',
        action: 'pause',
        description: 'Pause audio playback',
        payload: {},
        example: {}
    },

    'audio:resume': {
        namespace: 'audio',
        action: 'resume',
        description: 'Resume audio playback',
        payload: {},
        example: {}
    },

    'audio:stop': {
        namespace: 'audio',
        action: 'stop',
        description: 'Stop audio playback',
        payload: {},
        example: {}
    },

    'audio:stopall': {
        namespace: 'audio',
        action: 'stopall',
        description: 'Stop all audio playback',
        payload: {},
        example: {}
    },

    'audio:ended': {
        namespace: 'audio',
        action: 'ended',
        description: 'Audio playback ended',
        payload: {
            url: 'string?'
        },
        example: {
            url: '/music/song.mp3'
        }
    },

    'audio:error': {
        namespace: 'audio',
        action: 'error',
        description: 'Audio playback error',
        payload: {
            error: 'string',
            url: 'string?'
        },
        example: {
            error: 'Failed to load audio',
            url: '/music/song.mp3'
        }
    },

    'audio:loaded': {
        namespace: 'audio',
        action: 'loaded',
        description: 'Audio file loaded',
        payload: {
            url: 'string',
            duration: 'number?'
        },
        example: {
            url: '/music/song.mp3',
            duration: 180
        }
    },

    'audio:timeupdate': {
        namespace: 'audio',
        action: 'timeupdate',
        description: 'Audio playback time updated',
        payload: {
            currentTime: 'number',
            duration: 'number'
        },
        example: {
            currentTime: 45,
            duration: 180
        }
    },

    // ==========================================
    // WINAMP/MEDIA EVENTS
    // ==========================================
    'media:track:change': {
        namespace: 'media',
        action: 'track:change',
        description: 'Track changed',
        payload: {
            track: 'string',
            index: 'number',
            duration: 'number?'
        },
        example: { track: 'Song Title', index: 3, duration: 180 }
    },

    'media:play': {
        namespace: 'media',
        action: 'play',
        description: 'Playback started',
        payload: {
            track: 'string',
            position: 'number?'
        },
        example: { track: 'My Song', position: 0 }
    },

    'media:pause': {
        namespace: 'media',
        action: 'pause',
        description: 'Playback paused',
        payload: {
            track: 'string',
            position: 'number'
        },
        example: { track: 'My Song', position: 45 }
    },

    'media:stop': {
        namespace: 'media',
        action: 'stop',
        description: 'Playback stopped',
        payload: {
            track: 'string?'
        },
        example: { track: 'My Song' }
    },

    'media:volume': {
        namespace: 'media',
        action: 'volume',
        description: 'Volume changed',
        payload: {
            volume: 'number',
            previousVolume: 'number?'
        },
        example: { volume: 0.8, previousVolume: 0.5 }
    },

    'media:position': {
        namespace: 'media',
        action: 'position',
        description: 'Playback position changed',
        payload: {
            position: 'number',
            duration: 'number'
        },
        example: { position: 60, duration: 180 }
    },

    // ==========================================
    // MEDIA CUE EVENTS (Phase 2 — Multimedia Pipeline)
    // ==========================================

    // --- Audio Cue Events ---
    'media:audio:play': {
        namespace: 'media',
        action: 'audio:play',
        description: 'Play an audio cue by asset ID',
        payload: {
            cueId: 'string',
            assetId: 'string',
            group: 'string?',
            volume: 'number?',
            loop: 'boolean?',
            fadeInMs: 'number?',
            priority: 'number?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { cueId: 'amb-forest', assetId: 'forest-ambience', group: 'ambience', volume: 0.4, loop: true, timestamp: 1709654400000 }
    },

    'media:audio:stop': {
        namespace: 'media',
        action: 'audio:stop',
        description: 'Stop an audio cue',
        payload: {
            cueId: 'string?',
            group: 'string?',
            fadeOutMs: 'number?',
            timestamp: 'number'
        },
        example: { cueId: 'amb-forest', fadeOutMs: 1000, timestamp: 1709654400000 }
    },

    'media:audio:duck': {
        namespace: 'media',
        action: 'audio:duck',
        description: 'Duck an audio group volume for a duration',
        payload: {
            group: 'string',
            level: 'number',
            durationMs: 'number',
            timestamp: 'number'
        },
        example: { group: 'ambience', level: 0.2, durationMs: 3000, timestamp: 1709654400000 }
    },

    'media:audio:restore': {
        namespace: 'media',
        action: 'audio:restore',
        description: 'Restore ducked audio group to original volume',
        payload: {
            group: 'string',
            timestamp: 'number'
        },
        example: { group: 'ambience', timestamp: 1709654400000 }
    },

    // --- Video Cue Events ---
    'media:video:play': {
        namespace: 'media',
        action: 'video:play',
        description: 'Play a video cue by asset ID',
        payload: {
            cueId: 'string',
            assetId: 'string',
            volume: 'number?',
            loop: 'boolean?',
            fullscreen: 'boolean?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { cueId: 'vid-intro', assetId: 'intro-cinematic', volume: 0.8, timestamp: 1709654400000 }
    },

    'media:video:pause': {
        namespace: 'media',
        action: 'video:pause',
        description: 'Pause a video cue',
        payload: {
            cueId: 'string',
            timestamp: 'number'
        },
        example: { cueId: 'vid-intro', timestamp: 1709654400000 }
    },

    'media:video:stop': {
        namespace: 'media',
        action: 'video:stop',
        description: 'Stop a video cue',
        payload: {
            cueId: 'string?',
            timestamp: 'number'
        },
        example: { cueId: 'vid-intro', timestamp: 1709654400000 }
    },

    'media:video:seek': {
        namespace: 'media',
        action: 'video:seek',
        description: 'Seek a video cue to a position',
        payload: {
            cueId: 'string',
            positionMs: 'number',
            timestamp: 'number'
        },
        example: { cueId: 'vid-intro', positionMs: 5000, timestamp: 1709654400000 }
    },

    // --- Image Layer Events ---
    'media:image:show': {
        namespace: 'media',
        action: 'image:show',
        description: 'Show an image on a named layer',
        payload: {
            layerId: 'string',
            assetId: 'string',
            src: 'string?',
            opacity: 'number?',
            fadeInMs: 'number?',
            position: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { layerId: 'overlay-1', assetId: 'glitch-pattern', opacity: 0.5, fadeInMs: 500, timestamp: 1709654400000 }
    },

    'media:image:clear': {
        namespace: 'media',
        action: 'image:clear',
        description: 'Clear an image layer',
        payload: {
            layerId: 'string',
            fadeOutMs: 'number?',
            timestamp: 'number'
        },
        example: { layerId: 'overlay-1', fadeOutMs: 300, timestamp: 1709654400000 }
    },

    // --- Subtitle/Text Overlay Events ---
    'media:subtitle:show': {
        namespace: 'media',
        action: 'subtitle:show',
        description: 'Show a subtitle/text overlay on a track',
        payload: {
            trackId: 'string',
            text: 'string',
            durationMs: 'number?',
            style: 'string?',
            position: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { trackId: 'main', text: 'The signal is getting stronger...', durationMs: 4000, position: 'bottom', timestamp: 1709654400000 }
    },

    'media:subtitle:clear': {
        namespace: 'media',
        action: 'subtitle:clear',
        description: 'Clear subtitle track(s)',
        payload: {
            trackId: 'string?',
            timestamp: 'number'
        },
        example: { trackId: 'main', timestamp: 1709654400000 }
    },

    // --- Visual FX Events ---
    'media:fx:apply': {
        namespace: 'media',
        action: 'fx:apply',
        description: 'Apply a visual effect preset',
        payload: {
            presetId: 'string',
            intensity: 'number?',
            durationMs: 'number?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { presetId: 'screen-shake', intensity: 0.6, durationMs: 500, timestamp: 1709654400000 }
    },

    'media:fx:clear': {
        namespace: 'media',
        action: 'fx:clear',
        description: 'Clear a visual effect',
        payload: {
            presetId: 'string?',
            timestamp: 'number'
        },
        example: { presetId: 'screen-shake', timestamp: 1709654400000 }
    },

    // --- Cue Lifecycle Events ---
    'media:cue:start': {
        namespace: 'media',
        action: 'cue:start',
        description: 'A media cue has started playback',
        payload: {
            cueId: 'string',
            type: 'string',
            assetId: 'string',
            timestamp: 'number'
        },
        example: { cueId: 'amb-forest', type: 'audio', assetId: 'forest-ambience', timestamp: 1709654400000 }
    },

    'media:cue:end': {
        namespace: 'media',
        action: 'cue:end',
        description: 'A media cue has ended',
        payload: {
            cueId: 'string',
            type: 'string',
            reason: 'string?',
            timestamp: 'number'
        },
        example: { cueId: 'amb-forest', type: 'audio', reason: 'completed', timestamp: 1709654400000 }
    },

    'media:cue:error': {
        namespace: 'media',
        action: 'cue:error',
        description: 'A media cue encountered an error',
        payload: {
            cueId: 'string',
            type: 'string',
            error: 'string',
            assetId: 'string?',
            timestamp: 'number'
        },
        example: { cueId: 'amb-forest', type: 'audio', error: 'Asset not found', assetId: 'forest-ambience', timestamp: 1709654400000 }
    },

    // --- Asset Pipeline Events ---
    'media:asset:preload': {
        namespace: 'media',
        action: 'asset:preload',
        description: 'Request to preload a media asset',
        payload: {
            assetId: 'string',
            type: 'string',
            src: 'string',
            priority: 'number?',
            timestamp: 'number'
        },
        example: { assetId: 'forest-ambience', type: 'audio', src: 'assets/audio/forest.mp3', priority: 1, timestamp: 1709654400000 }
    },

    'media:asset:loaded': {
        namespace: 'media',
        action: 'asset:loaded',
        description: 'Media asset finished loading',
        payload: {
            assetId: 'string',
            type: 'string',
            sizeBytes: 'number?',
            timestamp: 'number'
        },
        example: { assetId: 'forest-ambience', type: 'audio', sizeBytes: 245000, timestamp: 1709654400000 }
    },

    'media:asset:error': {
        namespace: 'media',
        action: 'asset:error',
        description: 'Media asset failed to load',
        payload: {
            assetId: 'string',
            type: 'string',
            error: 'string',
            timestamp: 'number'
        },
        example: { assetId: 'forest-ambience', type: 'audio', error: 'Network timeout', timestamp: 1709654400000 }
    },

    // --- Cue Script Events ---
    'media:cue:script': {
        namespace: 'media',
        action: 'cue:script',
        description: 'A media cue graph node triggered a script execution',
        payload: {
            graphId: 'string',
            nodeId: 'string',
            scriptRef: 'string?',
            inline: 'string?',
            timestamp: 'number'
        },
        example: {
            graphId: 'graph-1',
            nodeId: 'node-5',
            scriptRef: 'scripts/reveal.retro',
            inline: null,
            timestamp: 1709654400000
        }
    },

    // --- Media Scanner Events ---
    'media:scan:complete': {
        namespace: 'media',
        action: 'scan:complete',
        description: 'Media scanner finished scanning filesystem for media files',
        payload: {
            musicCount: 'number',
            videoCount: 'number',
            method: 'string',
            timestamp: 'number'
        },
        example: {
            musicCount: 15,
            videoCount: 3,
            method: 'filesystem',
            timestamp: 1709654400000
        }
    },

    'media:budget:warning': {
        namespace: 'media',
        action: 'budget:warning',
        description: 'Media budget threshold exceeded',
        payload: {
            metric: 'string',
            current: 'number',
            limit: 'number',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { metric: 'concurrent_audio', current: 6, limit: 8, timestamp: 1709654400000 }
    },

    'media:budget:exceeded': {
        namespace: 'media',
        action: 'budget:exceeded',
        description: 'Media budget hard limit exceeded',
        payload: {
            metric: 'string',
            current: 'number',
            limit: 'number',
            rejected: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { metric: 'concurrent_audio', current: 9, limit: 8, rejected: 'amb-rain', timestamp: 1709654400000 }
    },
};
