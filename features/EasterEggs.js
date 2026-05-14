/**
 * EasterEggs - Hidden features and surprises
 * Now extends FeatureBase for integration with FeatureRegistry
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import { getConfig } from '../core/ConfigLoader.js';
import { escapeHtml } from '../core/Sanitize.js';

// Feature metadata
const FEATURE_METADATA = {
    id: 'eastereggs',
    name: 'Easter Eggs',
    description: 'Hidden surprises and secrets - Konami code, cheat codes, and more',
    icon: '🥚',
    category: 'enhancement',
    dependencies: ['achievements'],
    config: {
        enableKonami: true,
        enableCheats: true,
        enableSecrets: true
    },
    settings: [
        {
            key: 'enableKonami',
            label: 'Enable Konami Code',
            type: 'checkbox'
        },
        {
            key: 'enableCheats',
            label: 'Enable Cheat Codes',
            type: 'checkbox'
        },
        {
            key: 'enableSecrets',
            label: 'Enable Secret Features',
            type: 'checkbox'
        }
    ]
};

class EasterEggs extends FeatureBase {
    constructor() {
        super(FEATURE_METADATA);

        this.konamiCode = [];
        this.konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
        this.typedChars = [];
        this.activeEffects = new Set();
    }

    /**
     * Initialize easter eggs
     */
    async initialize() {
        if (!this.isEnabled()) return;

        // Add keydown handler for cheat codes
        this.addHandler(document, 'keydown', (e) => this.handleKeydown(e));

        this.log('Initialized');
    }

    /**
     * Cleanup when disabled
     */
    cleanup() {
        // Remove any active effects
        this.activeEffects.forEach(element => {
            element.remove();
        });
        this.activeEffects.clear();

        // Remove disco mode if active
        document.body.classList.remove('disco-mode');

        super.cleanup();
    }

    /**
     * Handle keydown events for cheat codes
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeydown(e) {
        if (!this.isEnabled()) return;

        // Konami code detection
        if (this.getConfig('enableKonami', true)) {
            this.konamiCode.push(e.key);
            if (this.konamiCode.length > 10) this.konamiCode.shift();

            if (this.konamiCode.join(',') === this.konamiSequence.join(',')) {
                this.triggerKonami();
                this.konamiCode = [];
            }
        }

        // Cheat code detection
        if (this.getConfig('enableCheats', true)) {
            this.typedChars.push(e.key);
            if (this.typedChars.length > 10) this.typedChars.shift();

            // Rosebud cheat
            if (this.typedChars.slice(-7).join('') === 'rosebud') {
                this.triggerRosebud();
                this.typedChars = [];
            }

            // Matrix mode cheat
            if (this.typedChars.slice(-6).join('') === 'matrix') {
                this.triggerMatrix();
                this.typedChars = [];
            }

            // Disco mode cheat
            if (this.typedChars.slice(-5).join('') === 'disco') {
                this.triggerDisco();
                this.typedChars = [];
            }

            // Custom registered cheats
            if (this._customCheats) {
                const typed = this.typedChars.join('');
                for (const [code, callback] of this._customCheats) {
                    if (typed.endsWith(code)) {
                        callback();
                        this.typedChars = [];
                        break;
                    }
                }
            }
        }
    }

    /**
     * Trigger Konami code celebration
     */
    triggerKonami() {
        // Celebration
        for (let i = 0; i < 50; i++) {
            setTimeout(() => {
                const emoji = document.createElement('div');
                emoji.className = 'celebration';
                emoji.textContent = ['🎉', '🎀', '⭐', '🌟', '💫', '✨'][Math.floor(Math.random() * 6)];
                emoji.style.left = Math.random() * 100 + 'vw';
                emoji.style.animationDelay = Math.random() * 0.5 + 's';
                document.body.appendChild(emoji);
                this.activeEffects.add(emoji);
                setTimeout(() => {
                    emoji.remove();
                    this.activeEffects.delete(emoji);
                }, 2000);
            }, i * 50);
        }

        StateManager.unlockAchievement('konami_master');
        EventBus.emit(Events.SOUND_PLAY, { type: 'startup' });

        // Enable pet
        EventBus.emit(Events.PET_TOGGLE, { enabled: true });

        // Show secret message
        const konamiTitle = getConfig('easterEggs.konamiTitle', 'SECRET UNLOCKED!');
        const konamiUnlocksRaw = getConfig('easterEggs.konamiUnlocks', [
            '🎨 Disco Mode (Terminal)',
            '🐕 Desktop Pet',
            '🌧️ Matrix Mode (Terminal)'
        ]);
        const konamiUnlocks = Array.isArray(konamiUnlocksRaw)
            ? konamiUnlocksRaw.filter(item => typeof item === 'string' && item.trim())
            : [];
        const konamiButton = getConfig('easterEggs.konamiButtonText', 'Awesome!');
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay active';
        overlay.innerHTML = `
            <div class="dialog-box" style="max-width:400px;">
                <div style="text-align:center;">
                    <h2>🎮 ${escapeHtml(konamiTitle)} 🎮</h2>
                    <p>⬆️ ⬆️ ⬇️ ⬇️ ⬅️ ➡️ ⬅️ ➡️ B A</p>
                    <br>
                    <p>You unlocked:</p>
                    <ul style="text-align:left;">
                        ${konamiUnlocks.map(item => `<li>${escapeHtml(item)}</li>`).join('\n                        ')}
                    </ul>
                </div>
                <button class="btn btn-primary" style="width:100%;margin-top:15px;">${escapeHtml(konamiButton)}</button>
            </div>
        `;
        document.body.appendChild(overlay);
        this.activeEffects.add(overlay);
        overlay.querySelector('button').onclick = () => {
            overlay.remove();
            this.activeEffects.delete(overlay);
        };

        // Trigger hook
        this.triggerHook('easter-egg:konami', {});
    }

    /**
     * Trigger rosebud admin cheat
     */
    triggerRosebud() {
        StateManager.setState('user.isAdmin', true);
        StateManager.unlockAchievement('secret_admin');

        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay active';
        overlay.innerHTML = `
            <div class="dialog-box">
                <div class="dialog-icon">🌹</div>
                <div class="dialog-text">Admin access granted via rosebud cheat!</div>
                <button class="btn btn-primary">OK</button>
            </div>
        `;
        document.body.appendChild(overlay);
        this.activeEffects.add(overlay);
        overlay.querySelector('button').onclick = () => {
            overlay.remove();
            this.activeEffects.delete(overlay);
        };

        EventBus.emit(Events.SOUND_PLAY, { type: 'startup' });

        // Trigger hook
        this.triggerHook('easter-egg:rosebud', {});
    }

    /**
     * Trigger BSOD easter egg
     */
    triggerBSOD() {
        if (!this.getConfig('enableSecrets', true)) return;

        const bsod = document.getElementById('bsod');
        if (bsod) {
            bsod.classList.add('active');
            StateManager.unlockAchievement('bsod_master');
        }

        // Trigger hook
        this.triggerHook('easter-egg:bsod', {});
    }

    /**
     * Trigger disco mode
     */
    triggerDisco() {
        if (!this.getConfig('enableSecrets', true)) return;

        document.body.classList.add('disco-mode');
        StateManager.unlockAchievement('disco_fever');
        EventBus.emit(Events.SOUND_PLAY, { type: 'secret' });

        setTimeout(() => {
            document.body.classList.remove('disco-mode');
        }, 10000);

        // Trigger hook
        this.triggerHook('easter-egg:disco', {});
    }

    /**
     * Trigger matrix mode
     */
    triggerMatrix() {
        if (!this.getConfig('enableSecrets', true)) return;

        StateManager.unlockAchievement('matrix_mode');
        EventBus.emit(Events.SOUND_PLAY, { type: 'secret' });
        EventBus.emit('terminal:matrix', {});

        // Trigger hook
        this.triggerHook('easter-egg:matrix', {});
    }

    /**
     * Register a custom easter egg
     * @param {string} code - The code to type
     * @param {Function} callback - Function to call when code is entered
     */
    registerCheat(code, callback) {
        // Store custom cheat codes
        if (!this._customCheats) {
            this._customCheats = new Map();
        }
        this._customCheats.set(code, callback);
    }

    /**
     * Get list of available easter eggs (for documentation)
     * @returns {Array}
     */
    getAvailableEasterEggs() {
        return [
            { name: 'Konami Code', hint: '⬆️⬆️⬇️⬇️⬅️➡️⬅️➡️BA', type: 'keyboard' },
            { name: 'Rosebud', hint: 'Type "rosebud"', type: 'cheat' },
            { name: 'Matrix', hint: 'Type "matrix"', type: 'cheat' },
            { name: 'Disco', hint: 'Type "disco"', type: 'cheat' },
            { name: 'Clock Click', hint: 'Click clock 10 times', type: 'click' }
        ];
    }
}

// Create and export singleton instance
const EasterEggsInstance = new EasterEggs();
export default EasterEggsInstance;
