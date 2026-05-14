/**
 * AchievementSystem - Tracks and displays achievements
 * Now extends FeatureBase for integration with FeatureRegistry
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import { getConfig } from '../core/ConfigLoader.js';
import { escapeHtml } from '../core/Sanitize.js';

// Feature metadata
const FEATURE_METADATA = {
    id: 'achievements',
    name: 'Achievement System',
    description: 'Unlock achievements and track milestones throughout IlluminatOS!',
    icon: '🏆',
    category: 'enhancement',
    dependencies: ['soundsystem'],
    config: {
        showToasts: true,
        toastDuration: 3000,
        playSound: true
    },
    settings: [
        {
            key: 'showToasts',
            label: 'Show Achievement Toasts',
            type: 'checkbox'
        },
        {
            key: 'toastDuration',
            label: 'Toast Duration (ms)',
            type: 'number',
            min: 1000,
            max: 10000,
            step: 500
        },
        {
            key: 'playSound',
            label: 'Play Achievement Sound',
            type: 'checkbox'
        }
    ]
};

// Default achievements (can be overridden via config)
const DEFAULT_ACHIEVEMENTS = [
    { id: 'first_boot', name: 'First Boot', desc: 'Welcome!', icon: '👋' },
    { id: 'konami_master', name: 'Konami Master', desc: 'Entered the code', icon: '🎮' },
    { id: 'disco_fever', name: 'Disco Fever', desc: 'Clicked clock 10x', icon: '🕺' },
    { id: 'multitasker', name: 'Multitasker', desc: '10+ windows', icon: '🪟' },
    { id: 'clippy_hater', name: 'Clippy Hater', desc: 'Dismissed 5x', icon: '😠' },
    { id: 'clippy_terminator', name: 'Clippy Terminator', desc: 'Dismissed 10x', icon: '🔫' },
    { id: 'matrix_mode', name: 'Neo', desc: 'Entered Matrix', icon: '🌧️' },
];

/**
 * Get achievements from config or fall back to defaults.
 * Caches the result so runtime registerAchievement() calls persist.
 */
let _achievementsCache = null;
function getAllAchievements() {
    if (!_achievementsCache) {
        const configured = getConfig('achievements', null);
        _achievementsCache = (Array.isArray(configured) && configured.length > 0)
            ? [...configured]
            : [...DEFAULT_ACHIEVEMENTS];
    }
    return _achievementsCache;
}

class AchievementSystem extends FeatureBase {
    constructor() {
        super(FEATURE_METADATA);
        this.activeToasts = new Set();
    }

    /**
     * Initialize the achievement system
     */
    async initialize() {
        if (!this.isEnabled()) return;

        // Listen for achievement unlock events
        this.subscribe(Events.ACHIEVEMENT_UNLOCK, ({ achievementId }) => {
            this.showToast(achievementId);
        });

        // First boot achievement
        if (!StateManager.getState('user.hasVisited')) {
            setTimeout(() => {
                StateManager.unlockAchievement('first_boot');
            }, 4000);
        }

        this.log('Initialized');
    }

    /**
     * Cleanup when disabled
     */
    cleanup() {
        // Remove any active toasts
        this.activeToasts.forEach(toast => {
            toast.remove();
        });
        this.activeToasts.clear();

        super.cleanup();
    }

    /**
     * Show an achievement toast notification
     * @param {string} id - Achievement ID
     */
    showToast(id) {
        if (!this.isEnabled()) return;
        if (!this.getConfig('showToasts', true)) return;

        const achievement = getAllAchievements().find(a => a.id === id) || {
            name: id, desc: 'Achievement unlocked!', icon: '🏆'
        };

        const toast = document.createElement('div');
        toast.className = 'achievement-toast active';
        toast.innerHTML = `
            <div class="achievement-icon">${escapeHtml(achievement.icon)}</div>
            <div class="achievement-title">Achievement Unlocked!</div>
            <div class="achievement-desc">${escapeHtml(achievement.name)}</div>
        `;
        document.body.appendChild(toast);
        this.activeToasts.add(toast);

        // Play sound if enabled
        if (this.getConfig('playSound', true)) {
            EventBus.emit(Events.SOUND_PLAY, { type: 'achievement' });
        }

        // Trigger hook for other features to react
        this.triggerHook('achievement:unlocked', { id, achievement });

        const duration = this.getConfig('toastDuration', 3000);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
                this.activeToasts.delete(toast);
            }, 500);
        }, duration);
    }

    /**
     * Get all available achievements
     * @returns {Array}
     */
    getAll() {
        return getAllAchievements();
    }

    /**
     * Get unlocked achievements
     * @returns {Array}
     */
    getUnlocked() {
        return StateManager.getState('achievements') || [];
    }

    /**
     * Check if an achievement is unlocked
     * @param {string} id - Achievement ID
     * @returns {boolean}
     */
    isUnlocked(id) {
        const unlocked = this.getUnlocked();
        return unlocked.includes(id);
    }

    /**
     * Get achievement by ID
     * @param {string} id - Achievement ID
     * @returns {Object|null}
     */
    getAchievement(id) {
        return getAllAchievements().find(a => a.id === id) || null;
    }

    /**
     * Register a new achievement
     * @param {Object} achievement - Achievement definition { id, name, desc, icon }
     */
    registerAchievement(achievement) {
        if (!achievement.id || !achievement.name) {
            this.warn('Invalid achievement definition');
            return;
        }

        // Check if already exists
        if (getAllAchievements().find(a => a.id === achievement.id)) {
            this.warn(`Achievement ${achievement.id} already exists`);
            return;
        }

        getAllAchievements().push({
            id: achievement.id,
            name: achievement.name,
            desc: achievement.desc || 'Achievement unlocked!',
            icon: achievement.icon || '🏆'
        });

        this.triggerHook('achievement:registered', { achievement });
    }

    /**
     * Get progress towards achievements
     * @returns {Object} Progress data
     */
    getProgress() {
        const unlocked = this.getUnlocked();
        return {
            total: getAllAchievements().length,
            unlocked: unlocked.length,
            percentage: getAllAchievements().length > 0 ? Math.round((unlocked.length / getAllAchievements().length) * 100) : 0
        };
    }
}

// Create and export singleton instance
const AchievementSystemInstance = new AchievementSystem();
export default AchievementSystemInstance;
