/**
 * IconSystem - Unified icon system supporting FontAwesome and emojis
 *
 * This module provides a flexible icon system that can render icons as either
 * FontAwesome icons or emoji characters. The hybrid approach allows:
 * - Professional FontAwesome icons for UI elements
 * - Emoji fallbacks for pets, chat, and playful elements
 * - Easy theming and styling with CSS
 *
 * Usage:
 *   import { icon, getIconClass, Icons, Emojis } from './core/IconSystem.js';
 *
 *   // Get icon HTML (uses FontAwesome by default)
 *   icon('FOLDER')              // '<i class="fa-solid fa-folder retro-icon"></i>'
 *
 *   // Force emoji output
 *   icon('FOLDER', { emoji: true })  // '📁'
 *
 *   // Get just the class (for custom elements)
 *   getIconClass('TERMINAL')    // 'fa-solid fa-terminal'
 */

import { escapeHtml, sanitizeCssColor } from './Sanitize.js';

// ============================================
// FontAwesome Icon Mappings
// ============================================

export const Icons = {
    // === Apps ===
    COMPUTER: 'fa-solid fa-desktop',
    MY_COMPUTER: 'fa-solid fa-computer',
    TERMINAL: 'fa-solid fa-terminal',
    NOTEPAD: 'fa-solid fa-file-lines',
    PAINT: 'fa-solid fa-paintbrush',
    CALCULATOR: 'fa-solid fa-calculator',
    BROWSER: 'fa-solid fa-globe',
    MEDIA_PLAYER: 'fa-solid fa-play',
    WINAMP: 'fa-solid fa-headphones',
    CALENDAR: 'fa-solid fa-calendar-days',
    CLOCK: 'fa-solid fa-clock',
    HELP: 'fa-solid fa-circle-question',
    RECYCLE_BIN: 'fa-solid fa-trash-can',
    CONTROL_PANEL: 'fa-solid fa-sliders',
    DISPLAY: 'fa-solid fa-display',
    SOUND_SETTINGS: 'fa-solid fa-volume-high',
    ADMIN_PANEL: 'fa-solid fa-user-shield',
    TASK_MANAGER: 'fa-solid fa-chart-line',
    CHAT_ROOM: 'fa-solid fa-comments',
    INBOX: 'fa-solid fa-envelope',
    ENVELOPE: 'fa-solid fa-envelope',
    ENVELOPE_OPEN: 'fa-solid fa-envelope-open',
    MAIL: 'fa-solid fa-envelope',

    // === Games ===
    GAME: 'fa-solid fa-gamepad',
    SOLITAIRE: 'fa-solid fa-cards-blank',
    MINESWEEPER: 'fa-solid fa-bomb',
    SNAKE: 'fa-solid fa-worm',
    ASTEROIDS: 'fa-solid fa-rocket',
    DOOM: 'fa-solid fa-skull',
    SKI_FREE: 'fa-solid fa-person-skiing',
    FREECELL: 'fa-solid fa-layer-group',

    // === Files & Folders ===
    FOLDER: 'fa-solid fa-folder',
    FOLDER_OPEN: 'fa-solid fa-folder-open',
    FILE: 'fa-solid fa-file',
    FILE_TEXT: 'fa-solid fa-file-lines',
    FILE_IMAGE: 'fa-solid fa-file-image',
    FILE_AUDIO: 'fa-solid fa-file-audio',
    FILE_VIDEO: 'fa-solid fa-file-video',
    FILE_CODE: 'fa-solid fa-file-code',
    FILE_ARCHIVE: 'fa-solid fa-file-zipper',
    FILE_EXE: 'fa-solid fa-gear',
    FILE_UNKNOWN: 'fa-solid fa-file',
    FILE_PDF: 'fa-solid fa-file-pdf',
    FILE_LOG: 'fa-solid fa-clipboard-list',

    // === Actions ===
    SAVE: 'fa-solid fa-floppy-disk',
    OPEN: 'fa-solid fa-folder-open',
    NEW: 'fa-solid fa-file-circle-plus',
    DELETE: 'fa-solid fa-trash',
    COPY: 'fa-solid fa-copy',
    CUT: 'fa-solid fa-scissors',
    PASTE: 'fa-solid fa-paste',
    UNDO: 'fa-solid fa-rotate-left',
    REDO: 'fa-solid fa-rotate-right',
    SEARCH: 'fa-solid fa-magnifying-glass',
    FIND: 'fa-solid fa-magnifying-glass',
    REFRESH: 'fa-solid fa-arrows-rotate',
    CLOSE: 'fa-solid fa-xmark',
    MINIMIZE: 'fa-solid fa-window-minimize',
    MAXIMIZE: 'fa-solid fa-window-maximize',
    RESTORE: 'fa-solid fa-window-restore',
    PLAY: 'fa-solid fa-play',
    PAUSE: 'fa-solid fa-pause',
    STOP: 'fa-solid fa-stop',
    RUN: 'fa-solid fa-play',

    // === Status ===
    INFO: 'fa-solid fa-circle-info',
    WARNING: 'fa-solid fa-triangle-exclamation',
    ERROR: 'fa-solid fa-circle-xmark',
    SUCCESS: 'fa-solid fa-circle-check',
    QUESTION: 'fa-solid fa-circle-question',
    LOADING: 'fa-solid fa-spinner fa-spin',

    // === System ===
    SETTINGS: 'fa-solid fa-gear',
    POWER: 'fa-solid fa-power-off',
    SHUTDOWN: 'fa-solid fa-power-off',
    RESTART: 'fa-solid fa-rotate',
    LOCK: 'fa-solid fa-lock',
    UNLOCK: 'fa-solid fa-lock-open',
    USER: 'fa-solid fa-user',
    USERS: 'fa-solid fa-users',
    KEY: 'fa-solid fa-key',
    NETWORK: 'fa-solid fa-wifi',
    SIGNAL: 'fa-solid fa-signal',

    // === Media ===
    VOLUME_HIGH: 'fa-solid fa-volume-high',
    VOLUME_LOW: 'fa-solid fa-volume-low',
    VOLUME_OFF: 'fa-solid fa-volume-xmark',
    VOLUME_MUTE: 'fa-solid fa-volume-xmark',
    MUSIC: 'fa-solid fa-music',
    HEADPHONES: 'fa-solid fa-headphones',
    MICROPHONE: 'fa-solid fa-microphone',
    SPEAKER: 'fa-solid fa-volume-high',

    // === Navigation ===
    HOME: 'fa-solid fa-house',
    BACK: 'fa-solid fa-arrow-left',
    FORWARD: 'fa-solid fa-arrow-right',
    UP: 'fa-solid fa-arrow-up',
    DOWN: 'fa-solid fa-arrow-down',
    EXPAND: 'fa-solid fa-chevron-down',
    COLLAPSE: 'fa-solid fa-chevron-up',
    MENU: 'fa-solid fa-bars',
    ARROW_RIGHT: 'fa-solid fa-chevron-right',

    // === UI Elements ===
    CHECK: 'fa-solid fa-check',
    PLUS: 'fa-solid fa-plus',
    MINUS: 'fa-solid fa-minus',
    STAR: 'fa-solid fa-star',
    HEART: 'fa-solid fa-heart',
    FLAG: 'fa-solid fa-flag',
    PIN: 'fa-solid fa-thumbtack',
    LINK: 'fa-solid fa-link',
    EXTERNAL_LINK: 'fa-solid fa-arrow-up-right-from-square',
    DOWNLOAD: 'fa-solid fa-download',
    UPLOAD: 'fa-solid fa-upload',

    // === Tools ===
    WRENCH: 'fa-solid fa-wrench',
    HAMMER: 'fa-solid fa-hammer',
    SCREWDRIVER: 'fa-solid fa-screwdriver',
    TOOLS: 'fa-solid fa-screwdriver-wrench',
    COG: 'fa-solid fa-cog',
    DEFRAG: 'fa-solid fa-hard-drive',

    // === Misc ===
    TROPHY: 'fa-solid fa-trophy',
    ACHIEVEMENT: 'fa-solid fa-award',
    BADGE: 'fa-solid fa-certificate',
    CLIPBOARD: 'fa-solid fa-clipboard',
    PAPERCLIP: 'fa-solid fa-paperclip',
    WINDOW: 'fa-solid fa-window-maximize',
    WINDOWS: 'fa-brands fa-windows',
    GLOBE: 'fa-solid fa-globe',
    INTERNET: 'fa-solid fa-globe',
    CD: 'fa-solid fa-compact-disc',
    DATABASE: 'fa-solid fa-database',
    SERVER: 'fa-solid fa-server',
    CHART: 'fa-solid fa-chart-bar',
    CHART_LINE: 'fa-solid fa-chart-line',

    // === Categories (for Start Menu) ===
    CATEGORY_ACCESSORIES: 'fa-solid fa-file-lines',
    CATEGORY_GAMES: 'fa-solid fa-gamepad',
    CATEGORY_MULTIMEDIA: 'fa-solid fa-music',
    CATEGORY_INTERNET: 'fa-solid fa-globe',
    CATEGORY_SYSTEM_TOOLS: 'fa-solid fa-screwdriver-wrench',
    CATEGORY_SETTINGS: 'fa-solid fa-gear',
    CATEGORY_SYSTEM: 'fa-solid fa-desktop',
};

// ============================================
// Emoji Mappings (for fallback and special cases)
// ============================================

export const Emojis = {
    // === Apps ===
    COMPUTER: '💻',
    MY_COMPUTER: '🖥️',
    TERMINAL: '📟',
    NOTEPAD: '📝',
    PAINT: '🖌️',
    CALCULATOR: '🔢',
    BROWSER: '🌐',
    MEDIA_PLAYER: '▶️',
    WINAMP: '🎧',
    CALENDAR: '📅',
    CLOCK: '🕐',
    HELP: '❓',
    RECYCLE_BIN: '🗑️',
    CONTROL_PANEL: '🎛️',
    DISPLAY: '🖥️',
    SOUND_SETTINGS: '🔊',
    ADMIN_PANEL: '⚙️',
    TASK_MANAGER: '📊',
    CHAT_ROOM: '💬',
    INBOX: '📧',
    ENVELOPE: '📧',
    ENVELOPE_OPEN: '📨',
    MAIL: '📧',

    // === Games ===
    GAME: '🎮',
    SOLITAIRE: '🃏',
    MINESWEEPER: '💣',
    SNAKE: '🐍',
    ASTEROIDS: '🚀',
    DOOM: '👹',
    SKI_FREE: '⛷️',
    FREECELL: '🃏',

    // === Files & Folders ===
    FOLDER: '📁',
    FOLDER_OPEN: '📂',
    FILE: '📄',
    FILE_TEXT: '📝',
    FILE_IMAGE: '🖼️',
    FILE_AUDIO: '🎵',
    FILE_VIDEO: '🎬',
    FILE_CODE: '💻',
    FILE_ARCHIVE: '📦',
    FILE_EXE: '⚙️',
    FILE_UNKNOWN: '📄',
    FILE_PDF: '📕',
    FILE_LOG: '📋',

    // === Actions ===
    SAVE: '💾',
    OPEN: '📂',
    NEW: '📄',
    DELETE: '🗑️',
    COPY: '📋',
    CUT: '✂️',
    PASTE: '📋',
    UNDO: '↩️',
    REDO: '↪️',
    SEARCH: '🔍',
    FIND: '🔍',
    REFRESH: '🔄',
    CLOSE: '❌',
    MINIMIZE: '➖',
    MAXIMIZE: '⬜',
    RESTORE: '🗗',
    PLAY: '▶️',
    PAUSE: '⏸️',
    STOP: '⏹️',
    RUN: '▶️',

    // === Status ===
    INFO: 'ℹ️',
    WARNING: '⚠️',
    ERROR: '❌',
    SUCCESS: '✅',
    QUESTION: '❓',
    LOADING: '⏳',

    // === System ===
    SETTINGS: '⚙️',
    POWER: '⏻',
    SHUTDOWN: '⏻',
    RESTART: '🔄',
    LOCK: '🔐',
    UNLOCK: '🔓',
    USER: '👤',
    USERS: '👥',
    KEY: '🗝️',
    NETWORK: '📶',
    SIGNAL: '📶',

    // === Media ===
    VOLUME_HIGH: '🔊',
    VOLUME_LOW: '🔉',
    VOLUME_OFF: '🔇',
    VOLUME_MUTE: '🔇',
    MUSIC: '🎵',
    HEADPHONES: '🎧',
    MICROPHONE: '🎤',
    SPEAKER: '🔊',

    // === Navigation ===
    HOME: '🏠',
    BACK: '⬅️',
    FORWARD: '➡️',
    UP: '⬆️',
    DOWN: '⬇️',
    EXPAND: '🔽',
    COLLAPSE: '🔼',
    MENU: '☰',
    ARROW_RIGHT: '▶',

    // === UI Elements ===
    CHECK: '✔️',
    PLUS: '➕',
    MINUS: '➖',
    STAR: '⭐',
    HEART: '❤️',
    FLAG: '🚩',
    PIN: '📌',
    LINK: '🔗',
    EXTERNAL_LINK: '↗️',
    DOWNLOAD: '⬇️',
    UPLOAD: '⬆️',

    // === Tools ===
    WRENCH: '🔧',
    HAMMER: '🔨',
    SCREWDRIVER: '🪛',
    TOOLS: '🔧',
    COG: '⚙️',
    DEFRAG: '💿',

    // === Misc ===
    TROPHY: '🏆',
    ACHIEVEMENT: '🏆',
    BADGE: '🎖️',
    CLIPBOARD: '📋',
    PAPERCLIP: '📎',
    WINDOW: '🪟',
    WINDOWS: '🪟',
    GLOBE: '🌐',
    INTERNET: '🌀',
    CD: '💿',
    DATABASE: '🗄️',
    SERVER: '🖥️',
    CHART: '📊',
    CHART_LINE: '📈',

    // === Categories (for Start Menu) ===
    CATEGORY_ACCESSORIES: '📝',
    CATEGORY_GAMES: '🎮',
    CATEGORY_MULTIMEDIA: '🎵',
    CATEGORY_INTERNET: '🌐',
    CATEGORY_SYSTEM_TOOLS: '🔧',
    CATEGORY_SETTINGS: '⚙️',
    CATEGORY_SYSTEM: '💻',

    // === Special (keep as emoji always) ===
    PET_DOG: '🐕',
    PET_CAT: '🐈',
    PET_RABBIT: '🐇',
    PET_HAMSTER: '🐹',
    PET_BIRD: '🐦',
    PET_FISH: '🐟',
    PET_TURTLE: '🐢',
    PET_UNICORN: '🦄',
    CLIPPY: '📎',
    TOASTER: '🍞',
};

// ============================================
// ARIA Labels for Accessibility
// ============================================

export const IconLabels = {
    COMPUTER: 'Computer',
    MY_COMPUTER: 'My Computer',
    TERMINAL: 'Terminal',
    NOTEPAD: 'Notepad',
    PAINT: 'Paint',
    CALCULATOR: 'Calculator',
    BROWSER: 'Web Browser',
    FOLDER: 'Folder',
    FILE: 'File',
    SAVE: 'Save',
    DELETE: 'Delete',
    SETTINGS: 'Settings',
    SEARCH: 'Search',
    // ... add more as needed
};

// ============================================
// Configuration
// ============================================

/**
 * Global configuration for the icon system
 */
export const IconConfig = {
    /** Use FontAwesome by default (false = use emojis) */
    useFontAwesome: true,

    /** Default CSS class for icons */
    baseClass: 'retro-icon',

    /** Icons that should always render as emoji */
    alwaysEmoji: [
        'PET_DOG', 'PET_CAT', 'PET_RABBIT', 'PET_HAMSTER',
        'PET_BIRD', 'PET_FISH', 'PET_TURTLE', 'PET_UNICORN',
        'CLIPPY', 'TOASTER'
    ],
};

// ============================================
// Icon Rendering Functions
// ============================================

/**
 * Get the FontAwesome class for an icon
 * @param {string} name - Icon name (e.g., 'FOLDER', 'TERMINAL')
 * @returns {string} FontAwesome class string
 */
export function getIconClass(name) {
    const upperName = name?.toUpperCase().replace(/-/g, '_');
    return Icons[upperName] || Icons.FILE;
}

/**
 * Get the emoji for an icon
 * @param {string} name - Icon name (e.g., 'FOLDER', 'TERMINAL')
 * @returns {string} Emoji character
 */
export function getEmoji(name) {
    const upperName = name?.toUpperCase().replace(/-/g, '_');
    return Emojis[upperName] || Emojis.FILE || '📄';
}

/**
 * Render an icon as HTML
 * @param {string} name - Icon name (e.g., 'FOLDER', 'TERMINAL')
 * @param {Object} options - Rendering options
 * @param {boolean} options.emoji - Force emoji rendering
 * @param {string} options.class - Additional CSS classes
 * @param {string} options.size - Size variant (sm, lg, xl, 2x, 3x)
 * @param {string} options.label - ARIA label for accessibility
 * @param {string} options.color - Custom color (CSS value)
 * @param {boolean} options.spin - Add spin animation
 * @param {boolean} options.pulse - Add pulse animation
 * @returns {string} HTML string for the icon
 */
export function icon(name, options = {}) {
    const upperName = name?.toUpperCase().replace(/-/g, '_');

    // Check if this icon should always be emoji
    const forceEmoji = options.emoji || IconConfig.alwaysEmoji.includes(upperName);

    // Sanitize options to prevent XSS
    const safeClass = options.class && /^[a-zA-Z0-9_ -]+$/.test(options.class) ? options.class : '';
    const safeColor = options.color ? sanitizeCssColor(options.color) : '';
    const rawLabel = options.label || IconLabels[upperName] || name || '';
    const safeLabel = escapeHtml(rawLabel);

    // Emoji mode
    if (forceEmoji || !IconConfig.useFontAwesome) {
        const emoji = Emojis[upperName] || Emojis.FILE || '📄';
        const classes = ['retro-icon-emoji'];
        if (safeClass) classes.push(safeClass);
        if (options.size) classes.push(`retro-icon--${options.size}`);

        const style = safeColor ? ` style="color: ${safeColor}"` : '';

        return `<span class="${classes.join(' ')}" role="img" aria-label="${safeLabel}"${style}>${emoji}</span>`;
    }

    // FontAwesome mode
    const faClass = Icons[upperName] || Icons.FILE;
    const classes = [faClass, IconConfig.baseClass];

    if (safeClass) classes.push(safeClass);
    if (options.size) classes.push(`fa-${options.size}`);
    if (options.spin) classes.push('fa-spin');
    if (options.pulse) classes.push('fa-pulse');

    const style = safeColor ? ` style="color: ${safeColor}"` : '';

    return `<i class="${classes.join(' ')}" role="img" aria-label="${safeLabel}"${style}></i>`;
}

/**
 * Create an icon with a specific size
 * @param {string} name - Icon name
 * @param {string} size - Size (sm, lg, xl, 2x, 3x)
 * @returns {string} HTML string for the icon
 */
export function iconSized(name, size) {
    return icon(name, { size });
}

/**
 * Create an emoji icon
 * @param {string} name - Icon name
 * @param {Object} options - Additional options
 * @returns {string} HTML string for emoji
 */
export function emoji(name, options = {}) {
    return icon(name, { ...options, emoji: true });
}

/**
 * Get icon or emoji based on type
 * Helper function for app icons that may be custom emojis or standard icons
 * @param {string} iconValue - Either an icon name (e.g., 'FOLDER') or emoji character
 * @param {Object} options - Rendering options
 * @returns {string} HTML string for the icon
 */
export function renderIcon(iconValue, options = {}) {
    // Check if it's an emoji (single character or emoji sequence)
    if (iconValue && isEmoji(iconValue)) {
        const classes = ['retro-icon-emoji'];
        if (options.class) classes.push(options.class);
        if (options.size) classes.push(`retro-icon--${options.size}`);
        return `<span class="${classes.join(' ')}" role="img" aria-label="${escapeHtml(options.label || 'icon')}">${iconValue}</span>`;
    }

    // Try to find it in our icon system
    const upperName = iconValue?.toUpperCase().replace(/-/g, '_');
    if (Icons[upperName]) {
        return icon(iconValue, options);
    }

    // If it looks like a FA class, use it directly — but only with safe
    // class characters, and escape the label (attribute context).
    if (iconValue && iconValue.includes('fa-') && /^[a-zA-Z0-9_ -]+$/.test(iconValue)) {
        const classes = [iconValue, IconConfig.baseClass];
        if (options.class) classes.push(options.class);
        return `<i class="${classes.join(' ')}" role="img" aria-label="${escapeHtml(options.label || 'icon')}"></i>`;
    }

    // Fallback to displaying as-is (might be an emoji) — escaped, since
    // callers interpolate this return value into innerHTML.
    return iconValue ? escapeHtml(iconValue) : '';
}

/**
 * Check if a string is an emoji
 * @param {string} str - String to check
 * @returns {boolean} True if the string appears to be an emoji
 */
export function isEmoji(str) {
    if (!str || typeof str !== 'string') return false;

    // Emoji regex pattern (covers most emoji ranges)
    const emojiRegex = /^(?:[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDDFF]|[\uFE00-\uFE0F]|\u200D)+$/;

    // Also check for single emoji characters and common symbols
    const cleaned = str.replace(/\uFE0F/g, ''); // Remove variation selectors
    return emojiRegex.test(cleaned) ||
           (cleaned.length <= 4 && /[\u{1F300}-\u{1F9FF}]/u.test(cleaned));
}

// ============================================
// Utility Functions
// ============================================

/**
 * Set global icon mode
 * @param {boolean} useFontAwesome - True for FontAwesome, false for emojis
 */
export function setIconMode(useFontAwesome) {
    IconConfig.useFontAwesome = useFontAwesome;
}

/**
 * Get current icon mode
 * @returns {boolean} True if using FontAwesome
 */
export function getIconMode() {
    return IconConfig.useFontAwesome;
}

/**
 * Toggle between FontAwesome and emoji mode
 * @returns {boolean} New mode (true = FontAwesome)
 */
export function toggleIconMode() {
    IconConfig.useFontAwesome = !IconConfig.useFontAwesome;
    return IconConfig.useFontAwesome;
}

/**
 * Register a custom icon at runtime (for plugins).
 * @param {string} name - Icon name (e.g., 'MY_PLUGIN_ICON')
 * @param {{ faClass?: string, emoji?: string, label?: string }} options
 */
export function registerCustomIcon(name, { faClass, emoji: emojiChar, label } = {}) {
    const upperName = name?.toUpperCase().replace(/-/g, '_');
    if (!upperName) {
        console.error('[IconSystem] registerCustomIcon requires a name');
        return;
    }
    if (faClass) Icons[upperName] = faClass;
    if (emojiChar) Emojis[upperName] = emojiChar;
    if (label) IconLabels[upperName] = label;
}

// ============================================
// Default Export
// ============================================

export default {
    Icons,
    Emojis,
    IconLabels,
    IconConfig,
    icon,
    iconSized,
    emoji,
    renderIcon,
    getIconClass,
    getEmoji,
    isEmoji,
    setIconMode,
    getIconMode,
    toggleIconMode,
    registerCustomIcon,
};
