/**
 * ContextMenuRenderer - Manages all context menus
 * Singleton pattern with proper event cleanup
 */

import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import AppRegistry from '../apps/AppRegistry.js';
import WindowManager from '../core/WindowManager.js';
import FileSystemManager from '../core/FileSystemManager.js';
import SystemDialogs from '../features/SystemDialogs.js';
import { PATHS } from '../core/Constants.js';
import { escapeHtml } from '../core/Sanitize.js';
import { getNextDesktopSlot } from '../core/DesktopLayout.js';
const debugLog = (...args) => {
    if (window.__RETRO_OS_DEBUG__ === true) {
        console.log(...args);
    }
};


class ContextMenuRendererClass {
    constructor() {
        this.element = null;
        this.currentContext = null;
        this.initialized = false;

        // Plugin-registered custom menu items, keyed by menu type
        this._customMenuItems = new Map();

        // Clipboard for Copy/Cut/Paste operations
        this.clipboard = {
            items: [],      // Array of { path: [], name: '', type: 'file'|'directory' }
            operation: null // 'copy' or 'cut'
        };

        // Track paths of items that are cut (for visual feedback)
        this.cutItemPaths = [];

        // Bound handlers for cleanup capability
        this.boundHandleOutsideClick = this.handleOutsideClick.bind(this);
        this.boundHandleEscape = this.handleEscape.bind(this);
        this.boundHandleMenuClick = this.handleMenuClick.bind(this);
    }

    /**
     * Register a custom context menu item for a specific menu type.
     * Plugins can call this to add actions to context menus.
     * @param {string} menuType - Menu type: 'desktop', 'icon', 'taskbar'
     * @param {{ id: string, label: string, handler: Function }} item
     */
    registerMenuItem(menuType, item) {
        if (!item || !item.id || !item.label) {
            console.error('[ContextMenuRenderer] registerMenuItem requires { id, label, handler }');
            return;
        }
        if (!this._customMenuItems.has(menuType)) {
            this._customMenuItems.set(menuType, []);
        }
        const items = this._customMenuItems.get(menuType);
        if (!items.find(i => i.id === item.id)) {
            items.push(item);
        }
    }

    /**
     * Render custom menu items for a given menu type.
     * @param {string} menuType
     * @returns {string} HTML string
     * @private
     */
    _renderCustomItems(menuType) {
        const items = this._customMenuItems.get(menuType) || [];
        if (items.length === 0) return '';
        return `<div class="context-divider"></div>` +
            items.map(item =>
                `<div class="context-item" data-action="${escapeHtml(item.id)}">${escapeHtml(item.label)}</div>`
            ).join('');
    }

    initialize() {
        if (this.initialized) {
            console.warn('[ContextMenuRenderer] Already initialized');
            return;
        }

        this.element = document.getElementById('contextMenu');
        if (!this.element) {
            console.error('[ContextMenuRenderer] Menu element not found');
            return;
        }

        // Close on click outside - using bound handler
        document.addEventListener('click', this.boundHandleOutsideClick);

        // Close on escape - using bound handler
        document.addEventListener('keydown', this.boundHandleEscape);

        // Use event delegation for menu items - single handler for all clicks
        this.element.addEventListener('click', this.boundHandleMenuClick);

        // Listen for show events - pass through all context data for various menu types
        EventBus.on(Events.CONTEXT_MENU_SHOW, ({ x, y, type, icon, windowId, item, currentPath }) => {
            this.show(x, y, type, { icon, windowId, item, currentPath });
        });

        // Listen for desktop actions
        EventBus.on('desktop:arrange', () => {
            import('./DesktopRenderer.js').then(m => m.default.arrangeIcons());
        });
        EventBus.on('desktop:refresh', () => {
            import('./DesktopRenderer.js').then(m => m.default.refresh());
        });

        this.initialized = true;
        debugLog('[ContextMenuRenderer] Initialized');
    }

    /**
     * Handle click outside menu
     */
    handleOutsideClick(e) {
        if (this.element && !this.element.contains(e.target)) {
            this.hide();
        }
    }

    /**
     * Handle escape key
     */
    handleEscape(e) {
        if (e.key === 'Escape') this.hide();
    }

    /**
     * Handle menu item clicks via event delegation
     */
    handleMenuClick(e) {
        const item = e.target.closest('[data-action]');
        if (item) {
            // Don't trigger action for disabled items
            if (item.classList.contains('disabled')) {
                e.stopPropagation();
                return;
            }
            e.stopPropagation();
            this.handleAction(item.dataset.action);
        }
    }

    /**
     * Cleanup all event listeners
     */
    destroy() {
        if (!this.initialized) return;

        document.removeEventListener('click', this.boundHandleOutsideClick);
        document.removeEventListener('keydown', this.boundHandleEscape);

        if (this.element) {
            this.element.removeEventListener('click', this.boundHandleMenuClick);
        }

        this.initialized = false;
        debugLog('[ContextMenuRenderer] Destroyed');
    }

    show(x, y, type, context = {}) {
        debugLog('[ContextMenu] show() called with:', { x, y, type, context });
        debugLog('[ContextMenu] context.icon:', context.icon);
        debugLog('[ContextMenu] context.icon?.type:', context.icon?.type);
        debugLog('[ContextMenu] context.icon?.filePath:', context.icon?.filePath);

        if (!this.element) {
            console.error('[ContextMenu] ERROR: Menu element not found!');
            return;
        }

        this.currentContext = { type, ...context };
        debugLog('[ContextMenu] currentContext set to:', this.currentContext);

        // Generate menu
        debugLog('[ContextMenu] Generating menu for type:', type);
        const menuHTML = this.generateMenu(type, context);
        debugLog('[ContextMenu] Generated menu HTML length:', menuHTML?.length);
        this.element.innerHTML = menuHTML;
        
        // Position (keep on screen, accounting for taskbar height)
        const taskbarHeight = 36;
        this.element.style.visibility = 'hidden';
        this.element.classList.add('active');
        const menuRect = this.element.getBoundingClientRect();
        const menuWidth = menuRect.width || 200;
        const menuHeight = menuRect.height || 200;
        x = Math.min(x, window.innerWidth - menuWidth - 4);
        y = Math.min(y, window.innerHeight - taskbarHeight - menuHeight - 4);
        x = Math.max(0, x);
        y = Math.max(0, y);

        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
        this.element.style.visibility = '';
        // Event delegation handles clicks - no need for attachHandlers
    }

    hide() {
        if (this.element) {
            this.element.classList.remove('active');
        }
        this.currentContext = null;
    }

    generateMenu(type, context) {
        debugLog('[ContextMenu] generateMenu() type:', type);
        let result;
        switch (type) {
            case 'desktop':
                debugLog('[ContextMenu] -> Calling desktopMenu()');
                result = this.desktopMenu();
                break;
            case 'icon':
                debugLog('[ContextMenu] -> Calling iconMenu() with icon:', context?.icon);
                result = this.iconMenu(context);
                break;
            case 'taskbar':
                result = this.taskbarMenu(context);
                break;
            // MyComputer file explorer context menus
            case 'explorer-file':
                debugLog('[ContextMenu] -> Calling explorerFileMenu() with item:', context?.item);
                result = this.explorerFileMenu(context);
                break;
            case 'explorer-folder':
                debugLog('[ContextMenu] -> Calling explorerFolderMenu()');
                result = this.explorerFolderMenu(context);
                break;
            case 'explorer-drive':
                result = this.explorerDriveMenu(context);
                break;
            case 'explorer-empty':
                debugLog('[ContextMenu] -> Calling explorerEmptyMenu(), clipboard:', this.clipboard);
                result = this.explorerEmptyMenu(context);
                break;
            case 'explorer-system-folder':
                result = this.explorerSystemFolderMenu(context);
                break;
            default:
                debugLog('[ContextMenu] -> Unknown type, defaulting to desktopMenu()');
                result = this.desktopMenu();
        }
        return result;
    }

    desktopMenu() {
        // Only count valid file items (with path), not shortcut items
        const fileItems = this.clipboard.items.filter(item => item.path && Array.isArray(item.path));
        const hasPaste = fileItems.length > 0;
        const pasteClass = hasPaste ? '' : 'disabled';

        debugLog('[ContextMenu] desktopMenu - clipboard file items:', fileItems.length);

        return `
            <div class="context-item" data-action="arrange">Arrange Icons</div>
            <div class="context-item" data-action="refresh">Refresh</div>
            <div class="context-divider"></div>
            <div class="context-item ${pasteClass}" data-action="desktop-paste">📋 Paste${hasPaste ? ` (${fileItems.length} item${fileItems.length > 1 ? 's' : ''})` : ''}</div>
            <div class="context-divider"></div>
            <div class="context-item submenu-trigger">
                New
                <span class="submenu-arrow">▶</span>
                <div class="context-submenu">
                    <div class="context-item" data-action="new-folder">📁 Folder</div>
                    <div class="context-divider"></div>
                    <div class="context-item" data-action="new-text">📝 Text Document</div>
                    <div class="context-item" data-action="new-image">🖼️ Bitmap Image</div>
                </div>
            </div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="open-terminal">💻 Open Terminal Here</div>
            ${this._renderCustomItems('desktop')}
            <div class="context-divider"></div>
            <div class="context-item" data-action="properties">Properties</div>
        `;
    }

    iconMenu(context) {
        const icon = context?.icon;

        // Debug logging
        debugLog('[ContextMenu] iconMenu called with icon:', icon);
        debugLog('[ContextMenu] icon.type:', icon?.type, 'icon.filePath:', icon?.filePath);

        // If no icon data, show minimal menu
        if (!icon) {
            debugLog('[ContextMenu] No icon data, showing minimal menu');
            return `
                <div class="context-item" data-action="properties">Properties</div>
            `;
        }

        // Different menu for files vs apps
        // type: 'file' is for file system items (both files and folders from Desktop folder)
        if (icon.type === 'file') {
            debugLog('[ContextMenu] Showing FILE context menu with Cut/Copy');
            const extension = icon.extension || '';
            const isTextFile = ['txt', 'md', 'log', 'retro', 'bat', 'js', 'css', 'html', 'json'].includes(extension);
            const isImageFile = ['png', 'jpg', 'bmp'].includes(extension);

            return `
                <div class="context-item" data-action="open"><strong>Open</strong></div>
                ${isTextFile ? '<div class="context-item" data-action="edit-notepad">📝 Edit with Notepad</div>' : ''}
                ${isImageFile ? '<div class="context-item" data-action="edit-paint">🎨 Edit with Paint</div>' : ''}
                <div class="context-divider"></div>
                <div class="context-item" data-action="desktop-cut">✂️ Cut</div>
                <div class="context-item" data-action="desktop-copy">📋 Copy</div>
                <div class="context-divider"></div>
                <div class="context-item" data-action="rename">✏️ Rename</div>
                <div class="context-item" data-action="delete">🗑️ Delete</div>
                <div class="context-divider"></div>
                <div class="context-item" data-action="properties">Properties</div>
            `;
        }

        // Link icons - web shortcuts (no copy - only files can be copied)
        if (icon.type === 'link') {
            return `
                <div class="context-item" data-action="open"><strong>Open Link</strong></div>
                <div class="context-divider"></div>
                <div class="context-item" data-action="delete">🗑️ Remove from Desktop</div>
                <div class="context-item" data-action="properties">Properties</div>
            `;
        }

        // App icons - application shortcuts (no copy - only files can be copied)
        return `
            <div class="context-item" data-action="open"><strong>Open</strong></div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="delete">Remove from Desktop</div>
            <div class="context-item" data-action="properties">Properties</div>
        `;
    }

    taskbarMenu(context) {
        return `
            <div class="context-item" data-action="restore">Restore</div>
            <div class="context-item" data-action="minimize">Minimize</div>
            <div class="context-item" data-action="maximize">Maximize</div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="close">Close</div>
        `;
    }

    // ===== EXPLORER (MyComputer) CONTEXT MENUS =====

    /**
     * Context menu for files in MyComputer
     */
    explorerFileMenu(context) {
        const item = context.item || {};
        const extension = item.extension || '';
        const isTextFile = ['txt', 'md', 'log', 'json', 'js', 'css', 'html', 'retro', 'bat'].includes(extension);
        const isImageFile = ['png', 'jpg', 'jpeg', 'bmp', 'gif'].includes(extension);
        const isAudioFile = ['mp3', 'wav', 'ogg'].includes(extension);
        const isShortcut = extension === 'lnk';

        let editOptions = '';
        if (isTextFile) {
            editOptions = '<div class="context-item" data-action="explorer-edit-notepad">📝 Edit with Notepad</div>';
        } else if (isImageFile) {
            editOptions = '<div class="context-item" data-action="explorer-edit-paint">🎨 Edit with Paint</div>';
        }

        return `
            <div class="context-item" data-action="explorer-open"><strong>Open</strong></div>
            ${editOptions}
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-cut">✂️ Cut</div>
            <div class="context-item" data-action="explorer-copy">📋 Copy</div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-delete">🗑️ Delete</div>
            <div class="context-item" data-action="explorer-rename">✏️ Rename</div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-properties">📄 Properties</div>
        `;
    }

    /**
     * Context menu for folders/directories in MyComputer
     */
    explorerFolderMenu(context) {
        return `
            <div class="context-item" data-action="explorer-open"><strong>Open</strong></div>
            <div class="context-item" data-action="explorer-open-new">📂 Open in New Window</div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-cut">✂️ Cut</div>
            <div class="context-item" data-action="explorer-copy">📋 Copy</div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-delete">🗑️ Delete</div>
            <div class="context-item" data-action="explorer-rename">✏️ Rename</div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-properties">📄 Properties</div>
        `;
    }

    /**
     * Context menu for drives in MyComputer
     */
    explorerDriveMenu(context) {
        return `
            <div class="context-item" data-action="explorer-open"><strong>Open</strong></div>
            <div class="context-item" data-action="explorer-open-new">📂 Open in New Window</div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-properties">📄 Properties</div>
        `;
    }

    /**
     * Context menu for system folders (My Documents, etc.) in MyComputer root
     */
    explorerSystemFolderMenu(context) {
        return `
            <div class="context-item" data-action="explorer-open"><strong>Open</strong></div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-properties">📄 Properties</div>
        `;
    }

    /**
     * Context menu for empty space in MyComputer (inside a folder)
     */
    explorerEmptyMenu(context) {
        // Only count valid file items (with path)
        const fileItems = this.clipboard.items.filter(item => item.path && Array.isArray(item.path));
        const hasPaste = fileItems.length > 0;
        const pasteClass = hasPaste ? '' : 'disabled';

        debugLog('[ContextMenu] explorerEmptyMenu - clipboard file items:', fileItems.length);

        return `
            <div class="context-item submenu-trigger">
                📁 New
                <span class="submenu-arrow">▶</span>
                <div class="context-submenu">
                    <div class="context-item" data-action="explorer-new-folder">📁 Folder</div>
                    <div class="context-divider"></div>
                    <div class="context-item" data-action="explorer-new-text">📝 Text Document</div>
                    <div class="context-item" data-action="explorer-new-image">🖼️ Bitmap Image</div>
                </div>
            </div>
            <div class="context-divider"></div>
            <div class="context-item ${pasteClass}" data-action="explorer-paste">📋 Paste${hasPaste ? ` (${fileItems.length} item${fileItems.length > 1 ? 's' : ''})` : ''}</div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-upload">📤 Upload File...</div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-refresh">🔄 Refresh</div>
            <div class="context-divider"></div>
            <div class="context-item" data-action="explorer-properties">📄 Properties</div>
        `;
    }

    handleAction(action) {
        debugLog('[ContextMenu] handleAction() called with action:', action);
        const context = this.currentContext;
        debugLog('[ContextMenu] Current context:', context);
        this.hide();

        const desktopPath = [...PATHS.DESKTOP];

        switch (action) {
            case 'arrange':
                EventBus.emit('desktop:arrange');
                break;
            case 'refresh':
                EventBus.emit('desktop:refresh');
                break;
            case 'new-folder':
                this.createNewFolder(desktopPath);
                break;
            case 'new-text':
                this.createNewTextFile(desktopPath);
                break;
            case 'new-image':
                AppRegistry.launch('paint');
                break;
            case 'open-terminal':
                AppRegistry.launch('terminal');
                break;
            case 'properties':
                AppRegistry.launch('display');
                break;
            case 'open':
                if (context?.icon) {
                    if (context.icon.type === 'link') {
                        AppRegistry.launch('browser', { url: context.icon.url });
                    } else if (context.icon.type === 'file') {
                        // Open file in appropriate app
                        this.openFileIcon(context.icon);
                    } else {
                        AppRegistry.launch(context.icon.id);
                    }
                }
                break;
            case 'edit-notepad':
                if (context?.icon?.filePath) {
                    AppRegistry.launch('notepad', { filePath: context.icon.filePath });
                }
                break;
            case 'edit-paint':
                if (context?.icon?.filePath) {
                    AppRegistry.launch('paint', { filePath: context.icon.filePath });
                }
                break;
            case 'rename':
                if (context?.icon?.type === 'file') {
                    this.renameFileIcon(context.icon);
                }
                break;
            case 'delete':
                if (context?.icon) {
                    // If it's a file from the filesystem, delete it
                    if (context.icon.type === 'file' && context.icon.filePath) {
                        this.deleteFileIcon(context.icon);
                    } else {
                        StateManager.recycleIcon(context.icon.id);
                    }
                    EventBus.emit('desktop:render');
                }
                break;

            // ===== DESKTOP FILE CLIPBOARD ACTIONS =====
            case 'desktop-cut':
                this.handleDesktopCut(context);
                break;
            case 'desktop-copy':
                this.handleDesktopCopy(context);
                break;
            case 'desktop-paste':
                this.handleDesktopPaste(context);
                break;

            case 'restore':
                if (context?.windowId) WindowManager.restore(context.windowId);
                break;
            case 'minimize':
                if (context?.windowId) WindowManager.minimize(context.windowId);
                break;
            case 'maximize':
                if (context?.windowId) WindowManager.maximize(context.windowId);
                break;
            case 'close':
                if (context?.windowId) WindowManager.close(context.windowId);
                break;

            // ===== EXPLORER (MyComputer) ACTIONS =====
            case 'explorer-open':
                this.handleExplorerOpen(context);
                break;
            case 'explorer-open-new':
                this.handleExplorerOpenNew(context);
                break;
            case 'explorer-edit-notepad':
                if (context?.item?.path) {
                    AppRegistry.launch('notepad', { filePath: context.item.path });
                }
                break;
            case 'explorer-edit-paint':
                if (context?.item?.path) {
                    AppRegistry.launch('paint', { filePath: context.item.path });
                }
                break;
            case 'explorer-cut':
                this.handleExplorerCut(context);
                break;
            case 'explorer-copy':
                this.handleExplorerCopy(context);
                break;
            case 'explorer-paste':
                this.handleExplorerPaste(context);
                break;
            case 'explorer-delete':
                this.handleExplorerDelete(context);
                break;
            case 'explorer-rename':
                this.handleExplorerRename(context);
                break;
            case 'explorer-new-folder':
                if (context?.currentPath) {
                    this.createNewFolder(context.currentPath);
                    EventBus.emit('filesystem:changed');
                }
                break;
            case 'explorer-new-text':
                if (context?.currentPath) {
                    this.createNewTextFile(context.currentPath);
                    EventBus.emit('filesystem:changed');
                }
                break;
            case 'explorer-new-image':
                AppRegistry.launch('paint');
                break;
            case 'explorer-upload':
                EventBus.emit('explorer:upload', { currentPath: context?.currentPath });
                break;
            case 'explorer-refresh':
                EventBus.emit('filesystem:changed');
                break;
            case 'explorer-properties':
                this.handleExplorerProperties(context);
                break;
            default: {
                // Check plugin-registered custom actions
                let handled = false;
                for (const [, items] of this._customMenuItems) {
                    const customItem = items.find(i => i.id === action);
                    if (customItem && typeof customItem.handler === 'function') {
                        customItem.handler(context);
                        handled = true;
                        break;
                    }
                }
                if (!handled) {
                    debugLog('[ContextMenu] Unknown action:', action);
                }
                break;
            }
        }
    }

    // ===== EXPLORER ACTION HANDLERS =====

    handleExplorerOpen(context) {
        const item = context?.item;
        if (!item) return;

        if (item.type === 'directory' && item.path) {
            // Navigate to folder in current window
            EventBus.emit('mycomputer:navigate', { path: item.path });
        } else if (item.type === 'drive' && item.driveLetter) {
            EventBus.emit('mycomputer:navigate', { path: [item.driveLetter] });
        } else if (item.type === 'system-folder' && item.appId) {
            AppRegistry.launch(item.appId);
        } else if (item.type === 'file' && item.path) {
            // Open file with appropriate app
            const ext = item.extension || '';
            if (['txt', 'md', 'log', 'json', 'js', 'css', 'html', 'retro', 'bat', 'ini', 'cfg', 'xml', 'csv'].includes(ext)) {
                AppRegistry.launch('notepad', { filePath: item.path });
            } else if (['png', 'jpg', 'jpeg', 'bmp', 'gif', 'ico', 'webp', 'svg', 'tif', 'tiff'].includes(ext)) {
                AppRegistry.launch('paint', { filePath: item.path });
            } else if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'mid', 'midi', 'mp4', 'avi', 'mkv', 'webm', 'ogv', 'mov'].includes(ext)) {
                AppRegistry.launch('mediaplayer', { filePath: item.path });
            } else if (ext === 'lnk') {
                // Handle shortcut
                this.openShortcut(item.path);
            } else {
                // Default to notepad for unknown types
                AppRegistry.launch('notepad', { filePath: item.path });
            }
        } else if (item.type === 'shortcut' && item.shortcutData) {
            if (item.shortcutData.type === 'link') {
                AppRegistry.launch('browser', { url: item.shortcutData.target });
            } else {
                AppRegistry.launch(item.shortcutData.target);
            }
        } else if (item.type === 'executable' && item.shortcutData?.appId) {
            AppRegistry.launch(item.shortcutData.appId);
        }
    }

    handleExplorerOpenNew(context) {
        const item = context?.item;
        if (!item) return;

        if (item.type === 'directory' && item.path) {
            // Open in new MyComputer window - force new window by using different params
            AppRegistry.launch('mycomputer', { initialPath: item.path, newWindow: true });
        } else if (item.type === 'drive' && item.driveLetter) {
            AppRegistry.launch('mycomputer', { initialPath: [item.driveLetter], newWindow: true });
        }
    }

    handleExplorerCut(context) {
        debugLog('[ContextMenu] handleExplorerCut() called with context:', context);
        const item = context?.item;
        if (!item?.path) {
            console.error('[ContextMenu] ERROR: No item path in context!');
            return;
        }

        this.clipboard = {
            items: [{
                path: item.path,
                name: item.name,
                type: item.type
            }],
            operation: 'cut'
        };

        // Track cut items for visual feedback
        this.cutItemPaths = [JSON.stringify(item.path)];

        debugLog('[ContextMenu] Explorer Cut SUCCESS:', item.path.join('/'));
        EventBus.emit('clipboard:changed', { operation: 'cut', count: 1 });
        EventBus.emit('clipboard:cut-state', { cutPaths: this.cutItemPaths });
    }

    handleExplorerCopy(context) {
        debugLog('[ContextMenu] handleExplorerCopy() called with context:', context);
        const item = context?.item;
        if (!item?.path) {
            console.error('[ContextMenu] ERROR: No item path in context!');
            return;
        }

        // Clear any existing cut state (copy replaces cut)
        this.clearCutState();

        this.clipboard = {
            items: [{
                path: item.path,
                name: item.name,
                type: item.type
            }],
            operation: 'copy'
        };
        debugLog('[ContextMenu] Explorer Copy SUCCESS:', item.path.join('/'));
        EventBus.emit('clipboard:changed', { operation: 'copy', count: 1 });
    }

    async handleExplorerPaste(context) {
        debugLog('[ContextMenu] handleExplorerPaste() called');
        debugLog('[ContextMenu] Current clipboard:', this.clipboard);
        debugLog('[ContextMenu] Context:', context);

        if (this.clipboard.items.length === 0) {
            debugLog('[ContextMenu] Clipboard is empty, nothing to paste');
            return;
        }

        const targetPath = context?.currentPath;
        debugLog('[ContextMenu] Target path:', targetPath);

        if (!targetPath || targetPath.length === 0) {
            console.error('[ContextMenu] ERROR: No target path for paste');
            await SystemDialogs.alert('Cannot paste here. Please navigate to a folder first.', 'Paste Error', 'error');
            return;
        }

        try {
            for (const item of this.clipboard.items) {
                // Validate clipboard item has valid path data
                if (!item.path || !Array.isArray(item.path)) {
                    debugLog('[ContextMenu] Skipping invalid clipboard item');
                    continue;
                }

                const sourcePath = item.path;
                const fileName = item.name;

                debugLog('[ContextMenu] Processing:', fileName, 'from:', sourcePath.join('/'));

                // Check if pasting to same location
                const sourceDir = sourcePath.slice(0, -1);
                if (JSON.stringify(sourceDir) === JSON.stringify(targetPath)) {
                    if (this.clipboard.operation === 'cut') {
                        // Can't cut/paste to same location
                        debugLog('[ContextMenu] Skipping cut to same location');
                        continue;
                    }
                    // For copy, create a copy with modified name
                    const newName = await this.generateCopyName(targetPath, fileName);
                    const newPath = [...targetPath, newName];
                    debugLog('[ContextMenu] Copying to same location with new name:', newName);

                    if (item.type === 'directory') {
                        this.copyDirectory(sourcePath, newPath);
                    } else {
                        this.copyFile(sourcePath, newPath);
                    }
                } else {
                    // Paste to different location
                    debugLog('[ContextMenu] Pasting to:', targetPath.join('/'));
                    if (this.clipboard.operation === 'cut') {
                        FileSystemManager.moveItem(sourcePath, targetPath);
                    } else {
                        // Copy to target
                        const destPath = [...targetPath, fileName];
                        if (item.type === 'directory') {
                            this.copyDirectory(sourcePath, destPath);
                        } else {
                            this.copyFile(sourcePath, destPath);
                        }
                    }
                }
            }

            // Clear cut visual state after successful paste
            this.clearCutState();

            // Clear clipboard if it was a cut operation
            if (this.clipboard.operation === 'cut') {
                this.clipboard = { items: [], operation: null };
                EventBus.emit('clipboard:changed', { operation: null, count: 0 });
            }

            EventBus.emit('filesystem:changed');

            // Also refresh desktop if pasting to the Desktop folder
            const desktopPath = [...PATHS.DESKTOP];
            if (JSON.stringify(targetPath) === JSON.stringify(desktopPath)) {
                EventBus.emit('desktop:refresh');
            }
        } catch (e) {
            console.error('[ContextMenu] Explorer paste error:', e);
            await SystemDialogs.alert(`Error pasting: ${e.message}`, 'Paste Error', 'error');
        }
    }

    async handleExplorerDelete(context) {
        const item = context?.item;
        if (!item?.path) return;

        const confirmed = await SystemDialogs.confirm(
            `Are you sure you want to send "${item.name}" to the Recycle Bin?`,
            'Confirm Delete'
        );
        if (!confirmed) return;

        try {
            // Store item info for potential restore
            let content = '';
            if (item.type === 'file') {
                try {
                    content = FileSystemManager.readFile(item.path);
                } catch (e) {
                    // File might not be readable
                }
            }

            // Add to recycle bin
            const recycledItem = {
                id: `recycled_${Date.now()}`,
                label: item.name,
                emoji: item.icon || '📄',
                type: 'recycled_file',
                originalPath: item.path,
                fileType: item.type,
                extension: item.extension || '',
                content: content,
                deletedAt: Date.now()
            };

            const recycledItems = StateManager.getState('recycledItems') || [];
            recycledItems.push(recycledItem);
            StateManager.setState('recycledItems', recycledItems, true);

            // Delete from filesystem
            if (item.type === 'directory') {
                try {
                    FileSystemManager.deleteDirectory(item.path, true);
                } catch (e) {
                    console.error('Error deleting directory:', e);
                }
            } else {
                FileSystemManager.deleteFile(item.path);
            }

            EventBus.emit('filesystem:changed');
            EventBus.emit(Events.SOUND_PLAY, { type: 'recycle' });
        } catch (e) {
            await SystemDialogs.alert(`Error deleting: ${e.message}`, 'Delete Error', 'error');
        }
    }

    async handleExplorerRename(context) {
        const item = context?.item;
        if (!item?.path) return;

        const oldName = item.name;
        const newName = await SystemDialogs.prompt(`Rename "${oldName}" to:`, oldName, 'Rename');

        if (!newName || newName === oldName) return;

        try {
            FileSystemManager.renameItem(item.path, newName);
            EventBus.emit('filesystem:changed');
        } catch (e) {
            await SystemDialogs.alert(`Error renaming: ${e.message}`, 'Rename Error', 'error');
        }
    }

    async handleExplorerProperties(context) {
        const item = context?.item;
        let message = '';

        if (item?.path) {
            try {
                const info = FileSystemManager.getInfo(item.path);
                message = `Name: ${item.name}\n`;
                message += `Type: ${item.type === 'directory' ? 'Folder' : 'File'}\n`;
                message += `Location: ${item.path.slice(0, -1).join('\\') || 'Root'}\n`;

                if (info.size !== undefined) {
                    message += `Size: ${FileSystemManager.formatSize(info.size)}\n`;
                }
                if (info.created) {
                    message += `Created: ${new Date(info.created).toLocaleString()}\n`;
                }
                if (info.modified) {
                    message += `Modified: ${new Date(info.modified).toLocaleString()}\n`;
                }
            } catch (e) {
                message = `Name: ${item?.name || 'Unknown'}\nError reading properties: ${e.message}`;
            }
        } else if (context?.currentPath) {
            message = `Location: ${context.currentPath.join('\\') || 'My Computer'}\n`;
            try {
                const items = FileSystemManager.listDirectory(context.currentPath);
                const files = items.filter(i => i.type === 'file').length;
                const folders = items.filter(i => i.type === 'directory').length;
                message += `Contains: ${folders} folder(s), ${files} file(s)`;
            } catch (e) {
                message += 'Unable to read folder contents.';
            }
        } else {
            message = 'My Computer\nSystem Information';
        }

        await SystemDialogs.alert(message, 'Properties', 'info');
    }

    // ===== DESKTOP CLIPBOARD HANDLERS =====

    /**
     * Handle Cut for desktop file icons
     * Note: Cut only works for file icons, not app/link shortcuts (use copy instead)
     */
    handleDesktopCut(context) {
        debugLog('[ContextMenu] handleDesktopCut() called with context:', context);
        const icon = context?.icon;
        if (!icon) {
            console.error('[ContextMenu] ERROR: No icon in context!');
            return;
        }

        // Only allow cutting file icons (files/folders on desktop)
        // App and link shortcuts should only be copied, not cut
        if (icon.type !== 'file' || !icon.filePath) {
            console.error('[ContextMenu] ERROR: Cut only works for file icons:', { icon, type: icon?.type, filePath: icon?.filePath });
            return;
        }

        this.clipboard = {
            items: [{
                path: icon.filePath,
                name: icon.label || icon.filePath[icon.filePath.length - 1],
                type: icon.fileType || 'file'
            }],
            operation: 'cut'
        };

        // Track cut items for visual feedback
        this.cutItemPaths = [JSON.stringify(icon.filePath)];

        debugLog('[ContextMenu] Desktop Cut SUCCESS:', icon.filePath.join('/'));
        EventBus.emit('clipboard:changed', { operation: 'cut', count: 1 });
        EventBus.emit('clipboard:cut-state', { cutPaths: this.cutItemPaths });
    }

    /**
     * Handle Copy for desktop file icons
     * Note: Only files can be copied, not apps or link shortcuts
     */
    handleDesktopCopy(context) {
        debugLog('[ContextMenu] handleDesktopCopy() called with context:', context);
        const icon = context?.icon;
        if (!icon) {
            console.error('[ContextMenu] ERROR: No icon in context!');
            return;
        }

        // Only allow copying file icons (files/folders from Desktop folder)
        // Apps and link shortcuts cannot be copied
        if (icon.type !== 'file' || !icon.filePath) {
            debugLog('[ContextMenu] Copy rejected: Only files can be copied, not apps or links');
            return;
        }

        // Clear any existing cut state (copy replaces cut)
        this.clearCutState();

        this.clipboard = {
            items: [{
                path: icon.filePath,
                name: icon.label || icon.filePath[icon.filePath.length - 1],
                type: icon.fileType || 'file'
            }],
            operation: 'copy'
        };
        debugLog('[ContextMenu] Desktop File Copy SUCCESS:', icon.filePath.join('/'));
        EventBus.emit('clipboard:changed', { operation: 'copy', count: 1 });
    }

    /**
     * Handle Paste to desktop
     * Works with files copied from either desktop or MyComputer
     * Only files can be pasted (not app/link shortcuts)
     */
    async handleDesktopPaste(context) {
        debugLog('[ContextMenu] handleDesktopPaste() called');
        debugLog('[ContextMenu] Current clipboard:', this.clipboard);

        if (this.clipboard.items.length === 0) {
            debugLog('[ContextMenu] Clipboard is empty, nothing to paste');
            return;
        }

        const targetPath = [...PATHS.DESKTOP];
        debugLog('[ContextMenu] Target path (Desktop):', targetPath.join('/'));

        try {
            for (const item of this.clipboard.items) {
                // Only handle file items (ignore any legacy shortcut data)
                if (!item.path || !Array.isArray(item.path)) {
                    debugLog('[ContextMenu] Skipping invalid clipboard item');
                    continue;
                }

                const sourcePath = item.path;
                const fileName = item.name;

                // Check if pasting to same location (already on desktop)
                const sourceDir = sourcePath.slice(0, -1);
                const isAlreadyOnDesktop = JSON.stringify(sourceDir) === JSON.stringify(targetPath);

                if (isAlreadyOnDesktop) {
                    if (this.clipboard.operation === 'cut') {
                        // Can't cut/paste to same location
                        debugLog('[ContextMenu] Skipping cut to same location');
                        continue;
                    }
                    // For copy, create a copy with modified name
                    const newName = await this.generateCopyName(targetPath, fileName);
                    const newPath = [...targetPath, newName];
                    debugLog('[ContextMenu] Copying to same location with new name:', newName);

                    if (item.type === 'directory') {
                        this.copyDirectory(sourcePath, newPath);
                    } else {
                        this.copyFile(sourcePath, newPath);
                    }
                } else {
                    // Paste from different location to desktop
                    debugLog('[ContextMenu] Pasting from:', sourcePath.join('/'), 'to Desktop');
                    if (this.clipboard.operation === 'cut') {
                        FileSystemManager.moveItem(sourcePath, targetPath);
                    } else {
                        // Copy to desktop
                        const destPath = [...targetPath, fileName];
                        if (item.type === 'directory') {
                            this.copyDirectory(sourcePath, destPath);
                        } else {
                            this.copyFile(sourcePath, destPath);
                        }
                    }
                }
            }

            // Clear cut visual state after successful paste
            this.clearCutState();

            // Clear clipboard if it was a cut operation
            if (this.clipboard.operation === 'cut') {
                this.clipboard = { items: [], operation: null };
                EventBus.emit('clipboard:changed', { operation: null, count: 0 });
            }

            // Refresh desktop to show new files
            EventBus.emit('filesystem:changed');
            EventBus.emit('desktop:refresh');
        } catch (e) {
            console.error('[ContextMenu] Paste error:', e);
            await SystemDialogs.alert(`Error pasting: ${e.message}`, 'Paste Error', 'error');
        }
    }

    /**
     * Clear the cut state - removes visual cut indicators
     * Called when paste completes or a new copy/cut operation starts
     */
    clearCutState() {
        if (this.cutItemPaths.length > 0) {
            this.cutItemPaths = [];
            EventBus.emit('clipboard:cut-state', { cutPaths: [] });
        }
    }

    // Helper: Generate a copy name like "filename - Copy.txt"
    async generateCopyName(targetPath, originalName) {
        const ext = originalName.includes('.') ? originalName.split('.').pop() : '';
        const baseName = ext ? originalName.slice(0, -(ext.length + 1)) : originalName;

        let copyName = ext ? `${baseName} - Copy.${ext}` : `${baseName} - Copy`;
        let counter = 2;

        // Check if copy already exists
        try {
            const items = FileSystemManager.listDirectory(targetPath);
            const existingNames = items.map(i => i.name);

            while (existingNames.includes(copyName)) {
                copyName = ext ? `${baseName} - Copy (${counter}).${ext}` : `${baseName} - Copy (${counter})`;
                counter++;
            }
        } catch (e) {
            // If we can't list directory, just use the default copy name
        }

        return copyName;
    }

    // Helper: Copy a single file with all its metadata
    copyFile(sourcePath, destPath) {
        const sourceNode = FileSystemManager.getNode(sourcePath);
        if (!sourceNode || sourceNode.type !== 'file') {
            throw new Error('Source file not found');
        }

        const destFileName = destPath[destPath.length - 1];
        const destParentPath = destPath.slice(0, -1);
        const destParent = FileSystemManager.getNode(destParentPath);

        if (!destParent) {
            throw new Error('Destination directory not found');
        }

        const destChildren = destParent.children || destParent;
        const now = new Date().toISOString();

        // Copy all properties from source node
        destChildren[destFileName] = {
            type: 'file',
            content: sourceNode.content || '',
            extension: sourceNode.extension || '',
            size: sourceNode.size || 0,
            created: now,
            modified: now,
            // Copy special file metadata
            ...(sourceNode.mimeType && { mimeType: sourceNode.mimeType }),
            ...(sourceNode.isShortcut && { isShortcut: sourceNode.isShortcut }),
            ...(sourceNode.shortcutTarget && { shortcutTarget: sourceNode.shortcutTarget }),
            ...(sourceNode.shortcutType && { shortcutType: sourceNode.shortcutType }),
            ...(sourceNode.shortcutIcon && { shortcutIcon: sourceNode.shortcutIcon }),
            ...(sourceNode.appId && { appId: sourceNode.appId })
        };

        FileSystemManager.saveFileSystem();
    }

    // Helper: Copy a directory recursively
    copyDirectory(sourcePath, destPath) {
        // Create the destination directory
        FileSystemManager.createDirectory(destPath);

        // Get contents of source
        const items = FileSystemManager.listDirectory(sourcePath);

        for (const item of items) {
            const srcItemPath = [...sourcePath, item.name];
            const destItemPath = [...destPath, item.name];

            if (item.type === 'directory') {
                this.copyDirectory(srcItemPath, destItemPath);
            } else {
                // Use copyFile to preserve all metadata
                this.copyFile(srcItemPath, destItemPath);
            }
        }
    }

    // Helper: Open a .lnk shortcut file
    openShortcut(filePath) {
        try {
            const node = FileSystemManager.getNode(filePath);
            if (node && node.shortcutTarget) {
                if (node.shortcutType === 'link') {
                    AppRegistry.launch('browser', { url: node.shortcutTarget });
                } else {
                    AppRegistry.launch(node.shortcutTarget);
                }
            }
        } catch (e) {
            console.error('Error opening shortcut:', e);
        }
    }


    assignDesktopFilePositionIfNeeded(fileName, basePath) {
        if (JSON.stringify(basePath) !== JSON.stringify(PATHS.DESKTOP)) return;

        const fileId = `file_${fileName}`;
        const filePositions = StateManager.getState('filePositions') || {};

        if (!filePositions[fileId]) {
            const occupiedPositions = [
                ...(StateManager.getState('icons') || []),
                ...Object.values(filePositions)
            ];
            filePositions[fileId] = getNextDesktopSlot(occupiedPositions);
            StateManager.setState('filePositions', filePositions, true);
        }
    }

    async createNewFolder(basePath) {
        const name = await SystemDialogs.prompt('Enter folder name:', 'New Folder', 'New Folder');
        if (!name) return;

        try {
            const folderPath = [...basePath, name];
            FileSystemManager.createDirectory(folderPath);
            this.assignDesktopFilePositionIfNeeded(name, basePath);
            EventBus.emit('desktop:refresh');
        } catch (e) {
            await SystemDialogs.alert(`Error creating folder: ${e.message}`, 'Error', 'error');
        }
    }

    async createNewTextFile(basePath) {
        const name = await SystemDialogs.prompt('Enter file name:', 'New Text Document.txt', 'New File');
        if (!name) return;

        try {
            let fileName = name;
            if (!fileName.includes('.')) {
                fileName += '.txt';
            }
            const filePath = [...basePath, fileName];
            FileSystemManager.writeFile(filePath, '', 'txt');
            this.assignDesktopFilePositionIfNeeded(fileName, basePath);

            // Open in Notepad
            AppRegistry.launch('notepad', { filePath });
        } catch (e) {
            await SystemDialogs.alert(`Error creating file: ${e.message}`, 'Error', 'error');
        }
    }

    openFileIcon(icon) {
        const { filePath, extension, fileType } = icon;

        if (fileType === 'directory') {
            AppRegistry.launch('mycomputer', { initialPath: filePath });
        } else if (['txt', 'md', 'log', 'retro', 'bat', 'js', 'css', 'html', 'json', 'ini', 'cfg', 'xml', 'csv'].includes(extension)) {
            AppRegistry.launch('notepad', { filePath });
        } else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff', 'tif'].includes(extension)) {
            AppRegistry.launch('paint', { filePath });
        } else if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'mid', 'midi', 'mp4', 'avi', 'mkv', 'webm', 'ogv', 'mov'].includes(extension)) {
            AppRegistry.launch('mediaplayer', { filePath });
        } else {
            // Default to notepad for unknown text-like files
            AppRegistry.launch('notepad', { filePath });
        }
    }

    async deleteFileIcon(icon) {
        const { filePath, fileType } = icon;

        const confirmed = await SystemDialogs.confirm(`Are you sure you want to send "${icon.label}" to the Recycle Bin?`, 'Confirm Delete');
        if (!confirmed) return;

        try {
            // Read file content before deleting (for potential restore)
            let content = '';
            let extension = icon.extension || '';

            if (fileType !== 'directory') {
                try {
                    content = FileSystemManager.readFile(filePath);
                    const info = FileSystemManager.getInfo(filePath);
                    extension = info.extension || extension;
                } catch (e) {
                    // File might not exist or be readable
                }
            }

            // Add to recycled items with file info for restore
            const recycledItem = {
                id: `recycled_file_${Date.now()}`,
                label: icon.label,
                emoji: icon.emoji || '📄',
                type: 'recycled_file',
                originalPath: filePath,
                fileType: fileType,
                extension: extension,
                content: content,
                deletedAt: Date.now()
            };

            const recycledItems = StateManager.getState('recycledItems') || [];
            recycledItems.push(recycledItem);
            StateManager.setState('recycledItems', recycledItems, true);

            // Delete from filesystem
            if (fileType === 'directory') {
                // Try normal delete first, then recursive if needed
                try {
                    FileSystemManager.deleteDirectory(filePath);
                } catch (e) {
                    if (e.message.includes('not empty')) {
                        FileSystemManager.deleteDirectory(filePath, true);
                    } else {
                        throw e;
                    }
                }
            } else {
                FileSystemManager.deleteFile(filePath);
            }

            // Remove from file positions if tracked
            const filePositions = StateManager.getState('filePositions') || {};
            const fileId = `file_${icon.label}`;
            if (filePositions[fileId]) {
                delete filePositions[fileId];
                StateManager.setState('filePositions', filePositions, true);
            }

            EventBus.emit('filesystem:changed');
        } catch (e) {
            await SystemDialogs.alert(`Error deleting: ${e.message}`, 'Error', 'error');
        }
    }

    async renameFileIcon(icon) {
        const { filePath, fileType } = icon;
        const oldName = icon.label;

        const newName = await SystemDialogs.prompt(`Rename "${oldName}" to:`, oldName, 'Rename');
        if (!newName || newName === oldName) return;

        try {
            // Read the content
            const content = FileSystemManager.readFile(filePath);
            const info = FileSystemManager.getInfo(filePath);

            // Create new file path
            const parentPath = filePath.slice(0, -1);
            const newFilePath = [...parentPath, newName];

            // Write to new location
            FileSystemManager.writeFile(newFilePath, content, info.extension);

            // Delete old file
            FileSystemManager.deleteFile(filePath);

            EventBus.emit('desktop:refresh');
        } catch (e) {
            await SystemDialogs.alert(`Error renaming: ${e.message}`, 'Error', 'error');
        }
    }
}

const ContextMenuRenderer = new ContextMenuRendererClass();
export default ContextMenuRenderer;
