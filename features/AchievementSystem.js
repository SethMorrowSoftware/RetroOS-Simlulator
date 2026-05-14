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
    { id: 'secret_admin', name: 'Rosebud Whisperer', desc: 'Found the admin cheat', icon: '🌹' },
    { id: 'bsod_master', name: 'BSOD Master', desc: 'Crashed the system on purpose', icon: '💀' },
    // Pet-themed achievements (see DesktopPet.js for unlock conditions)
    { id: 'fortune_teller', name: 'Fortune Teller', desc: 'Pet read your fortune', icon: '🔮' },
    { id: 'pet_first_friend', name: 'Hello, Little One', desc: 'First time petting your pet', icon: '🤝' },
    { id: 'pet_lover', name: 'Pet Lover', desc: 'Petted your friend 10 times', icon: '🐾' },
    { id: 'pet_best_friend', name: 'Best Friend', desc: '50 pets — true companionship', icon: '💖' },
    { id: 'pet_first_meal', name: 'Lunch Time', desc: 'Fed your pet for the first time', icon: '🍪' },
    { id: 'pet_foodie', name: 'Foodie', desc: 'Fed your pet 10 times', icon: '🍱' },
    { id: 'pet_whisperer', name: 'Pet Whisperer', desc: 'Tried every pet type', icon: '🧙' },
    { id: 'pet_codemate', name: 'Codemate', desc: 'Triggered a code with your pet around', icon: '🕹️' },
];

/**
 * P2.6 — Module-level cache drift fix. Previously this file held a
 * `let _achievementsCache = null` that was populated on first read of
 * config-defined achievements and never invalidated. When admins updated
 * the achievement list at runtime (via ControlPanel → ConfigLoader), the
 * cache stayed stale and `getAchievement(id)` returned old data.
 *
 * The fix splits the source: config-defined achievements are read fresh
 * from `getConfig` (or the defaults) every time, and runtime-registered
 * achievements live on the feature instance so they survive enable/disable
 * without leaking through to a different feature's view.
 */

class AchievementSystem extends FeatureBase {
    constructor() {
        super(FEATURE_METADATA);
        this.activeToasts = new Set();
        // Runtime-registered achievements. Populated only by
        // `registerAchievement(...)` calls from other features or scripts.
        // Config-defined achievements are read through `getConfig` on
        // every access so admin changes propagate without a re-init.
        this._runtimeAchievements = new Map();
    }

    /**
     * Get the full achievement set: config (or defaults) plus any
     * runtime-registered entries. Reads through `getConfig` each call
     * so admin changes to the achievement list propagate immediately.
     * @returns {Array}
     */
    _getAllAchievements() {
        const configured = getConfig('achievements', null);
        const base = (Array.isArray(configured) && configured.length > 0)
            ? configured
            : DEFAULT_ACHIEVEMENTS;
        if (this._runtimeAchievements.size === 0) return [...base];
        // Runtime registrations take precedence on id collision.
        const baseIds = new Set(base.map(a => a.id));
        const merged = base.map(a =>
            this._runtimeAchievements.has(a.id)
                ? this._runtimeAchievements.get(a.id)
                : a
        );
        for (const [id, a] of this._runtimeAchievements) {
            if (!baseIds.has(id)) merged.push(a);
        }
        return merged;
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

        // Drop runtime-registered achievements so a re-enable starts from
        // the config/default set (config-driven entries are read on demand).
        this._runtimeAchievements.clear();

        super.cleanup();
    }

    /**
     * Show an achievement toast notification
     * @param {string} id - Achievement ID
     */
    showToast(id) {
        if (!this.isEnabled()) return;
        if (!this.getConfig('showToasts', true)) return;

        const achievement = this._getAllAchievements().find(a => a.id === id) || {
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
        return this._getAllAchievements();
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
        return this._getAllAchievements().find(a => a.id === id) || null;
    }

    /**
     * Register a new achievement at runtime. Persists in the feature
     * instance's `_runtimeAchievements` map until disable/cleanup, so
     * `getAchievement(id)` and `showToast(id)` see the new entry without
     * needing to refresh a module-level cache.
     * @param {Object} achievement - Achievement definition { id, name, desc, icon }
     */
    registerAchievement(achievement) {
        if (!achievement.id || !achievement.name) {
            this.warn('Invalid achievement definition');
            return;
        }

        // Check if already exists (config or runtime)
        if (this._getAllAchievements().find(a => a.id === achievement.id)) {
            this.warn(`Achievement ${achievement.id} already exists`);
            return;
        }

        this._runtimeAchievements.set(achievement.id, {
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
        const all = this._getAllAchievements();
        return {
            total: all.length,
            unlocked: unlocked.length,
            percentage: all.length > 0 ? Math.round((unlocked.length / all.length) * 100) : 0
        };
    }
}

// Create and export singleton instance
const AchievementSystemInstance = new AchievementSystem();
export default AchievementSystemInstance;
