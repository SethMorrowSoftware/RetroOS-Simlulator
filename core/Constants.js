/**
 * Constants - Centralized configuration values for IlluminatOS!
 *
 * This file contains all configurable constants to make the codebase
 * more maintainable and easier to customize.
 */

// Import IconSystem for enhanced icon support
import IconSystem, {
    icon,
    emoji,
    renderIcon,
    getIconClass,
    getEmoji,
    Icons as FAIcons,
    Emojis
} from './IconSystem.js';

// Re-export IconSystem for easy access
export { IconSystem, icon, emoji, renderIcon, getIconClass, getEmoji, FAIcons, Emojis };

// ============================================
// User Configuration
// ============================================

/**
 * Default user name - used for folder paths
 */
export const USER_NAME = 'User';

/**
 * Common file system paths
 * Frozen to prevent accidental modifications
 */
export const PATHS = Object.freeze({
    USER_HOME: Object.freeze(['C:', 'Users', 'User']),
    DESKTOP: Object.freeze(['C:', 'Users', 'User', 'Desktop']),
    DOCUMENTS: Object.freeze(['C:', 'Users', 'User', 'Documents']),
    PICTURES: Object.freeze(['C:', 'Users', 'User', 'Pictures']),
    MUSIC: Object.freeze(['C:', 'Users', 'User', 'Music']),
    VIDEOS: Object.freeze(['C:', 'Users', 'User', 'Videos']),
    MAIL: Object.freeze(['C:', 'Users', 'User', 'Mail']),
    PROGRAM_FILES: Object.freeze(['C:', 'Program Files']),
    WINDOWS: Object.freeze(['C:', 'Windows']),
    SYSTEM32: Object.freeze(['C:', 'Windows', 'System32']),
    MEDIA: Object.freeze(['C:', 'Windows', 'Media'])
});

/**
 * Get a path array - helper function
 * @param {string} pathName - Key from PATHS
 * @returns {string[]} Path array
 */
export function getPath(pathName) {
    return [...PATHS[pathName]];
}

// ============================================
// Window Management
// ============================================

export const WINDOW = Object.freeze({
    MIN_WIDTH: 300,
    MIN_HEIGHT: 200,
    BASE_Z_INDEX: 1000,
    CASCADE_OFFSET: 30,
    MAX_CASCADE: 10,
    ANIMATION_DURATION: 150,  // ms
    CLOSE_ANIMATION: 200      // ms
});

// ============================================
// Desktop Configuration
// ============================================

export const DESKTOP = Object.freeze({
    ICON_WIDTH: 100,
    ICON_HEIGHT: 100,
    GRID_SIZE: 20,
    // File icons start in column 5 (after the 4 app icon columns at x: 20, 120, 220, 320)
    FILE_ICONS_START_X: 420,
    FILE_ICONS_START_Y: 20,
    FILE_ICON_SPACING: 90
});

// ============================================
// Timing Constants
// ============================================

export const TIMING = Object.freeze({
    // UI Debounce/Delays
    CLICK_DELAY: 100,
    MOUNT_DELAY: 50,
    ANIMATION_SHORT: 150,
    ANIMATION_MEDIUM: 300,
    ANIMATION_LONG: 500,

    // System
    CLOCK_UPDATE_INTERVAL: 1000,
    SCREENSAVER_DELAY: 300000,  // 5 minutes
    BOOT_TIMEOUT: 30000,        // 30 seconds

    // Feedback
    TOAST_DURATION: 3000,
    FEEDBACK_DURATION: 2000
});

// ============================================
// Audio Configuration
// ============================================

export const AUDIO = Object.freeze({
    DEFAULT_VOLUME: 0.5,
    EFFECT_VOLUME: 0.7,
    MUSIC_VOLUME: 0.5,
    FADE_DURATION: 300
});

// ============================================
// App Categories
// ============================================

export const CATEGORIES = Object.freeze({
    ACCESSORIES: 'accessories',
    GAMES: 'games',
    MULTIMEDIA: 'multimedia',
    INTERNET: 'internet',
    SYSTEM_TOOLS: 'systemtools',
    SETTINGS: 'settings',
    SYSTEM: 'system'
});

/**
 * Category display names and icons for Start Menu
 * Each category has:
 *   - name: Display name
 *   - icon: Emoji icon (for backwards compatibility)
 *   - faIcon: FontAwesome icon class
 * Frozen to prevent accidental modifications
 */
export const CATEGORY_INFO = Object.freeze({
    accessories: Object.freeze({ name: 'Accessories', icon: '📝', faIcon: 'CATEGORY_ACCESSORIES' }),
    games: Object.freeze({ name: 'Games', icon: '🎮', faIcon: 'CATEGORY_GAMES' }),
    multimedia: Object.freeze({ name: 'Multimedia', icon: '🎵', faIcon: 'CATEGORY_MULTIMEDIA' }),
    internet: Object.freeze({ name: 'Internet', icon: '🌐', faIcon: 'CATEGORY_INTERNET' }),
    systemtools: Object.freeze({ name: 'System Tools', icon: '🔧', faIcon: 'CATEGORY_SYSTEM_TOOLS' }),
    settings: Object.freeze({ name: 'Settings', icon: '⚙️', faIcon: 'CATEGORY_SETTINGS' }),
    system: Object.freeze({ name: 'System', icon: '💻', faIcon: 'CATEGORY_SYSTEM' })
});

// ============================================
// Storage Keys
// ============================================

export const STORAGE_KEYS = Object.freeze({
    PREFIX: 'illuminatos_',
    DESKTOP_ICONS: 'desktopIcons',
    FILE_POSITIONS: 'filePositions',
    MENU_ITEMS: 'menuItems',
    RECYCLED_ITEMS: 'recycledItems',
    ACHIEVEMENTS: 'achievements',
    SOUND_ENABLED: 'soundEnabled',
    CRT_ENABLED: 'crtEnabled',
    PET_ENABLED: 'petEnabled',
    CURRENT_PET: 'currentPet',
    HAS_VISITED: 'hasVisited',
    DESKTOP_BG: 'desktopBg',
    ADMIN_PASSWORD: 'adminPassword',
    // Must match the key FileSystemManager/StateManager actually persist
    // under ('fileSystem', capital S) — a caller trusting this constant
    // would otherwise read/write the wrong key.
    FILESYSTEM: 'fileSystem'
});

// ============================================
// Event Names
// ============================================
// Note: Main event definitions are in EventBus.js
// This section is for custom app events

export const CUSTOM_EVENTS = Object.freeze({
    DIALOG_ALERT: 'dialog:alert',
    DIALOG_CONFIRM: 'dialog:confirm',
    DIALOG_PROMPT: 'dialog:prompt',
    BSOD_TRIGGER: 'bsod:trigger',
    FILESYSTEM_CHANGED: 'filesystem:changed',
    DESKTOP_RENDER: 'desktop:render'
});

// ============================================
// File Types
// ============================================

export const FILE_TYPES = Object.freeze({
    TEXT: Object.freeze(['txt', 'md', 'log', 'ini', 'cfg']),
    IMAGE: Object.freeze(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico']),
    AUDIO: Object.freeze(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']),
    VIDEO: Object.freeze(['mp4', 'avi', 'mkv', 'webm', 'ogv', 'mov']),
    EXECUTABLE: Object.freeze(['exe']),
    SCRIPT: Object.freeze(['retro', 'bat', 'cmd']),
    DOCUMENT: Object.freeze(['doc', 'docx', 'pdf']),
    ARCHIVE: Object.freeze(['zip', 'rar', '7z', 'tar', 'gz'])
});

/**
 * Get app ID for opening a file type
 * @param {string} extension - File extension
 * @returns {string|null} App ID or null
 */
export function getAppForExtension(extension) {
    const ext = extension.toLowerCase();

    if (FILE_TYPES.TEXT.includes(ext)) return 'notepad';
    if (FILE_TYPES.IMAGE.includes(ext)) return 'paint';
    if (FILE_TYPES.AUDIO.includes(ext)) return 'mediaplayer';
    if (FILE_TYPES.VIDEO.includes(ext)) return 'mediaplayer';
    if (FILE_TYPES.SCRIPT.includes(ext)) return 'scriptrunner';

    return null;
}

// ============================================
// Emoji Icons (Legacy - use IconSystem for new code)
// ============================================

/**
 * @deprecated Use IconSystem.icon() or IconSystem.emoji() instead
 * This is kept for backwards compatibility with existing code
 * Frozen to prevent accidental modifications
 */
export const ICONS = Object.freeze({
    // Apps
    COMPUTER: '💻',
    RECYCLE_BIN: '🗑️',
    TERMINAL: '📟',
    NOTEPAD: '📝',
    PAINT: '🖌️',
    CALCULATOR: '🔢',
    BROWSER: '🌐',
    SETTINGS: '⚙️',

    // Files
    FOLDER: '📁',
    FOLDER_OPEN: '📂',
    FILE: '📄',
    FILE_TEXT: '📝',
    FILE_IMAGE: '🖼️',
    FILE_AUDIO: '🎵',
    FILE_VIDEO: '🎬',
    FILE_EXE: '⚙️',
    FILE_UNKNOWN: '📄',

    // Actions
    SAVE: '💾',
    OPEN: '📂',
    NEW: '📄',
    DELETE: '🗑️',
    COPY: '📋',
    CUT: '✂️',
    PASTE: '📋',

    // Status
    INFO: 'ℹ️',
    WARNING: '⚠️',
    ERROR: '❌',
    SUCCESS: '✅',
    QUESTION: '❓'
});

// ============================================
// Icon Helper Functions
// ============================================

/**
 * Get an icon (FontAwesome or emoji based on config)
 * @param {string} name - Icon name (e.g., 'FOLDER', 'TERMINAL')
 * @param {Object} options - Options passed to IconSystem.icon()
 * @returns {string} HTML string for the icon
 */
export function getIcon(name, options = {}) {
    return icon(name, options);
}

/**
 * Get an emoji icon
 * @param {string} name - Icon name
 * @returns {string} Emoji character
 */
export function getEmojiIcon(name) {
    return getEmoji(name);
}

// ============================================
// Default Export
// ============================================

export default {
    USER_NAME,
    PATHS,
    getPath,
    WINDOW,
    DESKTOP,
    TIMING,
    AUDIO,
    CATEGORIES,
    CATEGORY_INFO,
    STORAGE_KEYS,
    CUSTOM_EVENTS,
    FILE_TYPES,
    getAppForExtension,
    ICONS,
    // Icon System exports
    IconSystem,
    icon,
    emoji,
    renderIcon,
    getIconClass,
    getEmoji,
    getIcon,
    getEmojiIcon
};
