/**
 * StateManager - Centralized state management with reactive subscriptions
 * Single source of truth for all application state
 * 
 * Usage:
 *   StateManager.setState('windows', [...])
 *   StateManager.getState('windows')
 *   StateManager.subscribe('windows', callback)
 */

import EventBus, { Events } from './EventBus.js';
import StorageManager from './StorageManager.js';
import { getConfig } from './ConfigLoader.js';
import { getNextDesktopSlot, findNearestFreeSlot, getAllOccupiedPositions } from './DesktopLayout.js';

// Default desktop icons (used when localStorage is empty)
// Positions are placeholders; they get auto-arranged on first load
// based on the user's screen resolution (see arrangeDefaultIcons below).
const DEFAULT_ICONS = [
    { id: 'mycomputer', label: 'My Computer', emoji: '💻', type: 'app', x: 20, y: 20 },
    { id: 'recyclebin', label: 'Recycle Bin', emoji: '🗑️', type: 'app', x: 20, y: 110 },
    { id: 'terminal', label: 'Terminal', emoji: '📟', type: 'app', x: 20, y: 200 },
    { id: 'inbox', label: 'Inbox', emoji: '📧', type: 'app', x: 20, y: 290 },
    { id: 'ciphers', label: 'Cipher Decoder', emoji: '🔍', url: 'https://sethmorrow.com/ciphers', x: 20, y: 380, type: 'link' },
    { id: 'music', label: 'Music', emoji: '🎵', url: 'https://sethmorrow.com/music', x: 20, y: 470, type: 'link' },
    { id: 'videos', label: 'Videos', emoji: '📺', url: 'https://sethmorrow.com/videos', x: 20, y: 560, type: 'link' },
    { id: 'books', label: 'Books', emoji: '📚', url: 'https://sethmorrow.com/books', x: 20, y: 650, type: 'link' },
    { id: 'audiobooks', label: 'Audiobooks', emoji: '🎧', url: 'https://sethmorrow.com/audiobooks', x: 20, y: 740, type: 'link' },
];

/**
 * Migrate existing saved icon sets to include new default icons.
 * For each icon in DEFAULT_ICONS that doesn't exist in the saved set,
 * append it to the end (it will be auto-arranged).
 * @param {Array} icons - Existing saved icons
 * @returns {Array} Icons with any missing defaults appended
 */
function migrateIcons(icons) {
    let changed = false;
    for (const def of DEFAULT_ICONS) {
        if (!icons.find(i => i.id === def.id)) {
            icons.push({ ...def });
            changed = true;
        }
    }
    return changed ? arrangeDefaultIcons(icons) : icons;
}

/**
 * Arrange icons in a grid that adapts to the current viewport.
 * Icons flow top-to-bottom, then wrap to the next column.
 * @param {Array} icons - Array of icon objects to arrange
 * @returns {Array} Icons with updated x/y positions
 */
function arrangeDefaultIcons(icons) {
    const occupied = [];
    return icons.map(icon => {
        const slot = getNextDesktopSlot(occupied);
        occupied.push(slot);
        return { ...icon, x: slot.x, y: slot.y };
    });
}


class StateManagerClass {
    constructor() {
        // Central state object
        this.state = {
            // Desktop icons
            icons: [],
            // File icon positions (for files on desktop)
            filePositions: {},
            // Open windows
            windows: [],
            // Custom menu items
            menuItems: [],
            // Recycled items
            recycledItems: [],
            // Unlocked achievements
            achievements: [],
            // Settings
            settings: {
                sound: false,
                crtEffect: true,
                pet: {
                    enabled: false,
                    type: '🐕'
                },
                screensaverDelay: 300000
            },
            // User state
            user: {
                isAdmin: false,
                hasVisited: false,
                userName: 'Guest',
                loginMode: 'guest'   // 'login' | 'signup' | 'guest'
            },
            // UI state
            ui: {
                activeWindow: null,
                startMenuOpen: false,
                contextMenuOpen: false,
                clippyVisible: false
            }
        };

        // Subscribers by key path
        this.subscribers = new Map();
        
        // Track highest window z-index
        this.windowZIndex = 1000;
    }

    /**
     * Initialize state from storage
     */
    initialize() {
        // Load persisted state
        const savedIcons = StorageManager.get('desktopIcons');
        const savedFilePositions = StorageManager.get('filePositions');
        const savedMenu = StorageManager.get('menuItems');
        const savedRecycled = StorageManager.get('recycledItems');
        const savedAchievements = StorageManager.get('achievements');
        const savedSound = StorageManager.get('soundEnabled');
        const savedCRT = StorageManager.get('crtEnabled');
        const savedPet = StorageManager.get('petEnabled');
        const savedPetType = StorageManager.get('currentPet');
        const hasVisited = StorageManager.get('hasVisited');

        // Resolve default icons: config overrides inline defaults
        const configIcons = getConfig('desktopIcons', null);
        const defaultIcons = configIcons
            ? configIcons.map(icon => ({ ...icon }))
            : [...DEFAULT_ICONS];

        // Apply saved state OR auto-arrange defaults for the user's resolution.
        // If saved icons exist, migrate to include any new default icons (e.g., Inbox).
        this.state.icons = savedIcons ? migrateIcons(savedIcons) : arrangeDefaultIcons(defaultIcons);
        if (savedFilePositions) this.state.filePositions = savedFilePositions;
        if (savedMenu) this.state.menuItems = savedMenu;
        if (savedRecycled) this.state.recycledItems = savedRecycled;
        if (savedAchievements) this.state.achievements = savedAchievements;

        // Resolve default settings from config
        const configDefaults = getConfig('defaults', {});
        if (savedSound !== null) {
            this.state.settings.sound = savedSound === true || savedSound === 'true';
        } else if (configDefaults.sound !== undefined) {
            this.state.settings.sound = configDefaults.sound;
        }
        if (savedCRT !== null) {
            this.state.settings.crtEffect = savedCRT === true || savedCRT === 'true';
        } else if (configDefaults.crtEffect !== undefined) {
            this.state.settings.crtEffect = configDefaults.crtEffect;
        }
        if (savedPet !== null) {
            this.state.settings.pet.enabled = savedPet === true || savedPet === 'true';
        } else if (configDefaults.petEnabled !== undefined) {
            this.state.settings.pet.enabled = configDefaults.petEnabled;
        }
        if (savedPetType) {
            this.state.settings.pet.type = savedPetType;
        }
        if (hasVisited) this.state.user.hasVisited = true;

        // Restore user identity from previous session
        const savedUserName = StorageManager.get('user.userName');
        const savedLoginMode = StorageManager.get('user.loginMode');
        if (savedUserName) this.state.user.userName = savedUserName;
        if (savedLoginMode) this.state.user.loginMode = savedLoginMode;

        console.log('[StateManager] Initialized with', this.state.icons.length, 'icons');
    }

    /**
     * Get state value by path
     * @param {string} path - Dot-notation path (e.g., 'settings.sound')
     * @returns {*} State value
     */
    getState(path) {
        if (!path) return this.state;

        const value = path.split('.').reduce((obj, key) => {
            return obj && obj[key] !== undefined ? obj[key] : undefined;
        }, this.state);

        // Return clones of objects/arrays to prevent accidental mutation
        // of internal state without going through setState()
        if (value !== null && typeof value === 'object') {
            try {
                return structuredClone(value);
            } catch {
                // Fallback for non-cloneable values (DOM nodes, functions, etc.)
                return value;
            }
        }

        return value;
    }

    /**
     * Set state value and notify subscribers
     * @param {string} path - Dot-notation path
     * @param {*} value - New value
     * @param {boolean} persist - Whether to save to storage
     */
    setState(path, value, persist = false) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        
        // Navigate to parent object, creating intermediate objects as needed
        let obj = this.state;
        for (const key of keys) {
            if (obj[key] === undefined || obj[key] === null || typeof obj[key] !== 'object') {
                obj[key] = {};
            }
            obj = obj[key];
        }
        
        const oldValue = obj[lastKey];
        obj[lastKey] = value;

        // Emit state change event
        EventBus.emit(Events.STATE_CHANGE, { path, value, oldValue });

        // Notify subscribers for this path and parent paths
        this.notifySubscribers(path, value);
        
        // Persist to storage if requested
        if (persist) {
            this.persistState(path, value);
        }
    }

    /**
     * Subscribe to state changes
     * @param {string} path - State path to watch
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback) {
        if (!this.subscribers.has(path)) {
            this.subscribers.set(path, []);
        }
        this.subscribers.get(path).push(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.subscribers.get(path);
            const index = callbacks.indexOf(callback);
            if (index > -1) callbacks.splice(index, 1);
        };
    }

    /**
     * Notify all subscribers of a state change
     * @param {string} path - Changed path
     * @param {*} value - New value
     */
    notifySubscribers(path, value) {
        // Notify exact path subscribers (snapshot array to handle unsubscribe during iteration)
        if (this.subscribers.has(path)) {
            [...this.subscribers.get(path)].forEach(cb => cb(value, path));
        }

        // Notify parent path subscribers
        const parts = path.split('.');
        while (parts.length > 1) {
            parts.pop();
            const parentPath = parts.join('.');
            if (this.subscribers.has(parentPath)) {
                const parentValue = this.getState(parentPath);
                [...this.subscribers.get(parentPath)].forEach(cb => cb(parentValue, path));
            }
        }
    }

    /**
     * Persist specific state to storage
     * @param {string} path - State path
     * @param {*} value - Value to persist
     */
    persistState(path, value) {
        const storageMap = {
            'icons': 'desktopIcons',
            'filePositions': 'filePositions',
            'menuItems': 'menuItems',
            'recycledItems': 'recycledItems',
            'achievements': 'achievements',
            'settings.sound': 'soundEnabled',
            'settings.crtEffect': 'crtEnabled',
            'settings.pet.enabled': 'petEnabled',
            'settings.pet.type': 'currentPet',
            'user.hasVisited': 'hasVisited',
            'user.userName': 'user.userName',
            'user.loginMode': 'user.loginMode'
        };

        if (storageMap[path]) {
            StorageManager.set(storageMap[path], value);
        }
    }

    // ===== Window State Helpers =====

    /**
     * Add a window to state
     * @param {Object} windowData - Window configuration
     * @returns {Object} The added window
     */
    addWindow(windowData) {
        const winState = {
            ...windowData,
            zIndex: ++this.windowZIndex,
            minimized: false,
            maximized: false
        };

        const windows = [...this.state.windows, winState];
        this.setState('windows', windows);
        this.setState('ui.activeWindow', winState.id);

        return winState;
    }

    /**
     * Remove a window from state
     * @param {string} windowId - Window ID to remove
     */
    removeWindow(windowId) {
        const windows = this.state.windows.filter(w => w.id !== windowId);
        this.setState('windows', windows);
        
        // Update active window
        if (this.state.ui.activeWindow === windowId) {
            const lastWindow = windows[windows.length - 1];
            this.setState('ui.activeWindow', lastWindow ? lastWindow.id : null);
        }
    }

    /**
     * Get a window by ID
     * @param {string} windowId - Window ID
     * @returns {Object|null} Window data
     */
    getWindow(windowId) {
        return this.state.windows.find(w => w.id === windowId) || null;
    }

    /**
     * Update a window's state
     * @param {string} windowId - Window ID
     * @param {Object} updates - Properties to update
     */
    updateWindow(windowId, updates) {
        const windows = this.state.windows.map(w => 
            w.id === windowId ? { ...w, ...updates } : w
        );
        this.setState('windows', windows);
    }

    /**
     * Focus a window (bring to front)
     * @param {string} windowId - Window ID
     */
    focusWindow(windowId) {
        this.updateWindow(windowId, { 
            zIndex: ++this.windowZIndex,
            minimized: false 
        });
        this.setState('ui.activeWindow', windowId);
    }

    // ===== Icon State Helpers =====

    /**
     * Add an icon
     * @param {Object} iconData - Icon configuration
     */
    addIcon(iconData) {
        const occupied = getAllOccupiedPositions(k => this.getState(k));
        const hasCoordinates = Number.isFinite(iconData?.x) && Number.isFinite(iconData?.y);

        // Even when coordinates are provided, verify the slot is free
        const position = hasCoordinates
            ? findNearestFreeSlot(iconData.x, iconData.y, occupied)
            : getNextDesktopSlot(occupied);

        const positionedIcon = { ...iconData, ...position };
        const icons = [...this.state.icons, positionedIcon];
        this.setState('icons', icons, true);
    }

    /**
     * Remove an icon (move to recycle bin)
     * @param {string} iconId - Icon ID
     */
    recycleIcon(iconId) {
        const icon = this.state.icons.find(i => i.id === iconId);
        if (!icon) return;

        // Add to recycle bin
        const recycled = [...this.state.recycledItems, icon];
        this.setState('recycledItems', recycled, true);

        // Remove from desktop
        const icons = this.state.icons.filter(i => i.id !== iconId);
        this.setState('icons', icons, true);
    }

    /**
     * Restore icon from recycle bin
     * @param {number} index - Index in recycled items
     */
    restoreIcon(index) {
        const item = this.state.recycledItems[index];
        if (!item) return;

        const occupied = getAllOccupiedPositions(k => this.getState(k));
        const hasCoordinates = Number.isFinite(item?.x) && Number.isFinite(item?.y);

        // Even when coordinates exist, verify the slot is still free
        const position = hasCoordinates
            ? findNearestFreeSlot(item.x, item.y, occupied)
            : getNextDesktopSlot(occupied);

        const restoredIcon = { ...item, ...position };

        // Add back to icons
        const icons = [...this.state.icons, restoredIcon];
        this.setState('icons', icons, true);

        // Remove from recycle bin
        const recycled = this.state.recycledItems.filter((_, i) => i !== index);
        this.setState('recycledItems', recycled, true);
    }

    /**
     * Update icon position
     * @param {string} iconId - Icon ID
     * @param {number} x - New X position
     * @param {number} y - New Y position
     */
    updateIconPosition(iconId, x, y) {
        // Collect occupied positions excluding the icon being moved
        const occupied = getAllOccupiedPositions(k => this.getState(k))
            .filter(pos => {
                const movingIcon = this.state.icons.find(i => i.id === iconId);
                return !(movingIcon && pos.x === movingIcon.x && pos.y === movingIcon.y);
            });

        const slot = findNearestFreeSlot(x, y, occupied);
        const icons = this.state.icons.map(icon =>
            icon.id === iconId ? { ...icon, x: slot.x, y: slot.y } : icon
        );
        this.setState('icons', icons, true);
    }

    // ===== Achievement Helpers =====

    /**
     * Check if achievement is unlocked
     * @param {string} achievementId - Achievement ID
     * @returns {boolean}
     */
    hasAchievement(achievementId) {
        return this.state.achievements.includes(achievementId);
    }

    /**
     * Unlock an achievement
     * @param {string} achievementId - Achievement ID
     * @returns {boolean} Whether it was newly unlocked
     */
    unlockAchievement(achievementId) {
        if (this.hasAchievement(achievementId)) return false;

        const achievements = [...this.state.achievements, achievementId];
        this.setState('achievements', achievements, true);
        
        EventBus.emit(Events.ACHIEVEMENT_UNLOCK, { achievementId });
        return true;
    }

    // ===== Settings Helpers =====

    /**
     * Toggle a boolean setting
     * @param {string} settingPath - Setting path (e.g., 'sound')
     * @returns {boolean} New value
     */
    toggleSetting(settingPath) {
        const fullPath = `settings.${settingPath}`;
        const current = this.getState(fullPath);
        this.setState(fullPath, !current, true);
        return !current;
    }

    /**
     * Export full state for backup (legacy - basic export)
     * @returns {Object} Basic state export
     */
    exportState(options = {}) {
        const includeSensitive = options?.includeSensitive === true;

        const exported = {
            icons: this.state.icons,
            menuItems: this.state.menuItems,
            achievements: this.state.achievements,
            settings: this.state.settings,
            bgColor: StorageManager.get('desktopBg')
        };

        if (includeSensitive) {
            exported.password = StorageManager.get('adminPassword');
        }

        return exported;
    }

    /**
     * Export COMPLETE system snapshot including all state, file system, and app data
     * @returns {Object} Complete system snapshot
     */
    exportCompleteState(options = {}) {
        const includeSensitive = options?.includeSensitive === true;

        const snapshot = {
            // Metadata
            _meta: {
                version: '2.0',
                type: 'complete-snapshot',
                timestamp: new Date().toISOString(),
                exportedFrom: getConfig('branding.osName', 'IlluminatOS!')
            },

            // Core StateManager state
            state: {
                icons: this.state.icons,
                filePositions: this.state.filePositions,
                menuItems: this.state.menuItems,
                recycledItems: this.state.recycledItems,
                achievements: this.state.achievements,
                settings: this.state.settings,
                user: {
                    hasVisited: this.state.user.hasVisited
                    // Note: isAdmin is session-only, not exported
                }
            },

            // Complete File System
            fileSystem: StorageManager.get('fileSystem'),

            // Display Settings
            displaySettings: {
                desktopBg: StorageManager.get('desktopBg'),
                desktopWallpaper: StorageManager.get('desktopWallpaper'),
                colorScheme: StorageManager.get('colorScheme'),
                screensaverType: StorageManager.get('screensaverType'),
                screensaverDelay: StorageManager.get('screensaverDelay'),
                windowAnimations: StorageManager.get('windowAnimations'),
                menuShadows: StorageManager.get('menuShadows'),
                smoothScrolling: StorageManager.get('smoothScrolling'),
                iconSize: StorageManager.get('iconSize'),
                energySaving: StorageManager.get('energySaving')
            },

            // App-specific data
            appData: {
                // Calendar events
                calendar: this._getDirectLocalStorage('smos_calendar_events'),

                // Clock alarms
                clock: this._getDirectLocalStorage('smos_clock_alarms'),

                // Media Player playlist
                mediaPlayer: {
                    playlist: StorageManager.get('mediaPlayerPlaylist')
                },

                // Game high scores and saves
                games: {
                    skifree: StorageManager.get('skifree_highscore'),
                    snake: StorageManager.get('snakeHigh'),
                    zork: this._getDirectLocalStorage('zork_save')
                },

                // Notepad (legacy content if any)
                notepad: StorageManager.get('notepadContent')
            },

            // Feature configuration
            features: {
                clippyDismissed: StorageManager.get('clippyDismissed')
            },

        };

        if (includeSensitive) {
            snapshot.security = {
                adminPassword: StorageManager.get('adminPassword')
            };
        }

        return snapshot;
    }

    /**
     * Helper to get localStorage items that aren't managed by StorageManager
     * @param {string} key - Direct localStorage key
     * @returns {*} Parsed value or null
     */
    _getDirectLocalStorage(key) {
        try {
            const value = localStorage.getItem(key);
            if (value === null) return null;
            return JSON.parse(value);
        } catch (e) {
            // Return raw value if not JSON
            return localStorage.getItem(key);
        }
    }

    /**
     * Helper to set localStorage items directly (not through StorageManager)
     * @param {string} key - Direct localStorage key
     * @param {*} value - Value to store
     */
    _setDirectLocalStorage(key, value) {
        try {
            if (value === null || value === undefined) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, JSON.stringify(value));
            }
        } catch (e) {
            console.error('[StateManager] Failed to set direct localStorage:', key, e);
        }
    }

    /**
     * Import COMPLETE system snapshot
     * @param {Object} data - Complete snapshot data to import
     * @returns {Object} Result with success status and any warnings
     */
    importCompleteState(data) {
        const warnings = [];

        // Reject oversized imports to prevent localStorage overflow
        try {
            const dataSize = JSON.stringify(data).length;
            if (dataSize > 5 * 1024 * 1024) { // 5 MB limit
                return { success: false, error: 'Backup data exceeds maximum size (5 MB)' };
            }
        } catch {
            return { success: false, error: 'Invalid backup data (not serializable)' };
        }

        // Validate snapshot
        if (!data._meta || data._meta.type !== 'complete-snapshot') {
            // Try legacy import if not a complete snapshot
            if (data.icons || data.settings) {
                this.importState(data);
                return { success: true, legacy: true, warnings: ['Imported as legacy backup (partial state)'] };
            }
            return { success: false, error: 'Invalid snapshot format' };
        }

        try {
            // 1. Import core state
            if (data.state) {
                if (data.state.icons) this.setState('icons', data.state.icons, true);
                if (data.state.filePositions) this.setState('filePositions', data.state.filePositions, true);
                if (data.state.menuItems) this.setState('menuItems', data.state.menuItems, true);
                if (data.state.recycledItems) this.setState('recycledItems', data.state.recycledItems, true);
                if (data.state.achievements) this.setState('achievements', data.state.achievements, true);

                // Settings (nested)
                if (data.state.settings) {
                    Object.entries(data.state.settings).forEach(([key, value]) => {
                        if (typeof value === 'object' && value !== null) {
                            Object.entries(value).forEach(([subKey, subValue]) => {
                                this.setState(`settings.${key}.${subKey}`, subValue, true);
                            });
                        } else {
                            this.setState(`settings.${key}`, value, true);
                        }
                    });
                }

                // User state
                if (data.state.user) {
                    if (data.state.user.hasVisited !== undefined) {
                        this.setState('user.hasVisited', data.state.user.hasVisited, true);
                    }
                }
            }

            // 2. Import file system
            if (data.fileSystem) {
                StorageManager.set('fileSystem', data.fileSystem);
            }

            // 3. Import display settings
            if (data.displaySettings) {
                const displayKeys = [
                    'desktopBg', 'desktopWallpaper', 'colorScheme',
                    'screensaverType', 'screensaverDelay', 'windowAnimations',
                    'menuShadows', 'smoothScrolling', 'iconSize', 'energySaving'
                ];
                displayKeys.forEach(key => {
                    if (data.displaySettings[key] !== undefined && data.displaySettings[key] !== null) {
                        StorageManager.set(key, data.displaySettings[key]);
                    }
                });
            }

            // 4. Import app data
            if (data.appData) {
                // Calendar
                if (data.appData.calendar !== undefined) {
                    this._setDirectLocalStorage('smos_calendar_events', data.appData.calendar);
                }

                // Clock alarms
                if (data.appData.clock !== undefined) {
                    this._setDirectLocalStorage('smos_clock_alarms', data.appData.clock);
                }

                // Media Player
                if (data.appData.mediaPlayer?.playlist) {
                    StorageManager.set('mediaPlayerPlaylist', data.appData.mediaPlayer.playlist);
                }

                // Games
                if (data.appData.games) {
                    if (data.appData.games.skifree !== undefined) {
                        StorageManager.set('skifree_highscore', data.appData.games.skifree);
                    }
                    if (data.appData.games.snake !== undefined) {
                        StorageManager.set('snakeHigh', data.appData.games.snake);
                    }
                    if (data.appData.games.zork !== undefined) {
                        this._setDirectLocalStorage('zork_save', data.appData.games.zork);
                    }
                }

                // Notepad
                if (data.appData.notepad !== undefined) {
                    StorageManager.set('notepadContent', data.appData.notepad);
                }
            }

            // 5. Import features
            if (data.features) {
                if (data.features.clippyDismissed !== undefined) {
                    StorageManager.set('clippyDismissed', data.features.clippyDismissed);
                }
            }

            // 6. Security — admin password is intentionally NOT imported from backups.
            // Restoring credentials from an untrusted backup is a security risk.
            if (data.security?.adminPassword) {
                warnings.push('Admin password was not imported for security reasons. Set it manually if needed.');
            }

            return {
                success: true,
                warnings,
                meta: data._meta
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                warnings
            };
        }
    }

    /**
     * Import state from backup (legacy - basic import)
     * @param {Object} data - State data to import
     */
    importState(data) {
        if (data.icons) this.setState('icons', data.icons, true);
        if (data.menuItems) this.setState('menuItems', data.menuItems, true);
        if (data.achievements) this.setState('achievements', data.achievements, true);
        if (data.settings) {
            Object.entries(data.settings).forEach(([key, value]) => {
                if (typeof value === 'object' && value !== null) {
                    Object.entries(value).forEach(([subKey, subValue]) => {
                        this.setState(`settings.${key}.${subKey}`, subValue, true);
                    });
                } else {
                    this.setState(`settings.${key}`, value, true);
                }
            });
        }
        if (data.bgColor) StorageManager.set('desktopBg', data.bgColor);
        // Admin password intentionally NOT imported — security risk from untrusted backups
    }

    /**
     * Reset all state to defaults
     */
    reset() {
        StorageManager.clear();
        window.location.reload();
    }
}

// Singleton instance
const StateManager = new StateManagerClass();

export { StateManager };
export default StateManager;
