/**
 * Narrative event schemas
 * Auto-split from core/EventSchema.js
 */

export const narrativeEvents = {
    // ==========================================
    // STORY / NARRATIVE EVENTS (ARG Expansion)
    // ==========================================

    'story:start': {
        namespace: 'story',
        action: 'start',
        description: 'Campaign started',
        payload: {
            campaignId: 'string',
            timestamp: 'number'
        },
        example: { campaignId: 'erebus-v65', timestamp: 1709654400000 }
    },

    'story:end': {
        namespace: 'story',
        action: 'end',
        description: 'Campaign ended',
        payload: {
            campaignId: 'string',
            endingId: 'string?',
            timestamp: 'number'
        },
        example: { campaignId: 'erebus-v65', endingId: 'true-ending', timestamp: 1709654400000 }
    },

    'story:scene:enter': {
        namespace: 'story',
        action: 'scene:enter',
        description: 'Player entered a new scene',
        payload: {
            sceneId: 'string',
            previousScene: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { sceneId: 'intro', previousScene: null, campaignId: 'erebus-v65', timestamp: 1709654400000 }
    },

    'story:scene:exit': {
        namespace: 'story',
        action: 'scene:exit',
        description: 'Player exited a scene (transitioning to another)',
        payload: {
            sceneId: 'string',
            nextScene: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { sceneId: 'intro', nextScene: 'act1', campaignId: 'erebus-v65', timestamp: 1709654400000 }
    },

    'story:scene:complete': {
        namespace: 'story',
        action: 'scene:complete',
        description: 'Scene marked as completed',
        payload: {
            sceneId: 'string',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { sceneId: 'intro', campaignId: 'erebus-v65', timestamp: 1709654400000 }
    },

    'story:scene:block': {
        namespace: 'story',
        action: 'scene:block',
        description: 'Scene blocked from entry',
        payload: {
            sceneId: 'string',
            reason: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { sceneId: 'secret-room', reason: 'Missing keycard', timestamp: 1709654400000 }
    },

    'story:objective:add': {
        namespace: 'story',
        action: 'objective:add',
        description: 'New objective added to player task list',
        payload: {
            objectiveId: 'string',
            text: 'string',
            meta: 'object?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { objectiveId: 'find-key', text: 'Find the hidden key', timestamp: 1709654400000 }
    },

    'story:objective:complete': {
        namespace: 'story',
        action: 'objective:complete',
        description: 'Objective completed by player',
        payload: {
            objectiveId: 'string',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { objectiveId: 'find-key', timestamp: 1709654400000 }
    },

    'story:objective:fail': {
        namespace: 'story',
        action: 'objective:fail',
        description: 'Objective failed',
        payload: {
            objectiveId: 'string',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { objectiveId: 'escape-before-timer', timestamp: 1709654400000 }
    },

    'story:flag:set': {
        namespace: 'story',
        action: 'flag:set',
        description: 'Narrative flag set or updated',
        payload: {
            key: 'string',
            value: 'any',
            oldValue: 'any?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { key: 'door_unlocked', value: true, oldValue: null, timestamp: 1709654400000 }
    },

    'story:clue:add': {
        namespace: 'story',
        action: 'clue:add',
        description: 'New clue/evidence discovered',
        payload: {
            clueId: 'string',
            tags: 'array?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { clueId: 'torn-letter', tags: ['evidence', 'act1'], timestamp: 1709654400000 }
    },

    'story:clue:revealed': {
        namespace: 'story',
        action: 'clue:revealed',
        description: 'Clue revealed to player (UI display event)',
        payload: {
            clueId: 'string',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { clueId: 'torn-letter', timestamp: 1709654400000 }
    },

    'story:mood:set': {
        namespace: 'story',
        action: 'mood:set',
        description: 'Mood/atmosphere preset applied',
        payload: {
            presetId: 'string',
            previousPreset: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { presetId: 'tense', previousPreset: 'calm', timestamp: 1709654400000 }
    },

    'story:mood:transition': {
        namespace: 'story',
        action: 'mood:transition',
        description: 'Mood transition initiated between presets',
        payload: {
            fromPreset: 'string',
            toPreset: 'string',
            durationMs: 'number',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { fromPreset: 'calm', toPreset: 'tense', durationMs: 3000, timestamp: 1709654400000 }
    },

    // Live ops events (for showrunner/operator use)
    'story:inject': {
        namespace: 'story',
        action: 'inject',
        description: 'Manual operator event injection',
        payload: {
            type: 'string',
            data: 'object?',
            operatorId: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { type: 'scene-trigger', data: { sceneId: 'reveal' }, timestamp: 1709654400000 }
    },

    'story:override': {
        namespace: 'story',
        action: 'override',
        description: 'Emergency state correction by operator',
        payload: {
            path: 'string',
            value: 'any',
            reason: 'string?',
            operatorId: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { path: 'scenes.intro.status', value: 'completed', reason: 'Player stuck', timestamp: 1709654400000 }
    },

    'story:broadcast': {
        namespace: 'story',
        action: 'broadcast',
        description: 'Broadcast cue to cohort or all users',
        payload: {
            message: 'string',
            target: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { message: 'Phase 2 begins now', target: 'all', timestamp: 1709654400000 }
    },

    // Telemetry events
    'story:telemetry:checkpoint': {
        namespace: 'story',
        action: 'telemetry:checkpoint',
        description: 'Player reached a telemetry checkpoint',
        payload: {
            checkpointId: 'string',
            sceneId: 'string?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { checkpointId: 'act1-complete', sceneId: 'act1-finale', timestamp: 1709654400000 }
    },

    'story:telemetry:puzzle:attempt': {
        namespace: 'story',
        action: 'telemetry:puzzle:attempt',
        description: 'Player attempted a puzzle',
        payload: {
            puzzleId: 'string',
            success: 'boolean',
            attemptNumber: 'number?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { puzzleId: 'cipher-1', success: false, attemptNumber: 3, timestamp: 1709654400000 }
    },

    'story:telemetry:dropoff': {
        namespace: 'story',
        action: 'telemetry:dropoff',
        description: 'Player dropped off at a specific point',
        payload: {
            sceneId: 'string?',
            objectiveId: 'string?',
            sessionDurationMs: 'number?',
            campaignId: 'string?',
            timestamp: 'number'
        },
        example: { sceneId: 'act2', sessionDurationMs: 180000, timestamp: 1709654400000 }
    },

    'story:state:conflict': {
        namespace: 'story',
        action: 'state:conflict',
        description: 'A remote narrative state update was dropped because the local copy is newer (LWW by timestamp). Emitted so the UI can surface silently-dropped concurrent edits.',
        payload: {
            source: 'string?',
            localTimestamp: 'number',
            remoteTimestamp: 'number',
            resolution: 'string'
        },
        example: {
            source: 'remote',
            localTimestamp: 1709654400000,
            remoteTimestamp: 1709654399000,
            resolution: 'remote_dropped'
        }
    },

    // Campaign lifecycle events
    'story:campaign:install': {
        namespace: 'story',
        action: 'campaign:install',
        description: 'Campaign package installed',
        payload: {
            campaignId: 'string',
            name: 'string?',
            version: 'string?',
            timestamp: 'number'
        },
        example: { campaignId: 'erebus-v65', name: 'Project Erebus', version: '1.0.0', timestamp: 1709654400000 }
    },

    'story:campaign:uninstall': {
        namespace: 'story',
        action: 'campaign:uninstall',
        description: 'Campaign package uninstalled',
        payload: {
            campaignId: 'string',
            timestamp: 'number'
        },
        example: { campaignId: 'erebus-v65', timestamp: 1709654400000 }
    },

    'story:campaign:enable': {
        namespace: 'story',
        action: 'campaign:enable',
        description: 'Campaign enabled for playback',
        payload: {
            campaignId: 'string',
            timestamp: 'number'
        },
        example: { campaignId: 'erebus-v65', timestamp: 1709654400000 }
    },

    'story:campaign:disable': {
        namespace: 'story',
        action: 'campaign:disable',
        description: 'Campaign disabled',
        payload: {
            campaignId: 'string',
            timestamp: 'number'
        },
        example: { campaignId: 'erebus-v65', timestamp: 1709654400000 }
    },

    // ==========================================
    // CONTENT DELIVERY EVENTS (Phase 3 — Workstream G)
    // ==========================================

    'content:template:register': {
        namespace: 'content',
        action: 'template:register',
        description: 'A content template was registered',
        payload: {
            templateId: 'string',
            channel: 'string',
            timestamp: 'number'
        },
        example: { templateId: 'briefing-001', channel: 'inbox', timestamp: 1709654400000 }
    },

    'content:delivered': {
        namespace: 'content',
        action: 'delivered',
        description: 'Content was delivered to a diegetic channel',
        payload: {
            deliveryId: 'string?',
            templateId: 'string?',
            channel: 'string',
            timestamp: 'number'
        },
        example: { deliveryId: 'delivery-123', templateId: 'briefing-001', channel: 'inbox', timestamp: 1709654400000 }
    },

    'content:delivery:error': {
        namespace: 'content',
        action: 'delivery:error',
        description: 'Content delivery failed',
        payload: {
            deliveryId: 'string?',
            templateId: 'string?',
            channel: 'string',
            error: 'string',
            timestamp: 'number'
        },
        example: { deliveryId: 'delivery-123', templateId: 'briefing-001', channel: 'inbox', error: 'Template not found', timestamp: 1709654400000 }
    },

    // ==========================================
    // SHOWRUNNER / LIVE-OPS EVENTS (Phase 3 — Workstream I)
    // ==========================================

    'story:inject': {
        namespace: 'story',
        action: 'inject',
        description: 'An operator injected an event or override via Showrunner Console',
        payload: {
            type: 'string',
            description: 'string',
            timestamp: 'number'
        },
        example: { type: 'override', description: 'Force scene: act2-reveal', timestamp: 1709654400000 }
    },

    'story:override': {
        namespace: 'story',
        action: 'override',
        description: 'An operator applied a progression override',
        payload: {
            overrideType: 'string',
            target: 'string',
            value: 'any?',
            operatorId: 'string?',
            timestamp: 'number'
        },
        example: { overrideType: 'scene', target: 'act2-reveal', operatorId: 'showrunner', timestamp: 1709654400000 }
    },

    'story:broadcast': {
        namespace: 'story',
        action: 'broadcast',
        description: 'An operator sent a broadcast message',
        payload: {
            channel: 'string',
            subject: 'string?',
            body: 'string',
            from: 'string?',
            timestamp: 'number'
        },
        example: { channel: 'dialog', body: 'Server maintenance in 5 minutes', timestamp: 1709654400000 }
    },

    // ==========================================
    // REPLAY EVENTS (Phase 4)
    // ==========================================

    'replay:loaded': {
        namespace: 'replay',
        action: 'loaded',
        description: 'Telemetry snapshot loaded into replay engine',
        payload: {
            eventCount: 'number',
            sessionId: 'string?',
            campaignRunId: 'string?',
            timestamp: 'number'
        },
        example: { eventCount: 500, sessionId: 'sess-123', timestamp: 1709654400000 }
    },

    'replay:play': {
        namespace: 'replay',
        action: 'play',
        description: 'Replay playback started',
        payload: {
            speed: 'number',
            cursor: 'number',
            total: 'number'
        },
        example: { speed: 2, cursor: 0, total: 500 }
    },

    'replay:pause': {
        namespace: 'replay',
        action: 'pause',
        description: 'Replay playback paused',
        payload: {
            cursor: 'number'
        },
        example: { cursor: 150 }
    },

    'replay:stop': {
        namespace: 'replay',
        action: 'stop',
        description: 'Replay playback stopped and reset',
        payload: {
            timestamp: 'number'
        },
        example: { timestamp: 1709654400000 }
    },

    'replay:step': {
        namespace: 'replay',
        action: 'step',
        description: 'Single replay step executed',
        payload: {
            cursor: 'number',
            total: 'number',
            event: 'object'
        },
        example: { cursor: 1, total: 500, event: {} }
    },

    'replay:seek': {
        namespace: 'replay',
        action: 'seek',
        description: 'Replay cursor moved to a new position',
        payload: {
            cursor: 'number',
            total: 'number'
        },
        example: { cursor: 250, total: 500 }
    },

    'replay:progress': {
        namespace: 'replay',
        action: 'progress',
        description: 'Replay playback progress update',
        payload: {
            cursor: 'number',
            total: 'number',
            progress: 'number'
        },
        example: { cursor: 100, total: 500, progress: 0.2 }
    },

    'replay:end': {
        namespace: 'replay',
        action: 'end',
        description: 'Replay playback reached the end',
        payload: {
            timestamp: 'number',
            divergences: 'number?'
        },
        example: { timestamp: 1709654400000, divergences: 0 }
    },

    'replay:event': {
        namespace: 'replay',
        action: 'event',
        description: 'A replayed telemetry event emitted for visualization',
        payload: {
            originalType: 'string',
            namespace: 'string',
            data: 'object',
            context: 'object?',
            originalTimestamp: 'number',
            replayTimestamp: 'number'
        },
        example: { originalType: 'scene:enter', namespace: 'story', data: { sceneId: 'act1' }, originalTimestamp: 1709654400000, replayTimestamp: 1709654500000 }
    },

    'replay:divergence': {
        namespace: 'replay',
        action: 'divergence',
        description: 'Replay detected a divergence from expected branch path',
        payload: {
            step: 'number',
            expected: 'string',
            actual: 'string'
        },
        example: { step: 3, expected: 'act2-a', actual: 'act2-b' }
    },

    // ==========================================
    // NARRATIVE SSE BRIDGE EVENT
    // ==========================================
    'narrative:event': {
        namespace: 'narrative',
        action: 'event',
        description: 'Generic narrative event bridged from SSE (story, mood, character, world, puzzle, custom)',
        payload: {
            type: 'string',
            title: 'string?',
            message: 'string?',
            chapterId: 'string?',
            mood: 'string?',
            intensity: 'number?',
            characterName: 'string?',
            characterIcon: 'string?'
        },
        example: {
            type: 'story.advance',
            title: 'Chapter 2',
            message: 'The system awakens...'
        }
    }
};
