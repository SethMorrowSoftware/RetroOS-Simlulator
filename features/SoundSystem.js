/**
 * SoundSystem - Centralized audio management with MP3 support
 * Supports both synthesized sounds and MP3 file playback
 *
 * Features:
 * - Play MP3 files from URLs or local paths
 * - Fallback to synthesized sounds when MP3s unavailable
 * - Volume control
 * - Sound caching for performance
 * - Multiple simultaneous sounds
 *
 * Now extends FeatureBase for integration with FeatureRegistry
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';

// Feature metadata
const FEATURE_METADATA = {
    id: 'soundsystem',
    name: 'Sound System',
    description: 'Centralized audio management with MP3 support and synthesized fallbacks',
    icon: '🔊',
    category: 'core',
    dependencies: [],
    config: {
        masterVolume: 0.5,
        enableMp3: true,
        enableFallbacks: true
    },
    settings: [
        {
            key: 'masterVolume',
            label: 'Master Volume',
            type: 'slider',
            min: 0,
            max: 1,
            step: 0.1
        },
        {
            key: 'enableMp3',
            label: 'Enable MP3 Sounds',
            type: 'checkbox'
        },
        {
            key: 'enableFallbacks',
            label: 'Enable Synthesized Fallbacks',
            type: 'checkbox'
        }
    ]
};

class SoundSystem extends FeatureBase {
    constructor() {
        super(FEATURE_METADATA);

        this.audioContext = null;
        this.masterGain = null;
        this.audioCache = new Map(); // Cache loaded audio buffers
        this.activeAudioElements = new Set(); // Track playing HTML5 Audio elements
        this.volume = 0.5; // Default volume (0-1)

        // Sound configuration - maps sound types to MP3 paths
        // Sounds can be placed in assets/sounds/ or loaded from URLs
        this.soundConfig = {
            // System sounds
            startup: { mp3: 'assets/sounds/startup.mp3', fallback: 'synth' },
            shutdown: { mp3: 'assets/sounds/shutdown.mp3', fallback: 'synth' },
            click: { mp3: 'assets/sounds/click.mp3', fallback: 'synth' },
            open: { mp3: 'assets/sounds/open.mp3', fallback: 'synth' },
            close: { mp3: 'assets/sounds/close.mp3', fallback: 'synth' },
            error: { mp3: 'assets/sounds/error.mp3', fallback: 'synth' },
            notify: { mp3: 'assets/sounds/notify.mp3', fallback: 'synth' },
            achievement: { mp3: 'assets/sounds/achievement.mp3', fallback: 'synth' },
            restore: { mp3: 'assets/sounds/restore.mp3', fallback: 'synth' },
            minimize: { mp3: 'assets/sounds/minimize.mp3', fallback: 'synth' },
            maximize: { mp3: 'assets/sounds/maximize.mp3', fallback: 'synth' },

            // UI sounds
            menuOpen: { mp3: 'assets/sounds/menu-open.mp3', fallback: 'synth' },
            menuClose: { mp3: 'assets/sounds/menu-close.mp3', fallback: 'synth' },
            hover: { mp3: 'assets/sounds/hover.mp3', fallback: 'synth' },

            // Game sounds
            gameStart: { mp3: 'assets/sounds/game-start.mp3', fallback: 'synth' },
            gameOver: { mp3: 'assets/sounds/game-over.mp3', fallback: 'synth' },
            levelUp: { mp3: 'assets/sounds/level-up.mp3', fallback: 'synth' },
            collect: { mp3: 'assets/sounds/collect.mp3', fallback: 'synth' },
            hit: { mp3: 'assets/sounds/hit.mp3', fallback: 'synth' },
            explosion: { mp3: 'assets/sounds/explosion.mp3', fallback: 'synth' },
            laser: { mp3: 'assets/sounds/laser.mp3', fallback: 'synth' },

            // Special sounds
            dialup: { mp3: 'assets/sounds/dialup.mp3', fallback: null },
            typewriter: { mp3: 'assets/sounds/typewriter.mp3', fallback: 'synth' },
            floppy: { mp3: 'assets/sounds/floppy.mp3', fallback: null },

            // Easter egg sounds
            secret: { mp3: 'assets/sounds/secret.mp3', fallback: 'synth' },
            tada: { mp3: 'assets/sounds/tada.mp3', fallback: 'synth' }
        };

        // Track which MP3s are available (determined on first play attempt)
        this.mp3Available = new Map();
    }

    /**
     * Initialize the sound system
     */
    async initialize() {
        if (!this.isEnabled()) return;

        // Listen for sound play requests
        this.subscribe(Events.SOUND_PLAY, ({ type, force, volume, loop }) => {
            this.play(type, force, volume, loop);
        });

        // Listen for MP3 file playback requests
        this.subscribe(Events.AUDIO_PLAY, (data) => {
            this.playAudio(data.src, data);
        });

        // Listen for audio stop requests
        this.subscribe(Events.AUDIO_STOP, ({ src }) => {
            this.stopAudio(src);
        });

        // Listen for audio stop all requests
        this.subscribe(Events.AUDIO_STOP_ALL, () => {
            this.stopAllAudio();
        });

        // Listen for audio pause requests
        this.subscribe(Events.AUDIO_PAUSE, ({ src }) => {
            if (src) {
                const audio = this.getAudio(src);
                if (audio) audio.pause();
            } else {
                this.pauseAllAudio();
            }
        });

        // Listen for audio resume requests
        this.subscribe(Events.AUDIO_RESUME, ({ src }) => {
            if (src) {
                const audio = this.getAudio(src);
                if (audio) audio.play().catch(() => {});
            } else {
                this.resumeAllAudio();
            }
        });

        // Listen for volume change requests from scripts
        this.subscribe('sound:setVolume', ({ volume }) => {
            if (volume !== undefined) {
                this.setVolume(Number(volume));
            }
        });

        // Load volume from feature config as default, then override with user's saved preference
        const configVolume = this.getConfig('masterVolume');
        if (configVolume !== undefined) {
            this.volume = configVolume;
        }

        // User's saved preference takes priority over config defaults
        const savedVolume = StateManager.getState('settings.volume');
        if (savedVolume !== undefined) {
            this.volume = savedVolume;
        }

        // Allow admins to override sound->mp3 mappings from config.
        // Expected shape:
        // features.soundsystem.config.soundOverrides = {
        //   click: "https://.../click.mp3",
        //   startup: "https://.../startup.mp3"
        // }
        const overrides = this.getConfig('soundOverrides') || {};
        if (overrides && typeof overrides === 'object') {
            Object.entries(overrides).forEach(([type, src]) => {
                if (this.soundConfig[type] && typeof src === 'string' && src.trim()) {
                    this.soundConfig[type] = {
                        ...this.soundConfig[type],
                        mp3: src.trim()
                    };
                }
            });
        }

        this.log('Initialized with MP3 support');
    }

    /**
     * Cleanup resources when disabled
     */
    cleanup() {
        // Stop all audio
        this.stopAllAudio();

        // Close audio context
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
            this.masterGain = null;
        }

        // Call parent cleanup for event handlers
        super.cleanup();
    }

    /**
     * Initialize the Web Audio API context
     */
    initContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = this.volume;
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        return this.audioContext;
    }

    /**
     * Set master volume
     * @param {number} volume - Volume level (0-1)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.value = this.volume;
        }
        // Update all active audio elements
        this.activeAudioElements.forEach(audio => {
            audio.volume = this.volume;
        });
        StateManager.setState('settings.volume', this.volume, true);
        this.setConfig('masterVolume', this.volume);
        EventBus.emit(Events.VOLUME_CHANGE, { volume: this.volume });

        // Trigger hook for volume change
        this.triggerHook('volume:changed', { volume: this.volume });
    }

    /**
     * Get current volume
     * @returns {number} Current volume (0-1)
     */
    getVolume() {
        return this.volume;
    }

    /**
     * Play a sound by type (either MP3 or synthesized)
     * @param {string} type - Sound type from soundConfig
     * @param {boolean} force - Play even if sound is disabled
     * @param {number} volume - Optional volume override (0-1)
     * @param {boolean} loop - Whether to loop the sound
     */
    async play(type, force = false, volume = null, loop = false) {
        if (!this.isEnabled() && !force) return;

        const enabled = force || StateManager.getState('settings.sound');
        if (!enabled) return;

        const config = this.soundConfig[type];

        // If no config, try to play as synthesized sound
        if (!config) {
            if (this.getConfig('enableFallbacks', true)) {
                this.playSynthesized(type);
            }
            return;
        }

        // Try to play MP3 first if available and enabled
        if (config.mp3 && this.getConfig('enableMp3', true)) {
            const mp3Played = await this.tryPlayMp3(config.mp3, volume, loop);
            if (mp3Played) return;
        }

        // Fall back to synthesized sound
        if (config.fallback === 'synth' && this.getConfig('enableFallbacks', true)) {
            this.playSynthesized(type);
        }
    }

    /**
     * Try to play an MP3 file
     * @param {string} src - Path or URL to MP3
     * @param {number} volume - Volume override
     * @param {boolean} loop - Whether to loop
     * @returns {boolean} True if playback started successfully
     */
    async tryPlayMp3(src, volume = null, loop = false) {
        try {
            // Check cache for availability
            if (this.mp3Available.has(src) && !this.mp3Available.get(src)) {
                return false;
            }

            const audio = new Audio(src);
            audio.volume = volume !== null ? volume : this.volume;
            audio.loop = loop;

            // Track this audio element
            this.activeAudioElements.add(audio);

            // Clean up when done
            audio.addEventListener('ended', () => {
                this.activeAudioElements.delete(audio);
            });

            audio.addEventListener('error', () => {
                this.mp3Available.set(src, false);
                this.activeAudioElements.delete(audio);
            });

            await audio.play();
            this.mp3Available.set(src, true);
            return true;
        } catch (e) {
            this.mp3Available.set(src, false);
            return false;
        }
    }

    /**
     * Play an audio file directly (for MediaPlayer, etc.)
     * @param {string} src - Path or URL to audio file
     * @param {Object} options - Playback options
     * @returns {HTMLAudioElement|null} The audio element or null if failed
     */
    playAudio(src, options = {}) {
        if (!this.isEnabled() && !options.force) return null;

        const enabled = options.force || StateManager.getState('settings.sound');
        if (!enabled && !options.force) return null;

        try {
            const audio = new Audio(src);
            audio.volume = options.volume !== undefined ? options.volume : this.volume;
            audio.loop = options.loop || false;
            audio.currentTime = options.startTime || 0;

            // Store reference with src for later control
            audio._src = src;
            this.activeAudioElements.add(audio);

            audio.addEventListener('ended', () => {
                this.activeAudioElements.delete(audio);
                if (options.onEnded) options.onEnded();
                EventBus.emit(Events.AUDIO_ENDED, { src });
            });

            audio.addEventListener('error', (e) => {
                this.activeAudioElements.delete(audio);
                if (options.onError) options.onError(e);
                EventBus.emit(Events.AUDIO_ERROR, { src, error: e });
            });

            audio.addEventListener('timeupdate', () => {
                if (options.onTimeUpdate) {
                    options.onTimeUpdate({
                        currentTime: audio.currentTime,
                        duration: audio.duration
                    });
                }
            });

            audio.addEventListener('loadedmetadata', () => {
                if (options.onLoaded) {
                    options.onLoaded({
                        duration: audio.duration
                    });
                }
                EventBus.emit(Events.AUDIO_LOADED, { src, duration: audio.duration });
            });

            audio.play().catch(e => {
                this.warn('Audio playback failed:', e);
                this.activeAudioElements.delete(audio);
            });

            return audio;
        } catch (e) {
            this.warn('Failed to create audio:', e);
            return null;
        }
    }

    /**
     * Stop audio by source
     * @param {string} src - Source of audio to stop
     */
    stopAudio(src) {
        this.activeAudioElements.forEach(audio => {
            if (audio._src === src || audio.src === src || audio.src.endsWith(src)) {
                audio.pause();
                audio.currentTime = 0;
                this.activeAudioElements.delete(audio);
            }
        });
    }

    /**
     * Stop all currently playing audio
     */
    stopAllAudio() {
        this.activeAudioElements.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        this.activeAudioElements.clear();
    }

    /**
     * Pause all audio
     */
    pauseAllAudio() {
        this.activeAudioElements.forEach(audio => {
            audio.pause();
        });
    }

    /**
     * Resume all paused audio
     */
    resumeAllAudio() {
        this.activeAudioElements.forEach(audio => {
            audio.play().catch(() => {});
        });
    }

    /**
     * Get currently playing audio element by source
     * @param {string} src - Source to find
     * @returns {HTMLAudioElement|null}
     */
    getAudio(src) {
        for (const audio of this.activeAudioElements) {
            if (audio._src === src || audio.src === src || audio.src.endsWith(src)) {
                return audio;
            }
        }
        return null;
    }

    /**
     * Check if any audio is currently playing
     * @returns {boolean}
     */
    isPlaying() {
        for (const audio of this.activeAudioElements) {
            if (!audio.paused) return true;
        }
        return false;
    }

    /**
     * Load and cache an audio file using Web Audio API (for low-latency playback)
     * @param {string} src - Path to audio file
     * @returns {Promise<AudioBuffer>}
     */
    async loadAudioBuffer(src) {
        if (this.audioCache.has(src)) {
            return this.audioCache.get(src);
        }

        try {
            const ctx = this.initContext();
            const response = await fetch(src);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            this.audioCache.set(src, audioBuffer);
            return audioBuffer;
        } catch (e) {
            this.warn('Failed to load audio buffer:', src, e);
            return null;
        }
    }

    /**
     * Play a cached audio buffer (low-latency, good for game sounds)
     * @param {string} src - Path to cached audio
     * @param {Object} options - Playback options
     */
    async playBuffer(src, options = {}) {
        if (!this.isEnabled() && !options.force) return;

        const enabled = options.force || StateManager.getState('settings.sound');
        if (!enabled) return;

        try {
            let buffer = this.audioCache.get(src);
            if (!buffer) {
                buffer = await this.loadAudioBuffer(src);
                if (!buffer) return;
            }

            const ctx = this.initContext();
            const source = ctx.createBufferSource();
            const gainNode = ctx.createGain();

            source.buffer = buffer;
            source.loop = options.loop || false;
            gainNode.gain.value = options.volume !== undefined ? options.volume : 1;

            source.connect(gainNode);
            gainNode.connect(this.masterGain);

            source.start(0, options.startTime || 0);

            return source;
        } catch (e) {
            this.warn('Failed to play buffer:', e);
        }
    }

    /**
     * Play synthesized sound (fallback when MP3 not available)
     * @param {string} type - Sound type
     */
    playSynthesized(type) {
        try {
            const ctx = this.initContext();
            const gainNode = ctx.createGain();
            gainNode.connect(this.masterGain);

            switch (type) {
                case 'click':
                case 'hover':
                    this.synthClick(ctx, gainNode);
                    break;
                case 'open':
                case 'menuOpen':
                    this.synthOpen(ctx, gainNode);
                    break;
                case 'close':
                case 'menuClose':
                    this.synthClose(ctx, gainNode);
                    break;
                case 'error':
                    this.synthError(ctx, gainNode);
                    break;
                case 'startup':
                case 'achievement':
                case 'tada':
                case 'secret':
                    this.synthStartup(ctx, gainNode);
                    break;
                case 'restore':
                case 'maximize':
                    this.synthRestore(ctx, gainNode);
                    break;
                case 'minimize':
                    this.synthMinimize(ctx, gainNode);
                    break;
                case 'notify':
                    this.synthNotify(ctx, gainNode);
                    break;
                case 'gameStart':
                case 'levelUp':
                    this.synthLevelUp(ctx, gainNode);
                    break;
                case 'gameOver':
                    this.synthGameOver(ctx, gainNode);
                    break;
                case 'collect':
                    this.synthCollect(ctx, gainNode);
                    break;
                case 'hit':
                case 'explosion':
                    this.synthExplosion(ctx, gainNode);
                    break;
                case 'laser':
                    this.synthLaser(ctx, gainNode);
                    break;
                case 'typewriter':
                    this.synthTypewriter(ctx, gainNode);
                    break;
                case 'shutdown':
                    this.synthShutdown(ctx, gainNode);
                    break;
                default:
                    this.synthClick(ctx, gainNode);
            }
        } catch (e) {
            this.warn('Synthesized playback failed:', e);
        }
    }

    // ===== Synthesized Sound Generators =====

    synthClick(ctx, gain) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.value = 800;
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    }

    synthOpen(ctx, gain) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.1);
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    }

    synthClose(ctx, gain) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.1);
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    }

    synthError(ctx, gain) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = 'square';
        osc.frequency.value = 200;
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    }

    synthStartup(ctx, gain) {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = ctx.createOscillator();
                const noteGain = ctx.createGain();
                osc.connect(noteGain);
                noteGain.connect(gain);
                osc.frequency.value = freq;
                noteGain.gain.value = 0.1;
                noteGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
            }, i * 150);
        });
    }

    synthShutdown(ctx, gain) {
        const notes = [1046.50, 783.99, 659.25, 523.25];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = ctx.createOscillator();
                const noteGain = ctx.createGain();
                osc.connect(noteGain);
                noteGain.connect(gain);
                osc.frequency.value = freq;
                noteGain.gain.value = 0.1;
                noteGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
            }, i * 150);
        });
    }

    synthRestore(ctx, gain) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.08);
        osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.12);
        gain.gain.value = 0.12;
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    }

    synthMinimize(ctx, gain) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.08);
        osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.12);
        gain.gain.value = 0.1;
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    }

    synthNotify(ctx, gain) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        gain.gain.value = 0.08;
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    }

    synthLevelUp(ctx, gain) {
        const notes = [392, 523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = ctx.createOscillator();
                const noteGain = ctx.createGain();
                osc.connect(noteGain);
                noteGain.connect(gain);
                osc.frequency.value = freq;
                noteGain.gain.value = 0.1;
                noteGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                osc.start();
                osc.stop(ctx.currentTime + 0.15);
            }, i * 80);
        });
    }

    synthGameOver(ctx, gain) {
        const notes = [392, 349.23, 311.13, 261.63];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = ctx.createOscillator();
                const noteGain = ctx.createGain();
                osc.connect(noteGain);
                noteGain.connect(gain);
                osc.type = 'sawtooth';
                osc.frequency.value = freq;
                noteGain.gain.value = 0.08;
                noteGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
            }, i * 200);
        });
    }

    synthCollect(ctx, gain) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.05);
        gain.gain.value = 0.1;
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    }

    synthExplosion(ctx, gain) {
        const noise = ctx.createBufferSource();
        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);

        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

        noise.start();
        noise.stop(ctx.currentTime + 0.3);
    }

    synthLaser(ctx, gain) {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
        gain.gain.value = 0.08;
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    }

    synthTypewriter(ctx, gain) {
        const noise = ctx.createBufferSource();
        const bufferSize = ctx.sampleRate * 0.02;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;

        noise.connect(filter);
        filter.connect(gain);
        gain.gain.value = 0.05;

        noise.start();
        noise.stop(ctx.currentTime + 0.02);
    }

    /**
     * Register a custom sound type
     * @param {string} type - Sound type name
     * @param {Object} config - Configuration { mp3: 'path', fallback: 'synth'|null }
     */
    registerSound(type, config) {
        this.soundConfig[type] = config;
        this.triggerHook('sound:registered', { type, config });
    }

    /**
     * Preload sounds for faster playback
     * @param {string[]} types - Array of sound types to preload
     */
    async preloadSounds(types) {
        const promises = types.map(type => {
            const config = this.soundConfig[type];
            if (config && config.mp3) {
                return this.loadAudioBuffer(config.mp3).catch(() => null);
            }
            return Promise.resolve(null);
        });
        await Promise.all(promises);
    }

    /**
     * Get list of available sound types
     * @returns {string[]}
     */
    getSoundTypes() {
        return Object.keys(this.soundConfig);
    }
}

// Create and export singleton instance
const SoundSystemInstance = new SoundSystem();
export default SoundSystemInstance;
