/**
 * Screensaver - Multiple screensaver types
 * Now extends FeatureBase for integration with FeatureRegistry
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import StorageManager from '../core/StorageManager.js';
import { getConfig } from '../core/ConfigLoader.js';
import { escapeHtml } from '../core/Sanitize.js';

// Feature metadata
const FEATURE_METADATA = {
    id: 'screensaver',
    name: 'Screensaver',
    description: 'Idle screensaver with multiple modes - flying toasters, starfield, marquee',
    icon: '🌌',
    category: 'core',
    dependencies: [],
    config: {
        idleTimeout: 300000,
        mode: 'toasters'
    },
    settings: [
        {
            key: 'enabled',
            label: 'Enable Screensaver',
            type: 'checkbox'
        },
        {
            key: 'idleTimeout',
            label: 'Idle Time (seconds)',
            type: 'number',
            min: 60,
            max: 3600,
            step: 30,
            transform: 'milliseconds'
        },
        {
            key: 'mode',
            label: 'Screensaver Mode',
            type: 'select',
            options: ['toasters', 'starfield', 'marquee', 'none']
        }
    ]
};

// Screensaver configurations
const SCREENSAVER_CONFIGS = {
    toasters: {
        items: ['🍞', '🥪', '🐕', '☕', '🎸', '📎'],
        animation: 'toaster-fly',
        count: 10
    },
    starfield: {
        items: ['✦', '✧', '★', '☆', '⋆', '·'],
        animation: 'star-twinkle',
        count: 50
    },
    marquee: {
        get text() { return getConfig('branding.screensaverText', 'IlluminatOS! - The Nostalgia Machine'); },
        animation: 'marquee-scroll'
    },
    none: null
};

class Screensaver extends FeatureBase {
    constructor() {
        super(FEATURE_METADATA);

        this.timeout = null;
        this.delay = 300000; // 5 minutes
        this.isActive = false;
        this.type = 'toasters';
        this.animationFrame = null;

        // Bound handlers for proper cleanup
        this.boundReset = this.reset.bind(this);
        this.boundHide = this.hide.bind(this);
    }

    /**
     * Initialize the screensaver
     */
    async initialize() {
        if (!this.isEnabled()) return;

        const screensaver = document.getElementById('screensaver');
        if (!screensaver) return;

        // Load type: user-saved preference takes priority over config default
        const configMode = this.getConfig('mode');
        this.type = StorageManager.get('screensaverType') || configMode || 'toasters';

        // Load delay: user-saved preference takes priority over config default
        const savedDelay = StateManager.getState('settings.screensaverDelay');
        const configDelay = this.getConfig('idleTimeout');
        if (savedDelay) {
            this.delay = savedDelay;
        } else if (configDelay) {
            this.delay = configDelay;
        }

        // Activity listeners - using bound handlers for cleanup capability
        this.addHandler(document, 'mousemove', this.boundReset);
        this.addHandler(document, 'keydown', this.boundReset);
        this.addHandler(document, 'click', this.boundReset);

        // Click/move to dismiss
        this.addHandler(screensaver, 'click', this.boundHide);
        this.addHandler(screensaver, 'mousemove', this.boundHide);

        // Listen for type updates from Display Properties
        this.subscribe('screensaver:update-type', ({ type }) => {
            this.type = type;
            this.setConfig('mode', type);
        });

        // Listen for delay updates
        this.subscribe('screensaver:update-delay', ({ delay }) => {
            this.delay = delay;
            this.setConfig('idleTimeout', delay);
            this.reset();
        });

        // Listen for manual start
        this.subscribe('screensaver:start', () => {
            this.show();
        });

        // Start timer
        this.reset();

        this.log('Initialized with type:', this.type);
    }

    /**
     * Cleanup all event listeners
     */
    cleanup() {
        // Clear timeout
        clearTimeout(this.timeout);
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        // Hide if active
        if (this.isActive) {
            this.hide();
        }

        // Call parent cleanup
        super.cleanup();
    }

    reset() {
        if (this.isActive) {
            this.hide();
        }

        clearTimeout(this.timeout);

        // Don't start timer if type is 'none' or delay is very high
        if (this.type === 'none' || this.delay >= 9999999) {
            return;
        }

        this.timeout = setTimeout(() => this.show(), this.delay);
    }

    show() {
        if (!this.isEnabled()) return;

        // Don't show if type is none
        if (this.type === 'none') return;

        const screensaver = document.getElementById('screensaver');
        const container = document.getElementById('flyingToasters');
        if (!screensaver || !container) return;

        // Clear previous content
        container.innerHTML = '';

        const config = SCREENSAVER_CONFIGS[this.type];
        if (!config) return;

        // Render based on type
        if (this.type === 'toasters') {
            this.renderToasters(container, config);
        } else if (this.type === 'starfield') {
            this.renderStarfield(container, config);
        } else if (this.type === 'marquee') {
            this.renderMarquee(container, config);
        }

        screensaver.classList.add('active');
        this.isActive = true;
        EventBus.emit(Events.SCREENSAVER_START);

        // Trigger hook
        this.triggerHook('screensaver:started', { type: this.type });
    }

    renderToasters(container, config) {
        for (let i = 0; i < config.count; i++) {
            const toaster = document.createElement('div');
            toaster.className = 'toaster';
            toaster.textContent = config.items[Math.floor(Math.random() * config.items.length)];
            toaster.style.left = Math.random() * 100 + 'vw';
            toaster.style.animationDelay = Math.random() * 5 + 's';
            toaster.style.animationDuration = (8 + Math.random() * 5) + 's';
            container.appendChild(toaster);
        }
    }

    renderStarfield(container, config) {
        // Add starfield CSS class to container
        container.classList.add('starfield-mode');

        for (let i = 0; i < config.count; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.textContent = config.items[Math.floor(Math.random() * config.items.length)];
            star.style.left = Math.random() * 100 + 'vw';
            star.style.top = Math.random() * 100 + 'vh';
            star.style.animationDelay = Math.random() * 3 + 's';
            star.style.animationDuration = (1 + Math.random() * 2) + 's';
            star.style.fontSize = (10 + Math.random() * 20) + 'px';
            container.appendChild(star);
        }
    }

    renderMarquee(container, config) {
        container.classList.add('marquee-mode');

        const marquee = document.createElement('div');
        marquee.className = 'marquee-text';
        marquee.textContent = config.text;
        container.appendChild(marquee);
    }

    hide() {
        if (!this.isActive) return;

        const screensaver = document.getElementById('screensaver');
        const container = document.getElementById('flyingToasters');

        if (screensaver) {
            screensaver.classList.remove('active');
        }

        if (container) {
            container.classList.remove('starfield-mode', 'marquee-mode');
        }

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        this.isActive = false;
        EventBus.emit(Events.SCREENSAVER_END);

        // Trigger hook
        this.triggerHook('screensaver:stopped', {});
    }

    setDelay(ms) {
        this.delay = ms;
        this.setConfig('idleTimeout', ms);
        this.reset();
    }

    setType(type) {
        this.type = type;
        this.setConfig('mode', type);
    }

    /**
     * Get available screensaver modes
     * @returns {string[]}
     */
    getModes() {
        return Object.keys(SCREENSAVER_CONFIGS);
    }

    /**
     * Get current screensaver state
     * @returns {Object}
     */
    getState() {
        return {
            type: this.type,
            delay: this.delay,
            isActive: this.isActive
        };
    }
}

// Create and export singleton instance
const ScreensaverInstance = new Screensaver();
export default ScreensaverInstance;
