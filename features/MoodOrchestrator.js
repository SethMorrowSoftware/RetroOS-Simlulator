/**
 * MoodOrchestrator - Mood and atmosphere orchestration for ARG experiences
 *
 * Workstream G from the ARG Expansion Master Plan.
 * Listens for story:mood:* events and applies visual/audio changes.
 *
 * Mood dimensions:
 *   - Theme/palette (CSS custom properties)
 *   - Wallpaper/background pattern
 *   - CRT/post-processing intensity
 *   - Ambient audio loops
 *   - Notification/dialog styling accents
 *
 * Presets can be loaded from campaign mood JSON files or registered at runtime.
 * All mood changes are reversible and deterministic.
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus from '../core/EventBus.js';
import StorageManager from '../core/StorageManager.js';

/**
 * Built-in mood presets
 * Each preset defines visual and audio tokens that map to existing system capabilities.
 */
const BUILT_IN_PRESETS = {
    'default': {
        name: 'Default',
        description: 'Standard IlluminatOS appearance',
        visual: {
            wallpaper: null,
            bgColor: null,
            crtIntensity: null,
            cssVars: {}
        },
        audio: {
            ambient: null,
            stinger: null
        },
        transition: {
            duration: 500,
            easing: 'ease-in-out'
        }
    },
    'calm': {
        name: 'Calm',
        description: 'Relaxed, ambient atmosphere',
        visual: {
            bgColor: '#1a1a2e',
            crtIntensity: 0.3,
            cssVars: {
                '--mood-accent': '#4a90d9',
                '--mood-glow': 'rgba(74, 144, 217, 0.15)'
            }
        },
        audio: {
            ambient: null
        },
        transition: {
            duration: 2000,
            easing: 'ease-in-out'
        }
    },
    'tense': {
        name: 'Tense',
        description: 'High tension, suspenseful',
        visual: {
            bgColor: '#1a0a0a',
            crtIntensity: 0.7,
            cssVars: {
                '--mood-accent': '#cc3333',
                '--mood-glow': 'rgba(204, 51, 51, 0.2)'
            }
        },
        audio: {
            ambient: null
        },
        transition: {
            duration: 1500,
            easing: 'ease-in'
        }
    },
    'mysterious': {
        name: 'Mysterious',
        description: 'Enigmatic, discovery-oriented',
        visual: {
            bgColor: '#0a1a0a',
            crtIntensity: 0.5,
            cssVars: {
                '--mood-accent': '#33cc66',
                '--mood-glow': 'rgba(51, 204, 102, 0.15)'
            }
        },
        audio: {
            ambient: null
        },
        transition: {
            duration: 2000,
            easing: 'ease-in-out'
        }
    },
    'urgent': {
        name: 'Urgent',
        description: 'Time pressure, fast-paced',
        visual: {
            bgColor: '#1a1000',
            crtIntensity: 0.8,
            cssVars: {
                '--mood-accent': '#ff6600',
                '--mood-glow': 'rgba(255, 102, 0, 0.2)'
            }
        },
        audio: {
            ambient: null
        },
        transition: {
            duration: 500,
            easing: 'ease-out'
        }
    },
    'glitch': {
        name: 'Glitch',
        description: 'System instability, corrupted',
        visual: {
            bgColor: '#000000',
            crtIntensity: 1.0,
            cssVars: {
                '--mood-accent': '#00ff00',
                '--mood-glow': 'rgba(0, 255, 0, 0.3)'
            }
        },
        audio: {
            ambient: null
        },
        transition: {
            duration: 200,
            easing: 'steps(4)'
        }
    }
};

class MoodOrchestrator extends FeatureBase {
    constructor() {
        super({
            id: 'mood-orchestrator',
            name: 'Mood Orchestrator',
            description: 'Manages visual and audio atmosphere for narrative experiences',
            icon: '🎭',
            category: 'enhancement',
            dependencies: [],
            config: {
                enableVisual: true,
                enableAudio: true,
                enableCRT: true
            },
            settings: [
                { key: 'enableVisual', label: 'Enable visual mood changes', type: 'checkbox' },
                { key: 'enableAudio', label: 'Enable ambient audio', type: 'checkbox' },
                { key: 'enableCRT', label: 'Enable CRT intensity changes', type: 'checkbox' }
            ]
        });

        // Custom presets (from campaigns or runtime registration)
        this._customPresets = new Map();

        // Track what was changed so we can revert
        this._originalState = null;
        this._appliedCssVarKeys = new Set();

        // Current transition timer
        this._transitionTimer = null;

        // Active ambient audio
        this._activeAmbient = null;
    }

    async initialize() {
        // Load saved custom presets
        const savedPresets = StorageManager.get('moodPresets');
        if (savedPresets && typeof savedPresets === 'object') {
            for (const [id, preset] of Object.entries(savedPresets)) {
                this._customPresets.set(id, preset);
            }
        }

        // Listen for mood events from NarrativeStateManager
        this.subscribe('story:mood:set', (payload) => {
            this._applyPreset(payload.presetId);
        });

        this.subscribe('story:mood:transition', (payload) => {
            this._handleTransition(payload);
        });

        // Listen for campaign mood preset registration
        this.subscribe('story:campaign:enable', (payload) => {
            this._loadCampaignPresets(payload.campaignId);
        });

        this.log('Initialized with', Object.keys(BUILT_IN_PRESETS).length, 'built-in presets and',
            this._customPresets.size, 'custom presets');
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Register a custom mood preset
     * @param {string} presetId - Preset identifier
     * @param {Object} preset - Preset definition
     */
    registerPreset(presetId, preset) {
        if (!presetId || !preset) return;
        this._customPresets.set(presetId, preset);
        this._saveCustomPresets();
    }

    /**
     * Unregister a custom mood preset
     * @param {string} presetId - Preset identifier
     * @returns {boolean} True if preset existed
     */
    unregisterPreset(presetId) {
        const existed = this._customPresets.delete(presetId);
        if (existed) this._saveCustomPresets();
        return existed;
    }

    /**
     * Get a preset definition
     * @param {string} presetId - Preset identifier
     * @returns {Object|null}
     */
    getPreset(presetId) {
        return this._customPresets.get(presetId) || BUILT_IN_PRESETS[presetId] || null;
    }

    /**
     * List all available preset IDs
     * @returns {string[]}
     */
    listPresets() {
        const ids = new Set([...Object.keys(BUILT_IN_PRESETS), ...this._customPresets.keys()]);
        return [...ids];
    }

    /**
     * Reset to default mood (undo all mood changes)
     */
    resetMood() {
        this._revertToOriginal();
    }

    // ==========================================
    // INTERNAL: PRESET APPLICATION
    // ==========================================

    /**
     * Apply a mood preset
     * @private
     * @param {string} presetId - Preset to apply
     */
    _applyPreset(presetId) {
        // Applying the 'default' preset reverts to original state
        if (presetId === 'default') {
            this._revertToOriginal();
            return;
        }

        const preset = this.getPreset(presetId);
        if (!preset) {
            this.warn(`Mood preset not found: ${presetId}`);
            return;
        }

        // Save original state on first mood change
        if (!this._originalState) {
            this._captureOriginalState();
        }

        // Apply visual changes
        if (this.getConfig('enableVisual', true) && preset.visual) {
            this._applyVisual(preset.visual, preset.transition);
        }

        // Apply audio changes
        if (this.getConfig('enableAudio', true) && preset.audio) {
            this._applyAudio(preset.audio);
        }

        this.log(`Applied mood preset: ${presetId}`);
    }

    /**
     * Apply visual mood changes
     * @private
     * @param {Object} visual - Visual tokens
     * @param {Object} [transition] - Transition options
     */
    _applyVisual(visual, transition = {}) {
        const duration = transition.duration || 500;
        const easing = transition.easing || 'ease-in-out';

        // Background color
        if (visual.bgColor) {
            const desktop = document.getElementById('desktop');
            if (desktop) {
                desktop.style.transition = `background-color ${duration}ms ${easing}`;
                desktop.style.backgroundColor = visual.bgColor;
            }
        }

        // CRT intensity
        if (visual.crtIntensity !== undefined && visual.crtIntensity !== null) {
            if (this.getConfig('enableCRT', true)) {
                document.documentElement.style.setProperty('--crt-intensity', String(visual.crtIntensity));
            }
        }

        // CSS custom properties
        if (visual.cssVars && typeof visual.cssVars === 'object') {
            for (const [prop, value] of Object.entries(visual.cssVars)) {
                // Only allow CSS custom properties (--prefixed)
                if (typeof prop === 'string' && prop.startsWith('--')) {
                    if (this._originalState && !(prop in this._originalState.cssVars)) {
                        this._originalState.cssVars[prop] = document.documentElement.style.getPropertyValue(prop) || null;
                    }
                    this._appliedCssVarKeys.add(prop);
                    document.documentElement.style.setProperty(prop, String(value));
                }
            }
        }
    }

    /**
     * Apply audio mood changes
     * @private
     * @param {Object} audio - Audio tokens
     */
    _applyAudio(audio) {
        // Stop current ambient
        if (this._activeAmbient) {
            EventBus.emit('audio:stop', { src: this._activeAmbient });
            this._activeAmbient = null;
        }

        // Start new ambient loop
        if (audio.ambient) {
            this._activeAmbient = audio.ambient;
            EventBus.emit('audio:play', {
                src: audio.ambient,
                loop: true,
                volume: 0.3
            });
        }

        // Play stinger (one-shot)
        if (audio.stinger) {
            EventBus.emit('audio:play', {
                src: audio.stinger,
                loop: false,
                volume: 0.5
            });
        }
    }

    /**
     * Handle mood transition
     * @private
     * @param {Object} payload - Transition payload
     */
    _handleTransition(payload) {
        const { fromPreset, toPreset, durationMs } = payload;

        // Clear any existing transition
        if (this._transitionTimer) {
            clearTimeout(this._transitionTimer);
        }

        // Apply intermediate visual state with longer transition duration
        const toPresetDef = this.getPreset(toPreset);
        if (toPresetDef && toPresetDef.visual) {
            this._applyVisual(toPresetDef.visual, { duration: durationMs, easing: 'ease-in-out' });
        }

        // Apply audio at midpoint
        this._transitionTimer = setTimeout(() => {
            if (toPresetDef && toPresetDef.audio) {
                this._applyAudio(toPresetDef.audio);
            }
            this._transitionTimer = null;
        }, durationMs / 2);
    }

    /**
     * Capture original visual state for reverting
     * @private
     */
    _captureOriginalState() {
        const desktop = document.getElementById('desktop');
        this._originalState = {
            bgColor: desktop ? desktop.style.backgroundColor : null,
            crtIntensity: document.documentElement.style.getPropertyValue('--crt-intensity') || null,
            cssVars: {}
        };
    }

    /**
     * Revert to original visual state
     * @private
     */
    _revertToOriginal() {
        if (!this._originalState) return;

        const desktop = document.getElementById('desktop');
        if (desktop && this._originalState.bgColor !== null) {
            desktop.style.transition = 'background-color 500ms ease-in-out';
            desktop.style.backgroundColor = this._originalState.bgColor;
        }

        if (this._originalState.crtIntensity !== null) {
            document.documentElement.style.setProperty('--crt-intensity', this._originalState.crtIntensity);
        }

        // Restore custom CSS variables touched by mood presets
        for (const prop of this._appliedCssVarKeys) {
            const originalValue = this._originalState.cssVars[prop];
            if (originalValue === null || originalValue === undefined || originalValue === '') {
                document.documentElement.style.removeProperty(prop);
            } else {
                document.documentElement.style.setProperty(prop, originalValue);
            }
        }
        this._appliedCssVarKeys.clear();

        // Stop ambient audio
        if (this._activeAmbient) {
            EventBus.emit('audio:stop', { src: this._activeAmbient });
            this._activeAmbient = null;
        }

        // Clear transition timer
        if (this._transitionTimer) {
            clearTimeout(this._transitionTimer);
            this._transitionTimer = null;
        }

        this._originalState = null;
        this.log('Reverted to original mood');
    }

    /**
     * Load mood presets from a campaign
     * @private
     * @param {string} campaignId
     */
    _loadCampaignPresets(campaignId) {
        // Campaign presets are loaded via the CampaignManager
        // This is a stub for future integration when CampaignManager
        // exposes mood data through events
        this.log(`Ready to load presets from campaign: ${campaignId}`);
    }

    /**
     * Save custom presets to storage
     * @private
     */
    _saveCustomPresets() {
        const data = {};
        for (const [id, preset] of this._customPresets) {
            data[id] = preset;
        }
        StorageManager.set('moodPresets', data);
    }

    cleanup() {
        // Revert any mood changes before cleanup
        this._revertToOriginal();
        super.cleanup();
    }
}

// Export singleton instance
const moodOrchestrator = new MoodOrchestrator();

if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.moodOrchestrator = moodOrchestrator;
}

export default moodOrchestrator;
