/**
 * My Computer - Windows 95 Style File Explorer
 * Browse drives, folders, and system information
 */

import AppBase from './AppBase.js';
import StateManager from '../core/StateManager.js';
import AppRegistry from './AppRegistry.js';
import FileSystemManager from '../core/FileSystemManager.js';
import EventBus, { Events } from '../core/EventBus.js';
import { PATHS } from '../core/Constants.js';
import { isBackendAvailable } from '../core/ConfigLoader.js';
import { escapeHtml, isSafeHttpUrl } from '../core/Sanitize.js';

class MyComputer extends AppBase {
    constructor() {
        super({
            id: 'mycomputer',
            name: 'My Computer',
            icon: '💻',
            width: 720,
            height: 540,
            minWidth: 520,
            minHeight: 400,
            resizable: true,
            singleton: true,
            category: 'system'
        });

        this.systemFolders = [
            { name: 'My Documents', icon: '📄', app: 'notepad', desc: 'Personal files and documents' },
            { name: 'My Pictures', icon: '🖼️', app: 'paint', desc: 'Image files and photos' },
            { name: 'My Music', icon: '🎵', app: null, desc: 'Audio files and playlists' },
            { name: 'Control Panel', icon: '⚙️', app: 'controlpanel', desc: 'System settings and configuration' },
            { name: 'Recycle Bin', icon: '🗑️', app: 'recyclebin', desc: 'Deleted files and folders' }
        ];

        // Register semantic event commands for scriptability
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        // Navigate to a path
        this.registerCommand('navigate', (payload) => {
            const path = payload.path;
            if (!path) {
                return { success: false, error: 'Path required' };
            }
            try {
                const parsedPath = Array.isArray(path) ? path : FileSystemManager.parsePath(path);
                this.navigateToPath(parsedPath);
                EventBus.emit('mycomputer:navigated', {
                    appId: this.id,
                    path: parsedPath,
                    timestamp: Date.now()
                });
                return { success: true, path: parsedPath };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Create folder
        this.registerCommand('createFolder', (payload) => {
            try {
                const path = payload.path;
                const name = payload.name;
                const basePath = Array.isArray(path) ? path : FileSystemManager.parsePath(path);
                const newPath = [...basePath, name];
                FileSystemManager.createDirectory(newPath);
                EventBus.emit('mycomputer:folder:created', {
                    appId: this.id,
                    path: newPath,
                    timestamp: Date.now()
                });
                return { success: true, path: newPath };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Delete file or folder
        this.registerCommand('delete', (payload) => {
            try {
                const path = payload.path;
                const parsedPath = Array.isArray(path) ? path : FileSystemManager.parsePath(path);
                const node = FileSystemManager.getNode(parsedPath);
                if (node?.type === 'directory') {
                    FileSystemManager.deleteDirectory(parsedPath);
                } else {
                    FileSystemManager.deleteFile(parsedPath);
                }
                EventBus.emit('mycomputer:deleted', {
                    appId: this.id,
                    path: parsedPath,
                    timestamp: Date.now()
                });
                return { success: true, path: parsedPath };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Rename file or folder
        this.registerCommand('rename', (payload) => {
            try {
                const path = payload.path;
                const newName = payload.newName;
                const parsedPath = Array.isArray(path) ? path : FileSystemManager.parsePath(path);
                FileSystemManager.renameItem(parsedPath, newName);
                const newPath = [...parsedPath.slice(0, -1), newName];
                EventBus.emit('mycomputer:renamed', {
                    appId: this.id,
                    oldPath: parsedPath,
                    newPath: newPath,
                    timestamp: Date.now()
                });
                return { success: true, oldPath: parsedPath, newPath };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Open file with default app
        this.registerCommand('openFile', (payload) => {
            try {
                const path = payload.path;
                const parsedPath = Array.isArray(path) ? path : FileSystemManager.parsePath(path);
                const node = FileSystemManager.getNode(parsedPath);
                if (!node) {
                    return { success: false, error: 'File not found' };
                }

                // Determine app to open file with based on extension
                const fileName = parsedPath[parsedPath.length - 1];
                const ext = fileName.split('.').pop()?.toLowerCase();

                let appId = 'notepad'; // Default
                if (['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(ext)) {
                    appId = 'paint';
                } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
                    appId = 'mediaplayer';
                } else if (ext === 'retro') {
                    appId = 'scriptrunner';
                } else if (['mp4', 'avi', 'mkv', 'webm'].includes(ext)) {
                    appId = 'mediaplayer';
                }

                AppRegistry.launch(appId, { filePath: parsedPath });
                return { success: true, path: parsedPath, appId };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
    }

    /**
     * Register queries for script inspection
     */
    registerQueries() {
        // Get current path
        this.registerQuery('getCurrentPath', () => {
            const path = this.getInstanceState('currentPath') || ['C:'];
            return { path, pathString: path.join('/') };
        });

        // List directory contents
        this.registerQuery('listDirectory', (path) => {
            try {
                const parsedPath = path ? (Array.isArray(path) ? path : FileSystemManager.parsePath(path))
                                        : this.getInstanceState('currentPath') || ['C:'];
                const items = FileSystemManager.listDirectory(parsedPath);
                return { success: true, path: parsedPath, items };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Get file/folder info
        this.registerQuery('getNodeInfo', (path) => {
            try {
                const parsedPath = Array.isArray(path) ? path : FileSystemManager.parsePath(path);
                const node = FileSystemManager.getNode(parsedPath);
                if (!node) {
                    return { success: false, error: 'Not found' };
                }
                return { success: true, node };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Get system folders
        this.registerQuery('getSystemFolders', () => {
            return { folders: this.systemFolders };
        });
    }

    onOpen(params = {}) {
        // Store initial path if opening a specific directory
        if (params.initialPath && Array.isArray(params.initialPath)) {
            this._initialPath = params.initialPath;
        } else {
            this._initialPath = null;
        }

        return `
            <style>
                .mycomputer-app {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #c0c0c0;
                }
                .mycomputer-toolbar {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px;
                    background: #c0c0c0;
                    border-bottom: 2px groove #fff;
                }
                .mycomputer-btn {
                    padding: 4px 12px;
                    border: 2px outset #fff;
                    background: #c0c0c0;
                    cursor: pointer;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .mycomputer-btn:active {
                    border-style: inset;
                }
                .mycomputer-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .mycomputer-address {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-left: 8px;
                }
                .mycomputer-address-label {
                    font-size: 13px;
                    font-weight: bold;
                }
                .mycomputer-address-bar {
                    flex: 1;
                    padding: 4px 8px;
                    border: 2px inset #fff;
                    background: white;
                    font-size: 13px;
                }
                .mycomputer-content {
                    flex: 1;
                    background: white;
                    overflow-y: auto;
                    padding: 15px;
                }
                .mycomputer-view-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                    gap: 20px;
                }
                .mycomputer-view-list {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .mycomputer-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    padding: 10px;
                    cursor: pointer;
                    border: 2px solid transparent;
                }
                .mycomputer-item:hover {
                    background: #e0e0e0;
                }
                .mycomputer-item.selected {
                    background: #000080;
                    color: white;
                }
                .mycomputer-item-icon {
                    font-size: 32px;
                }
                .mycomputer-item-label {
                    font-size: 13px;
                    text-align: center;
                    word-break: break-word;
                }
                .mycomputer-item-desc {
                    font-size: 12px;
                    text-align: center;
                    color: #666;
                }
                .mycomputer-item.selected .mycomputer-item-desc {
                    color: #ccc;
                }
                .mycomputer-list-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 4px 8px;
                    cursor: pointer;
                    border: 1px solid transparent;
                }
                .mycomputer-list-item:hover {
                    background: #e0e0e0;
                }
                .mycomputer-list-item.selected {
                    background: #000080;
                    color: white;
                }
                .mycomputer-list-icon {
                    font-size: 16px;
                    width: 20px;
                }
                .mycomputer-list-name {
                    flex: 1;
                    font-size: 13px;
                }
                .mycomputer-list-size {
                    font-size: 13px;
                    min-width: 80px;
                }
                .mycomputer-list-date {
                    font-size: 13px;
                    min-width: 100px;
                }
                .mycomputer-status {
                    padding: 4px 8px;
                    background: #c0c0c0;
                    border-top: 2px groove #fff;
                    font-size: 13px;
                    display: flex;
                    justify-content: space-between;
                }
                .mycomputer-drive-info {
                    background: #f0f0f0;
                    border: 2px groove #fff;
                    padding: 15px;
                    margin-bottom: 20px;
                }
                .mycomputer-drive-header {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    margin-bottom: 15px;
                }
                .mycomputer-drive-icon {
                    font-size: 48px;
                }
                .mycomputer-drive-details h3 {
                    margin: 0 0 5px 0;
                    font-size: 14px;
                    color: #000080;
                }
                .mycomputer-drive-details p {
                    margin: 0;
                    font-size: 13px;
                    color: #666;
                }
                .mycomputer-progress {
                    width: 100%;
                    height: 20px;
                    background: white;
                    border: 2px inset #fff;
                    position: relative;
                }
                .mycomputer-progress-bar {
                    height: 100%;
                    background: linear-gradient(90deg, #0000ff 0%, #0080ff 100%);
                }
                .mycomputer-progress-text {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 12px;
                    font-weight: bold;
                    color: black;
                    text-shadow: 0 0 3px white;
                }
                .mycomputer-content.drop-target {
                    background: #e8f0ff !important;
                    outline: 2px dashed #0000ff;
                    outline-offset: -4px;
                }
                .mycomputer-item.dragging,
                .mycomputer-list-item.dragging {
                    opacity: 0.5;
                }
                .mycomputer-item[draggable="true"],
                .mycomputer-list-item[draggable="true"] {
                    cursor: grab;
                }
                .mycomputer-item[draggable="true"]:active,
                .mycomputer-list-item[draggable="true"]:active {
                    cursor: grabbing;
                }
                .mycomputer-item.drop-target,
                .mycomputer-list-item.drop-target {
                    background: #e8f0ff !important;
                    outline: 2px dashed #0000ff;
                    outline-offset: -2px;
                }
                .mycomputer-item.drop-target .mycomputer-item-icon,
                .mycomputer-list-item.drop-target .mycomputer-list-icon {
                    transform: scale(1.1);
                    transition: transform 0.15s ease;
                }
                .drive-item.drop-target,
                .folder-item.drop-target {
                    background: #e8f0ff !important;
                    outline: 2px dashed #0000ff;
                    outline-offset: -2px;
                }
                /* Selected item styles */
                .mycomputer-item.selected,
                .mycomputer-list-item.selected {
                    background: var(--win95-blue, #000080);
                    color: white;
                }
                .mycomputer-item.selected .mycomputer-item-label,
                .mycomputer-list-item.selected .mycomputer-list-name {
                    color: white;
                }
                /* Cut state - items marked for cut appear faded */
                .mycomputer-item.cut,
                .mycomputer-list-item.cut {
                    opacity: 0.5;
                }
                .mycomputer-item.cut .mycomputer-item-icon,
                .mycomputer-list-item.cut .mycomputer-list-icon {
                    filter: grayscale(30%);
                }
                /* Empty folder message */
                .mycomputer-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: #808080;
                    font-size: 14px;
                    padding: 40px;
                    text-align: center;
                }
                .mycomputer-empty-icon {
                    font-size: 48px;
                    margin-bottom: 16px;
                    opacity: 0.5;
                }
            </style>

            <div class="mycomputer-app">
                <div class="mycomputer-toolbar">
                    <button class="mycomputer-btn" id="back-btn" disabled title="Go back (Alt+Left)">
                        ◀ Back
                    </button>
                    <button class="mycomputer-btn" id="forward-btn" disabled title="Go forward (Alt+Right)">
                        ▶ Forward
                    </button>
                    <button class="mycomputer-btn" id="up-btn" disabled title="Go up one level (Backspace)">
                        ▲ Up
                    </button>
                    <div style="width: 2px; height: 20px; background: #808080; margin: 0 4px;"></div>
                    <button class="mycomputer-btn" id="refresh-btn" title="Refresh (F5)">
                        🔄
                    </button>
                    <button class="mycomputer-btn" id="view-btn" title="Toggle view">
                        📋 View
                    </button>
                    <button class="mycomputer-btn" id="upload-btn" title="Import files from your computer">
                        📤 Import
                    </button>
                    <div class="mycomputer-address">
                        <span class="mycomputer-address-label">Address:</span>
                        <div class="mycomputer-address-bar" id="address-bar">${this._initialPath && this._initialPath.length > 0 ? 'My Computer\\' + this._initialPath.join('\\') : 'My Computer'}</div>
                    </div>
                </div>

                <div class="mycomputer-content" id="content">
                    ${this._initialPath && this._initialPath.length > 0 ? this.renderDirectoryView(this._initialPath) : this.renderRootView()}
                </div>

                <div class="mycomputer-status">
                    <span id="status-text">My Computer</span>
                    <span id="status-items"></span>
                </div>
            </div>
        `;
    }

    onMount() {
        // Initialize view state - check for initial path or start at root (My Computer)
        const initialPath = this._initialPath || [];
        this.setInstanceState('currentPath', initialPath);
        this.setInstanceState('viewMode', 'grid');
        this.setInstanceState('history', []);
        this.setInstanceState('forwardHistory', []);
        this.setInstanceState('selectedItem', null);
        this.setInstanceState('cutItemPaths', []);

        // Setup toolbar buttons
        this.setupToolbarHandlers();

        // Setup drag and drop handlers for content area
        this.setupDragDropHandlers();

        // Setup context menu handlers
        this.setupContextMenuHandlers();

        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();

        // Subscribe to filesystem changes for real-time updates.
        // `this.subscribe(...)` (AppBase) registers via SubscriptionManager
        // under this window's owner ID, so cleanup is automatic on close.
        const refresh = () => this.refreshView();
        this.subscribe('filesystem:changed', refresh);
        this.subscribe('filesystem:file:changed', refresh);
        this.subscribe('filesystem:directory:changed', refresh);

        // Listen for context menu upload trigger
        this.subscribe('explorer:upload', () => this.triggerFileUpload());

        // Listen for navigation events from context menu
        this.subscribe('mycomputer:navigate', ({ path }) => {
            if (path && Array.isArray(path)) {
                this.navigateToPath(path);
            }
        });

        // Listen for clipboard cut state changes
        this.subscribe('clipboard:cut-state', ({ cutPaths }) => {
            this.setInstanceState('cutItemPaths', cutPaths || []);
            this.updateCutVisualState();
        });

        // If we have an initial path, navigate to it after mount
        if (initialPath.length > 0) {
            this.refreshView();
        }

        // Update status
        this.updateStatus();
    }

    /**
     * Setup drag and drop handlers for the content area
     */
    setupDragDropHandlers() {
        const content = this.getElement('#content');
        if (!content) return;

        // Dragover - allow drop
        this.addHandler(content, 'dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentPath = this.getInstanceState('currentPath') || [];

            // Only allow drops when inside a directory (not at My Computer root)
            const hasFileData = e.dataTransfer.types.includes('application/retros-file');
            const hasShortcutData = e.dataTransfer.types.includes('application/retros-shortcut');
            const hasNativeFiles = e.dataTransfer.types.includes('Files');
            if (currentPath.length > 0 && (hasFileData || hasShortcutData || hasNativeFiles)) {
                e.dataTransfer.dropEffect = hasShortcutData ? 'copy' : (hasNativeFiles ? 'copy' : 'move');
                content.classList.add('drop-target');
            }
        });

        // Dragleave - remove highlight
        this.addHandler(content, 'dragleave', (e) => {
            if (e.target === content || !content.contains(e.relatedTarget)) {
                content.classList.remove('drop-target');
            }
        });

        // Drop - handle the file drop
        this.addHandler(content, 'drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            content.classList.remove('drop-target');
            this.handleFileDrop(e);
        });
    }

    /**
     * Setup context menu handlers for the content area
     * Provides Windows 95-style right-click context menus
     */
    setupContextMenuHandlers() {
        const content = this.getElement('#content');
        if (!content) return;

        // Right-click on content area (empty space)
        this.addHandler(content, 'contextmenu', (e) => {
            // Check if we clicked on an item or empty space
            const clickedItem = e.target.closest('.mycomputer-item, .mycomputer-list-item, .drive-item, .folder-item');

            if (!clickedItem) {
                // Clicked on empty space - show empty area context menu
                e.preventDefault();
                e.stopPropagation();

                const currentPath = this.getInstanceState('currentPath') || [];

                // Only show empty menu if inside a directory, not at My Computer root
                if (currentPath.length > 0) {
                    EventBus.emit(Events.CONTEXT_MENU_SHOW, {
                        x: e.clientX,
                        y: e.clientY,
                        type: 'explorer-empty',
                        currentPath: currentPath
                    });
                }
            }
        });
    }

    /**
     * Setup keyboard shortcuts for file operations
     * Ctrl+C: Copy, Ctrl+X: Cut, Ctrl+V: Paste, Delete: Delete, F2: Rename, F5: Refresh
     */
    setupKeyboardShortcuts() {
        const windowEl = this.getElement('.mycomputer-app');
        if (!windowEl) return;

        // Make the content area focusable to receive keyboard events
        windowEl.setAttribute('tabindex', '0');

        this.keyboardHandler = (e) => {
            // Only handle when MyComputer holds focus AND the document focus
            // is inside the file-browser surface (so editing a rename input
            // outside the browser still works as expected).
            if (!this.isFocused()) return;
            if (!document.activeElement?.closest('.mycomputer-app')) return;

            const selectedItem = this.getInstanceState('selectedItem');
            const currentPath = this.getInstanceState('currentPath') || [];

            // F5 - Refresh
            if (e.key === 'F5') {
                e.preventDefault();
                this.refreshView();
                return;
            }

            // F2 - Rename selected item
            if (e.key === 'F2' && selectedItem) {
                e.preventDefault();
                this.renameSelectedItem(selectedItem);
                return;
            }

            // Delete - Delete selected item
            if (e.key === 'Delete' && selectedItem) {
                e.preventDefault();
                this.deleteSelectedItem(selectedItem);
                return;
            }

            // Backspace - Go up one level
            if (e.key === 'Backspace' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                this.navigateUp();
                return;
            }

            // Alt+Left - Go back
            if (e.key === 'ArrowLeft' && e.altKey) {
                e.preventDefault();
                this.navigateBack();
                return;
            }

            // Alt+Right - Go forward
            if (e.key === 'ArrowRight' && e.altKey) {
                e.preventDefault();
                this.navigateForward();
                return;
            }

            // Ctrl+C - Copy
            if (e.key === 'c' && (e.ctrlKey || e.metaKey) && selectedItem) {
                e.preventDefault();
                this.copySelectedItem(selectedItem);
                return;
            }

            // Ctrl+X - Cut
            if (e.key === 'x' && (e.ctrlKey || e.metaKey) && selectedItem) {
                e.preventDefault();
                this.cutSelectedItem(selectedItem);
                return;
            }

            // Ctrl+V - Paste
            if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.pasteFromClipboard();
                return;
            }

            // Ctrl+A - Select all (future enhancement)
            // Enter - Open selected item
            if (e.key === 'Enter' && selectedItem) {
                e.preventDefault();
                this.openSelectedItem(selectedItem);
                return;
            }
        };

        // Add keyboard listener to document but filter by focus
        this.addHandler(document, 'keydown', this.keyboardHandler);
    }

    /**
     * Clipboard operations for keyboard shortcuts
     */
    copySelectedItem(item) {
        if (!item?.path) return;
        // Use the ContextMenuRenderer's clipboard (it's a singleton)
        import('../ui/ContextMenuRenderer.js').then(module => {
            const ContextMenuRenderer = module.default;
            ContextMenuRenderer.clipboard = {
                items: [{
                    path: item.path,
                    name: item.name,
                    type: item.type
                }],
                operation: 'copy'
            };
            console.log('[MyComputer] Copied:', item.path.join('/'));
            EventBus.emit('clipboard:changed', { operation: 'copy', count: 1 });
        });
    }

    cutSelectedItem(item) {
        if (!item?.path) return;
        import('../ui/ContextMenuRenderer.js').then(module => {
            const ContextMenuRenderer = module.default;
            ContextMenuRenderer.clipboard = {
                items: [{
                    path: item.path,
                    name: item.name,
                    type: item.type
                }],
                operation: 'cut'
            };
            console.log('[MyComputer] Cut:', item.path.join('/'));
            EventBus.emit('clipboard:changed', { operation: 'cut', count: 1 });
        });
    }

    async pasteFromClipboard() {
        const currentPath = this.getInstanceState('currentPath') || [];
        if (currentPath.length === 0) return; // Can't paste at root

        import('../ui/ContextMenuRenderer.js').then(async module => {
            const ContextMenuRenderer = module.default;
            // Trigger paste using the shared clipboard
            await ContextMenuRenderer.handleExplorerPaste({ currentPath });
        });
    }

    async renameSelectedItem(item) {
        if (!item?.path) return;
        const { default: SystemDialogs } = await import('../features/SystemDialogs.js');

        const newName = await SystemDialogs.prompt(`Rename "${item.name}" to:`, item.name, 'Rename');
        if (!newName || newName === item.name) return;

        try {
            FileSystemManager.renameItem(item.path, newName);
            EventBus.emit('filesystem:changed');
        } catch (e) {
            await SystemDialogs.alert(`Error renaming: ${e.message}`, 'Rename Error', 'error');
        }
    }

    async deleteSelectedItem(item) {
        if (!item?.path) return;
        const { default: SystemDialogs } = await import('../features/SystemDialogs.js');

        const confirmed = await SystemDialogs.confirm(
            `Are you sure you want to send "${item.name}" to the Recycle Bin?`,
            'Confirm Delete'
        );
        if (!confirmed) return;

        try {
            if (item.type === 'directory') {
                FileSystemManager.deleteDirectory(item.path, true);
            } else {
                FileSystemManager.deleteFile(item.path);
            }
            EventBus.emit('filesystem:changed');
            EventBus.emit(Events.SOUND_PLAY, { type: 'recycle' });
            this.setInstanceState('selectedItem', null);
        } catch (e) {
            await SystemDialogs.alert(`Error deleting: ${e.message}`, 'Delete Error', 'error');
        }
    }

    openSelectedItem(item) {
        if (!item) return;

        if (item.type === 'directory') {
            this.navigateToPath(item.path);
        } else if (item.type === 'file') {
            this.openFile(item.name);
        }
    }

    /**
     * Attach context menu handlers to items
     * Called after content is rendered
     */
    attachItemContextMenus() {
        const currentPath = this.getInstanceState('currentPath') || [];

        // Drive items
        const driveItems = this.getElements('.drive-item');
        driveItems.forEach(item => {
            this.addHandler(item, 'contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const driveLetter = item.dataset.drive;

                EventBus.emit(Events.CONTEXT_MENU_SHOW, {
                    x: e.clientX,
                    y: e.clientY,
                    type: 'explorer-drive',
                    item: {
                        name: driveLetter,
                        type: 'drive',
                        driveLetter: driveLetter
                    },
                    currentPath: currentPath
                });
            });
        });

        // System folder items (My Documents, Control Panel, etc.)
        const systemFolderItems = this.getElements('.folder-item');
        systemFolderItems.forEach(item => {
            this.addHandler(item, 'contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const appId = item.dataset.folder;
                const label = item.querySelector('.mycomputer-item-label')?.textContent || appId;

                EventBus.emit(Events.CONTEXT_MENU_SHOW, {
                    x: e.clientX,
                    y: e.clientY,
                    type: 'explorer-system-folder',
                    item: {
                        name: label,
                        type: 'system-folder',
                        appId: appId
                    },
                    currentPath: currentPath
                });
            });
        });

        // Directory items
        const directoryItems = this.getElements('.directory-item');
        directoryItems.forEach(item => {
            this.addHandler(item, 'contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const dirName = item.dataset.name;
                const itemPath = [...currentPath, dirName];

                EventBus.emit(Events.CONTEXT_MENU_SHOW, {
                    x: e.clientX,
                    y: e.clientY,
                    type: 'explorer-folder',
                    item: {
                        name: dirName,
                        type: 'directory',
                        path: itemPath,
                        icon: '📁'
                    },
                    currentPath: currentPath
                });
            });
        });

        // File items
        const fileItems = this.getElements('.file-item');
        fileItems.forEach(item => {
            this.addHandler(item, 'contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const fileName = item.dataset.name;
                const extension = item.dataset.extension || '';
                const itemPath = [...currentPath, fileName];

                EventBus.emit(Events.CONTEXT_MENU_SHOW, {
                    x: e.clientX,
                    y: e.clientY,
                    type: 'explorer-file',
                    item: {
                        name: fileName,
                        type: 'file',
                        path: itemPath,
                        extension: extension,
                        icon: this.getFileIcon(extension)
                    },
                    currentPath: currentPath
                });
            });
        });

        // Shortcut items
        const shortcutItems = this.getElements('.shortcut-item');
        shortcutItems.forEach(item => {
            this.addHandler(item, 'contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const fileName = item.dataset.name;
                const itemPath = [...currentPath, fileName];
                let shortcutData = null;
                try {
                    shortcutData = JSON.parse(item.dataset.shortcut || '{}');
                } catch (err) {}

                EventBus.emit(Events.CONTEXT_MENU_SHOW, {
                    x: e.clientX,
                    y: e.clientY,
                    type: 'explorer-file',
                    item: {
                        name: fileName,
                        type: 'shortcut',
                        path: itemPath,
                        extension: 'lnk',
                        icon: '🔗',
                        shortcutData: shortcutData
                    },
                    currentPath: currentPath
                });
            });
        });

        // Executable items
        const executableItems = this.getElements('.executable-item');
        executableItems.forEach(item => {
            this.addHandler(item, 'contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const fileName = item.dataset.name;
                const itemPath = [...currentPath, fileName];
                let shortcutData = null;
                try {
                    shortcutData = JSON.parse(item.dataset.shortcut || '{}');
                } catch (err) {}

                EventBus.emit(Events.CONTEXT_MENU_SHOW, {
                    x: e.clientX,
                    y: e.clientY,
                    type: 'explorer-file',
                    item: {
                        name: fileName,
                        type: 'executable',
                        path: itemPath,
                        extension: 'exe',
                        icon: '⚙️',
                        shortcutData: shortcutData
                    },
                    currentPath: currentPath
                });
            });
        });
    }

    /**
     * Setup item selection (single-click to select)
     * Selected items can be operated on with keyboard shortcuts
     */
    setupItemSelection() {
        const currentPath = this.getInstanceState('currentPath') || [];

        // Select all file and directory items
        const allItems = this.getElements('.mycomputer-item, .mycomputer-list-item');

        allItems.forEach(item => {
            this.addHandler(item, 'click', (e) => {
                // Don't select on double-click (that opens the item)
                if (e.detail === 2) return;

                // Remove selection from all items
                allItems.forEach(i => i.classList.remove('selected'));

                // Add selection to clicked item
                item.classList.add('selected');

                // Store selected item info for keyboard operations
                const name = item.dataset.name;
                const type = item.dataset.type;
                const extension = item.dataset.extension || '';

                if (name && (type === 'file' || type === 'directory')) {
                    this.setInstanceState('selectedItem', {
                        name,
                        type,
                        extension,
                        path: [...currentPath, name]
                    });

                    // Update status bar with selected item
                    this.updateStatusForSelection(name, type, extension, currentPath);
                }
            });
        });

        // Click on empty space deselects
        const content = this.getElement('#content');
        if (content) {
            this.addHandler(content, 'click', (e) => {
                if (e.target === content || e.target.classList.contains('mycomputer-view-grid') || e.target.classList.contains('mycomputer-view-list')) {
                    allItems.forEach(i => i.classList.remove('selected'));
                    this.setInstanceState('selectedItem', null);
                    this.updateStatus();
                }
            });
        }
    }

    /**
     * Update status bar to show selected item info
     */
    updateStatusForSelection(name, type, extension, currentPath) {
        const statusText = this.getElement('#status-text');
        const statusItems = this.getElement('#status-items');

        if (!statusText) return;

        if (type === 'file') {
            try {
                const filePath = [...currentPath, name];
                const info = FileSystemManager.getInfo(filePath);
                const size = FileSystemManager.formatSize(info.size || 0);
                statusText.textContent = `"${name}" selected`;
                if (statusItems) statusItems.textContent = size;
            } catch (e) {
                statusText.textContent = `"${name}" selected`;
                if (statusItems) statusItems.textContent = '';
            }
        } else {
            statusText.textContent = `"${name}" selected`;
            if (statusItems) statusItems.textContent = 'Folder';
        }
    }

    /**
     * Get the appropriate icon for a file extension
     */
    getFileIcon(extension) {
        const iconMap = {
            'txt': '📝',
            'md': '📝',
            'log': '📋',
            'ini': '📋',
            'cfg': '📋',
            'json': '📋',
            'xml': '📋',
            'js': '📜',
            'css': '🎨',
            'html': '🌐',
            'retro': '📜',
            'png': '🖼️',
            'jpg': '🖼️',
            'jpeg': '🖼️',
            'bmp': '🖼️',
            'gif': '🖼️',
            'svg': '🖼️',
            'webp': '🖼️',
            'ico': '🖼️',
            'tiff': '🖼️',
            'tif': '🖼️',
            'mp3': '🎵',
            'wav': '🎵',
            'ogg': '🎵',
            'flac': '🎵',
            'm4a': '🎵',
            'aac': '🎵',
            'wma': '🎵',
            'mid': '🎵',
            'midi': '🎵',
            'lnk': '🔗',
            'exe': '⚙️',
            'pdf': '📕',
            'csv': '📊',
            'mp4': '🎬',
            'webm': '🎬',
            'ogv': '🎬',
            'avi': '🎬',
            'mkv': '🎬',
            'mov': '🎬',
            'zip': '📦',
            'tar': '📦',
            'gz': '📦'
        };
        return iconMap[extension] || '📄';
    }

    /**
     * Handle file drop into MyComputer
     * @param {DragEvent} e - Drag event
     */
    handleFileDrop(e) {
        const currentPath = this.getInstanceState('currentPath') || [];
        if (currentPath.length === 0) {
            console.log('Cannot drop files at My Computer root');
            return;
        }

        // Check for shortcut data (app icons dragged from desktop)
        const shortcutData = e.dataTransfer.getData('application/retros-shortcut');
        if (shortcutData) {
            this.createShortcutFromDrop(shortcutData, currentPath);
            return;
        }

        // Handle native file drops from user's OS
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const nativeFiles = Array.from(e.dataTransfer.files);
            // Only handle if no retros-file data (to avoid double handling)
            const retrosData = e.dataTransfer.getData('application/retros-file');
            if (!retrosData) {
                this.handleNativeFileDrop(nativeFiles, currentPath);
                return;
            }
        }

        // Handle regular file drops
        const data = e.dataTransfer.getData('application/retros-file');
        if (!data) return;

        try {
            const fileData = JSON.parse(data);
            const { filePath, fileName, isShortcut, shortcutTarget, shortcutType, shortcutIcon } = fileData;

            // If this is a shortcut being created from an app icon
            if (isShortcut && shortcutTarget) {
                this.createShortcutFile(currentPath, fileName, shortcutTarget, shortcutType, shortcutIcon);
                return;
            }

            if (!filePath || !Array.isArray(filePath)) {
                console.error('Invalid file path in drop data');
                return;
            }

            // Check if dropping to same location
            const sourceDir = filePath.slice(0, -1);
            if (JSON.stringify(sourceDir) === JSON.stringify(currentPath)) {
                console.log('File is already in this directory');
                return;
            }

            // Move the file to current directory
            try {
                FileSystemManager.moveItem(filePath, currentPath);
                this.showDropFeedback(`Moved "${fileName}" to ${currentPath[currentPath.length - 1] || 'current folder'}`, 'success');
            } catch (err) {
                console.error('Failed to move file:', err.message);
                this.showDropFeedback(`Failed to move file: ${err.message}`, 'error');
            }
        } catch (err) {
            console.error('Failed to parse drop data:', err);
        }
    }

    /**
     * Handle native files dropped from the user's OS
     */
    async handleNativeFileDrop(files, targetPath) {
        let successCount = 0;
        let errorMessages = [];

        const useBackend = isBackendAvailable();

        for (const file of files) {
            try {
                if (useBackend) {
                    const virtualPath = [...targetPath, file.name].join('/');
                    await FileSystemManager.uploadFile(virtualPath, file);
                } else {
                    await this.storeFileClientSide(file, targetPath);
                }
                successCount++;
            } catch (err) {
                errorMessages.push(`${file.name}: ${err.message}`);
            }
        }

        if (successCount > 0) {
            this.showDropFeedback(`${successCount} file(s) imported`, 'success');
            this.refreshView();
        }
        if (errorMessages.length > 0) {
            this.showDropFeedback(`Failed: ${errorMessages[0]}`, 'error');
        }
    }

    /**
     * Show feedback toast for drag and drop operations
     * @param {string} message - Message to display
     * @param {string} type - 'success', 'error', or 'info'
     */
    showDropFeedback(message, type = 'info') {
        // Remove any existing feedback
        const existing = document.querySelector('.drop-feedback');
        if (existing) existing.remove();

        const feedback = document.createElement('div');
        feedback.className = `drop-feedback drop-feedback-${type}`;
        feedback.textContent = message;
        document.body.appendChild(feedback);

        // Animate in
        requestAnimationFrame(() => {
            feedback.classList.add('active');
        });

        // Remove after delay
        setTimeout(() => {
            feedback.classList.remove('active');
            setTimeout(() => feedback.remove(), 300);
        }, 2000);
    }

    /**
     * Create a shortcut from dropped app icon data
     * @param {string} shortcutData - JSON string with shortcut info
     * @param {string[]} targetPath - Target directory path
     */
    createShortcutFromDrop(shortcutData, targetPath) {
        try {
            const data = JSON.parse(shortcutData);
            const { id, label, emoji, type, url } = data;
            const target = type === 'link' ? url : id;
            this.createShortcutFile(targetPath, label, target, type, emoji);
        } catch (err) {
            console.error('Failed to create shortcut:', err);
        }
    }

    /**
     * Create a shortcut file in the target directory
     * @param {string[]} targetPath - Target directory path
     * @param {string} name - Shortcut name
     * @param {string} target - Target app ID or URL
     * @param {string} type - 'app' or 'link'
     * @param {string} icon - Emoji icon
     */
    createShortcutFile(targetPath, name, target, type, icon) {
        const now = new Date().toISOString();
        const fileName = `${name}.lnk`;
        const filePath = [...targetPath, fileName];

        try {
            // Get the parent node
            const parentNode = FileSystemManager.getNode(targetPath);
            if (!parentNode) {
                console.error('Target directory not found');
                return;
            }

            const children = parentNode.children || parentNode;

            // Check if shortcut already exists
            if (children[fileName]) {
                console.log(`Shortcut ${fileName} already exists`);
                return;
            }

            // Create shortcut file
            children[fileName] = {
                type: 'file',
                content: JSON.stringify({
                    type: type || 'app',
                    target: target,
                    icon: icon,
                    label: name
                }, null, 2),
                extension: 'lnk',
                size: 128,
                created: now,
                modified: now,
                isShortcut: true,
                shortcutTarget: target,
                shortcutType: type || 'app',
                shortcutIcon: icon
            };

            FileSystemManager.saveFileSystem();
            console.log(`Created shortcut ${fileName} in ${targetPath.join('/')}`);
        } catch (err) {
            console.error('Failed to create shortcut file:', err);
        }
    }

    onClose() {
        // EventBus subscriptions registered via this.subscribe() auto-clean
        // on close — no manual EventBus.off() calls needed.

        // Clean up keyboard listener
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
        }
    }

    /**
     * Called when My Computer is re-launched while already open
     * Navigates to the new path instead of opening a new window
     * @param {Object} params - Parameters including initialPath
     */
    onRelaunch(params) {
        if (params.initialPath && Array.isArray(params.initialPath)) {
            this.navigateToPath(params.initialPath);
        }
    }

    getDrives() {
        // Get drives from FileSystemManager
        const drives = [];
        const rootItems = FileSystemManager.listDirectory([]);

        for (const item of rootItems) {
            if (item.type === 'drive') {
                const icon = item.name === 'C:' ? '💾' : (item.name === 'D:' ? '💿' : '💾');
                const type = item.name === 'C:' ? 'hard' : (item.name === 'D:' ? 'cdrom' : 'floppy');

                // Calculate drive size
                const totalBytes = FileSystemManager.getDirectorySize([item.name]);
                const totalGB = totalBytes / (1024 * 1024 * 1024);

                // Check if drive is empty
                const contents = FileSystemManager.listDirectory([item.name]);
                const isEmpty = contents.length === 0;

                drives.push({
                    id: item.name.toLowerCase().replace(':', ''),
                    letter: item.name,
                    label: item.label || 'Local Disk',
                    icon: icon,
                    type: type,
                    used: totalGB,
                    total: type === 'hard' ? 10 : 0.65,
                    isEmpty: isEmpty
                });
            }
        }

        return drives;
    }

    renderRootView() {
        const drives = this.getDrives();
        const { systemFolders } = this;

        return `
            <h3 style="margin: 0 0 15px 0; font-size: 14px; color: #000080;">💻 My Computer</h3>
            <div class="mycomputer-view-grid">
                ${drives.map(drive => `
                    <div class="mycomputer-item drive-item" data-drive="${drive.letter}">
                        <div class="mycomputer-item-icon">${drive.icon}</div>
                        <div class="mycomputer-item-label">${drive.label} (${drive.letter})</div>
                    </div>
                `).join('')}
            </div>

            <h3 style="margin: 30px 0 15px 0; font-size: 14px; color: #000080;">📁 System Folders</h3>
            <div class="mycomputer-view-grid">
                ${systemFolders.map(folder => `
                    <div class="mycomputer-item folder-item" data-folder="${folder.app || folder.name}">
                        <div class="mycomputer-item-icon">${folder.icon}</div>
                        <div class="mycomputer-item-label">${folder.name}</div>
                        <div class="mycomputer-item-desc">${folder.desc}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderDirectoryView(path) {
        try {
            const items = FileSystemManager.listDirectory(path);

            // Check if it's a drive root
            const isDriveRoot = path.length === 1;

            let html = '';

            // Show drive info if we're at a drive root
            if (isDriveRoot) {
                const drives = this.getDrives();
                const drive = drives.find(d => d.letter === path[0]);

                if (drive && drive.isEmpty) {
                    return `
                        <div style="text-align: center; padding: 60px 20px;">
                            <div style="font-size: 64px; margin-bottom: 20px;">${drive.icon}</div>
                            <div style="font-size: 14px; color: #666;">
                                There is no disk in the drive.<br>
                                Please insert a disk into drive ${drive.letter}
                            </div>
                        </div>
                    `;
                }

                if (drive) {
                    const usedPercent = (drive.used / drive.total * 100).toFixed(1);

                    html += `
                        <div class="mycomputer-drive-info">
                            <div class="mycomputer-drive-header">
                                <div class="mycomputer-drive-icon">${drive.icon}</div>
                                <div class="mycomputer-drive-details">
                                    <h3>${drive.label} (${drive.letter})</h3>
                                    <p>Type: ${drive.type === 'hard' ? 'Local Disk' : 'Removable Disk'}</p>
                                    <p>File System: FAT32</p>
                                </div>
                            </div>
                            <div style="margin-top: 15px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px;">
                                    <span>Used: ${drive.used.toFixed(2)} GB</span>
                                    <span>Free: ${(drive.total - drive.used).toFixed(2)} GB</span>
                                </div>
                                <div class="mycomputer-progress">
                                    <div class="mycomputer-progress-bar" style="width: ${usedPercent}%"></div>
                                    <div class="mycomputer-progress-text">${usedPercent}% used</div>
                                </div>
                                <div style="margin-top: 5px; font-size: 13px; text-align: right;">
                                    Capacity: ${drive.total} GB
                                </div>
                            </div>
                        </div>
                    `;
                }
            }

            // Convert items to display format
            const displayItems = items.map(item => {
                let icon = '📄';
                let displayName = item.name;
                let itemType = item.type;
                let shortcutData = null;

                if (item.type === 'directory') {
                    icon = '📁';
                    // Special icons for known folders
                    if (item.name === 'Windows') icon = '🪟';
                    else if (item.name === 'Users') icon = '👥';
                    else if (item.name === 'Temp') icon = '🗑️';
                    else if (item.name === 'Documents') icon = '📄';
                    else if (item.name === 'Pictures') icon = '🖼️';
                    else if (item.name === 'Projects') icon = '💼';
                    else if (item.name === 'Desktop') icon = '🖥️';
                    else if (item.name === 'Downloads') icon = '📥';
                    else if (item.name === 'Music') icon = '🎵';
                    else if (item.name === 'Program Files') icon = '📦';
                } else if (item.type === 'file') {
                    if (item.extension === 'lnk') {
                        // Shortcut file - get the icon and target from the file
                        try {
                            const filePath = [...path, item.name];
                            const node = FileSystemManager.getNode(filePath);
                            if (node && node.shortcutIcon) {
                                icon = node.shortcutIcon;
                                itemType = 'shortcut';
                                shortcutData = {
                                    target: node.shortcutTarget,
                                    type: node.shortcutType
                                };
                                // Remove .lnk extension for display
                                displayName = item.name.replace('.lnk', '');
                            }
                        } catch (e) {
                            icon = '🔗';
                        }
                    } else if (item.extension === 'exe') {
                        icon = '⚙️';
                        itemType = 'executable';
                        // Try to get appId from the file
                        try {
                            const filePath = [...path, item.name];
                            const node = FileSystemManager.getNode(filePath);
                            if (node && node.appId) {
                                shortcutData = { appId: node.appId };
                            }
                        } catch (e) { console.error('[MyComputer] Failed to extract appId:', e); }
                    } else {
                        icon = this.getFileIcon((item.extension || '').toLowerCase());
                    }
                }

                return {
                    name: item.name,
                    displayName: displayName,
                    icon: icon,
                    type: itemType,
                    size: item.type === 'file' ? FileSystemManager.formatSize(item.size) : '',
                    modified: item.modified ? new Date(item.modified).toLocaleDateString() : '',
                    extension: item.extension,
                    shortcutData: shortcutData
                };
            });

            html += `<h3 style="margin: 0 0 15px 0; font-size: 14px; color: #000080;">📁 ${isDriveRoot ? 'Folders and Files' : 'Contents'}</h3>`;
            html += this.getInstanceState('viewMode') === 'grid' ?
                this.renderGridView(displayItems) :
                this.renderListView(displayItems);

            return html;
        } catch (e) {
            return `<div style="padding: 20px; color: red;">Error loading directory: ${e.message}</div>`;
        }
    }

    renderGridView(items) {
        const currentPath = this.getInstanceState('currentPath') || [];

        if (items.length === 0) {
            return `
                <div class="mycomputer-empty">
                    <div class="mycomputer-empty-icon">📂</div>
                    <div>This folder is empty.</div>
                </div>
            `;
        }

        return `
            <div class="mycomputer-view-grid">
                ${items.map((item, idx) => {
                    const itemPath = [...currentPath, item.name];
                    const isDraggable = item.type === 'file' || item.type === 'directory';
                    const shortcutDataAttr = item.shortcutData ? `data-shortcut='${JSON.stringify(item.shortcutData)}'` : '';
                    return `
                    <div class="mycomputer-item ${escapeHtml(item.type)}-item"
                         data-index="${idx}"
                         data-name="${escapeHtml(item.name)}"
                         data-type="${escapeHtml(item.type)}"
                         data-extension="${escapeHtml(item.extension || '')}"
                         ${shortcutDataAttr}
                         ${isDraggable ? `draggable="true" data-file-path='${JSON.stringify(itemPath)}'` : ''}>
                        <div class="mycomputer-item-icon">${item.icon}</div>
                        <div class="mycomputer-item-label">${escapeHtml(item.displayName || item.name)}</div>
                    </div>
                `;}).join('')}
            </div>
        `;
    }

    renderListView(items) {
        const currentPath = this.getInstanceState('currentPath') || [];

        if (items.length === 0) {
            return `
                <div class="mycomputer-empty">
                    <div class="mycomputer-empty-icon">📂</div>
                    <div>This folder is empty.</div>
                </div>
            `;
        }

        return `
            <div class="mycomputer-view-list">
                ${items.map((item, idx) => {
                    const itemPath = [...currentPath, item.name];
                    const isDraggable = item.type === 'file' || item.type === 'directory';
                    const shortcutDataAttr = item.shortcutData ? `data-shortcut='${JSON.stringify(item.shortcutData)}'` : '';
                    return `
                    <div class="mycomputer-list-item ${escapeHtml(item.type)}-item"
                         data-index="${idx}"
                         data-name="${escapeHtml(item.name)}"
                         data-type="${escapeHtml(item.type)}"
                         data-extension="${escapeHtml(item.extension || '')}"
                         ${shortcutDataAttr}
                         ${isDraggable ? `draggable="true" data-file-path='${JSON.stringify(itemPath)}'` : ''}>
                        <div class="mycomputer-list-icon">${item.icon}</div>
                        <div class="mycomputer-list-name">${escapeHtml(item.displayName || item.name)}</div>
                        <div class="mycomputer-list-size">${escapeHtml(item.size || '')}</div>
                        <div class="mycomputer-list-date">${escapeHtml(item.modified || '')}</div>
                    </div>
                `;}).join('')}
            </div>
        `;
    }

    setupToolbarHandlers() {
        // Back button
        const backBtn = this.getElement('#back-btn');
        if (backBtn) {
            this.addHandler(backBtn, 'click', () => {
                this.navigateBack();
            });
        }

        // Forward button
        const forwardBtn = this.getElement('#forward-btn');
        if (forwardBtn) {
            this.addHandler(forwardBtn, 'click', () => {
                this.navigateForward();
            });
        }

        // Up button
        const upBtn = this.getElement('#up-btn');
        if (upBtn) {
            this.addHandler(upBtn, 'click', () => {
                this.navigateUp();
            });
        }

        // Refresh button
        const refreshBtn = this.getElement('#refresh-btn');
        if (refreshBtn) {
            this.addHandler(refreshBtn, 'click', () => {
                this.refreshView();
            });
        }

        // View button
        const viewBtn = this.getElement('#view-btn');
        if (viewBtn) {
            this.addHandler(viewBtn, 'click', () => {
                const currentMode = this.getInstanceState('viewMode');
                const newMode = currentMode === 'grid' ? 'list' : 'grid';
                this.setInstanceState('viewMode', newMode);
                this.refreshView();
            });
        }

        // Upload button
        const uploadBtn = this.getElement('#upload-btn');
        if (uploadBtn) {
            this.addHandler(uploadBtn, 'click', () => {
                this.triggerFileUpload();
            });
        }

        // Setup content click handlers
        this.setupContentHandlers();
    }

    setupContentHandlers() {
        // Attach context menu handlers for all items
        this.attachItemContextMenus();

        // Setup item selection for all clickable items
        this.setupItemSelection();

        // Drive items (only on root view)
        const driveItems = this.getElements('.drive-item');
        driveItems.forEach(item => {
            this.addHandler(item, 'dblclick', (e) => {
                const driveLetter = e.currentTarget.dataset.drive;
                if (driveLetter) {
                    this.navigateToPath([driveLetter]);
                }
            });

            // Drop handlers for drives
            this.addHandler(item, 'dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const hasFileData = e.dataTransfer.types.includes('application/retros-file');
                const hasShortcutData = e.dataTransfer.types.includes('application/retros-shortcut');
                if (hasFileData || hasShortcutData) {
                    e.dataTransfer.dropEffect = hasShortcutData ? 'copy' : 'move';
                    item.classList.add('drop-target');
                }
            });

            this.addHandler(item, 'dragleave', (e) => {
                // Only remove highlight if actually leaving the item (not entering a child)
                if (!item.contains(e.relatedTarget)) {
                    item.classList.remove('drop-target');
                }
            });

            this.addHandler(item, 'drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                item.classList.remove('drop-target');
                const driveLetter = item.dataset.drive;
                if (driveLetter) {
                    this.handleDriveDrop(e, driveLetter);
                }
            });
        });

        // System folder items (only on root view)
        const folderItems = this.getElements('.folder-item');
        folderItems.forEach(item => {
            this.addHandler(item, 'dblclick', (e) => {
                const appId = e.currentTarget.dataset.folder;
                if (appId && AppRegistry) {
                    AppRegistry.launch(appId);
                }
            });

            // Drop handlers for system folders (My Documents, My Pictures, etc.)
            const folderName = item.querySelector('.mycomputer-item-label')?.textContent;
            if (folderName) {
                this.addHandler(item, 'dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const hasFileData = e.dataTransfer.types.includes('application/retros-file');
                    const hasShortcutData = e.dataTransfer.types.includes('application/retros-shortcut');
                    if (hasFileData || hasShortcutData) {
                        e.dataTransfer.dropEffect = hasShortcutData ? 'copy' : 'move';
                        item.classList.add('drop-target');
                    }
                });

                this.addHandler(item, 'dragleave', (e) => {
                    // Only remove highlight if actually leaving the item (not entering a child)
                    if (!item.contains(e.relatedTarget)) {
                        item.classList.remove('drop-target');
                    }
                });

                this.addHandler(item, 'drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    item.classList.remove('drop-target');
                    this.handleSystemFolderDrop(e, folderName);
                });
            }
        });

        // Directory items (in file system)
        const directoryItems = this.getElements('.directory-item');
        directoryItems.forEach(item => {
            this.addHandler(item, 'dblclick', (e) => {
                const dirName = e.currentTarget.dataset.name;
                if (dirName) {
                    const currentPath = this.getInstanceState('currentPath') || [];
                    const newPath = [...currentPath, dirName];
                    this.navigateToPath(newPath);
                }
            });
        });

        // File items - open with appropriate app
        const fileItems = this.getElements('.file-item');
        fileItems.forEach(item => {
            this.addHandler(item, 'dblclick', (e) => {
                const fileName = e.currentTarget.dataset.name;
                if (fileName) {
                    this.openFile(fileName);
                }
            });
        });

        // Shortcut items - open the target app or link
        const shortcutItems = this.getElements('.shortcut-item');
        shortcutItems.forEach(item => {
            this.addHandler(item, 'dblclick', (e) => {
                const shortcutData = e.currentTarget.dataset.shortcut;
                if (shortcutData) {
                    try {
                        const data = JSON.parse(shortcutData);
                        if (data.type === 'link' && data.target && isSafeHttpUrl(data.target)) {
                            // Open URL in browser or new tab
                            window.open(data.target, '_blank');
                        } else if (data.target) {
                            // Launch the app
                            AppRegistry.launch(data.target);
                        }
                    } catch (err) {
                        console.error('Failed to open shortcut:', err);
                    }
                }
            });
        });

        // Executable items - launch the associated app
        const executableItems = this.getElements('.executable-item');
        executableItems.forEach(item => {
            this.addHandler(item, 'dblclick', (e) => {
                const shortcutData = e.currentTarget.dataset.shortcut;
                if (shortcutData) {
                    try {
                        const data = JSON.parse(shortcutData);
                        if (data.appId) {
                            AppRegistry.launch(data.appId);
                        }
                    } catch (err) {
                        console.error('Failed to launch executable:', err);
                    }
                }
            });
        });

        // Selection for all items
        const allItems = this.getElements('.drive-item, .folder-item, .directory-item, .file-item, .shortcut-item, .executable-item');
        allItems.forEach(item => {
            this.addHandler(item, 'click', (e) => {
                allItems.forEach(i => i.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
            });
        });

        // Drag events for draggable items (files and directories)
        const draggableItems = this.getElements('[draggable="true"]');
        draggableItems.forEach(item => {
            this.addHandler(item, 'dragstart', (e) => {
                const filePath = JSON.parse(item.dataset.filePath);
                const fileName = item.dataset.name;
                const fileType = item.dataset.type;

                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/retros-file', JSON.stringify({
                    filePath: filePath,
                    fileName: fileName,
                    fileType: fileType
                }));
                item.classList.add('dragging');
            });

            this.addHandler(item, 'dragend', () => {
                item.classList.remove('dragging');
            });
        });

        // Drop events for directory items (drop files into folders)
        // Note: reusing directoryItems from above for drop handlers
        directoryItems.forEach(item => {
            this.addHandler(item, 'dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const hasFileData = e.dataTransfer.types.includes('application/retros-file');
                const hasShortcutData = e.dataTransfer.types.includes('application/retros-shortcut');
                if (hasFileData || hasShortcutData) {
                    e.dataTransfer.dropEffect = hasShortcutData ? 'copy' : 'move';
                    item.classList.add('drop-target');
                }
            });

            this.addHandler(item, 'dragleave', (e) => {
                // Only remove highlight if actually leaving the item (not entering a child)
                if (!item.contains(e.relatedTarget)) {
                    item.classList.remove('drop-target');
                }
            });

            this.addHandler(item, 'drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                item.classList.remove('drop-target');
                this.handleFolderDrop(e, item.dataset.name);
            });
        });
    }

    /**
     * Handle file drop onto a folder item
     * @param {DragEvent} e - Drag event
     * @param {string} folderName - Target folder name
     */
    handleFolderDrop(e, folderName) {
        const currentPath = this.getInstanceState('currentPath') || [];
        const targetPath = [...currentPath, folderName];

        // Check for shortcut data (app icons dragged from desktop)
        const shortcutData = e.dataTransfer.getData('application/retros-shortcut');
        if (shortcutData) {
            this.createShortcutFromDrop(shortcutData, targetPath);
            return;
        }

        const data = e.dataTransfer.getData('application/retros-file');
        if (!data) return;

        try {
            const fileData = JSON.parse(data);
            const { filePath, fileName, isShortcut, shortcutTarget, shortcutType, shortcutIcon } = fileData;

            // If this is a shortcut being created from an app icon
            if (isShortcut && shortcutTarget) {
                this.createShortcutFile(targetPath, fileName, shortcutTarget, shortcutType, shortcutIcon);
                return;
            }

            if (!filePath || !Array.isArray(filePath)) {
                console.error('Invalid file path in drop data');
                return;
            }

            // Check if dropping to same location
            const sourceDir = filePath.slice(0, -1);
            if (JSON.stringify(sourceDir) === JSON.stringify(targetPath)) {
                console.log('File is already in this directory');
                return;
            }

            // Can't drop a folder into itself
            if (JSON.stringify(filePath) === JSON.stringify(targetPath)) {
                console.log('Cannot drop a folder into itself');
                return;
            }

            // Move the file to target directory
            try {
                FileSystemManager.moveItem(filePath, targetPath);
                console.log(`Moved ${fileName} to ${targetPath.join('/')}`);
            } catch (err) {
                console.error('Failed to move file:', err.message);
            }
        } catch (err) {
            console.error('Failed to parse drop data:', err);
        }
    }

    /**
     * Handle file drop onto a drive
     * @param {DragEvent} e - Drag event
     * @param {string} driveLetter - Target drive letter (e.g., 'C:')
     */
    handleDriveDrop(e, driveLetter) {
        const targetPath = [driveLetter];

        // Check for shortcut data (app icons dragged from desktop)
        const shortcutData = e.dataTransfer.getData('application/retros-shortcut');
        if (shortcutData) {
            this.createShortcutFromDrop(shortcutData, targetPath);
            return;
        }

        const data = e.dataTransfer.getData('application/retros-file');
        if (!data) return;

        try {
            const fileData = JSON.parse(data);
            const { filePath, fileName, isShortcut, shortcutTarget, shortcutType, shortcutIcon } = fileData;

            // If this is a shortcut being created from an app icon
            if (isShortcut && shortcutTarget) {
                this.createShortcutFile(targetPath, fileName, shortcutTarget, shortcutType, shortcutIcon);
                return;
            }

            if (!filePath || !Array.isArray(filePath)) {
                console.error('Invalid file path in drop data');
                return;
            }

            // Check if dropping to same location (drive root)
            const sourceDir = filePath.slice(0, -1);
            if (sourceDir.length === 1 && sourceDir[0] === driveLetter) {
                console.log('File is already in this drive root');
                return;
            }

            // Move the file to drive root
            try {
                FileSystemManager.moveItem(filePath, targetPath);
                console.log(`Moved ${fileName} to ${driveLetter}`);
            } catch (err) {
                console.error('Failed to move file:', err.message);
            }
        } catch (err) {
            console.error('Failed to parse drop data:', err);
        }
    }

    /**
     * Handle file drop onto a system folder (My Documents, My Pictures, etc.)
     * @param {DragEvent} e - Drag event
     * @param {string} folderName - System folder name
     */
    handleSystemFolderDrop(e, folderName) {
        // Map system folder names to actual paths (using Constants)
        const folderPaths = {
            'My Documents': [...PATHS.DOCUMENTS],
            'My Pictures': [...PATHS.PICTURES],
            'My Music': [...PATHS.MUSIC],
            'Recycle Bin': null, // Can't drop directly to recycle bin
            'Control Panel': null // Can't drop to control panel
        };

        const targetPath = folderPaths[folderName];
        if (!targetPath) {
            console.log(`Cannot drop files to ${folderName}`);
            return;
        }

        // Check for shortcut data (app icons dragged from desktop)
        const shortcutData = e.dataTransfer.getData('application/retros-shortcut');
        if (shortcutData) {
            this.createShortcutFromDrop(shortcutData, targetPath);
            return;
        }

        const data = e.dataTransfer.getData('application/retros-file');
        if (!data) return;

        try {
            const fileData = JSON.parse(data);
            const { filePath, fileName, isShortcut, shortcutTarget, shortcutType, shortcutIcon } = fileData;

            // If this is a shortcut being created from an app icon
            if (isShortcut && shortcutTarget) {
                this.createShortcutFile(targetPath, fileName, shortcutTarget, shortcutType, shortcutIcon);
                return;
            }

            if (!filePath || !Array.isArray(filePath)) {
                console.error('Invalid file path in drop data');
                return;
            }

            // Check if dropping to same location
            const sourceDir = filePath.slice(0, -1);
            if (JSON.stringify(sourceDir) === JSON.stringify(targetPath)) {
                console.log('File is already in this directory');
                return;
            }

            // Move the file to system folder
            try {
                FileSystemManager.moveItem(filePath, targetPath);
                console.log(`Moved ${fileName} to ${folderName}`);
            } catch (err) {
                console.error('Failed to move file:', err.message);
            }
        } catch (err) {
            console.error('Failed to parse drop data:', err);
        }
    }

    openFile(fileName) {
        const currentPath = this.getInstanceState('currentPath') || [];
        const filePath = [...currentPath, fileName];

        try {
            const fileInfo = FileSystemManager.getInfo(filePath);
            const ext = (fileInfo.extension || '').toLowerCase();

            // For server-backed files, pass the server ID so apps can fetch content
            const node = FileSystemManager.getNode(filePath);
            const launchOpts = { filePath };
            if (node && node.isServerFile && node.serverId) {
                launchOpts.serverFile = true;
                launchOpts.serverId = node.serverId;
                launchOpts.mimeType = node.mimeType;
            }

            const textExts = ['txt', 'md', 'log', 'ini', 'cfg', 'json', 'xml', 'html', 'css', 'js', 'csv', 'bat'];
            const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff', 'tif'];
            const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'mid', 'midi'];
            const videoExts = ['mp4', 'avi', 'mkv', 'webm', 'ogv', 'mov'];

            // Determine which app to use based on file extension
            if (textExts.includes(ext)) {
                AppRegistry.launch('notepad', launchOpts);
            } else if (imageExts.includes(ext)) {
                AppRegistry.launch('paint', launchOpts);
            } else if (audioExts.includes(ext) || videoExts.includes(ext)) {
                AppRegistry.launch('mediaplayer', launchOpts);
            } else if (ext === 'retro') {
                AppRegistry.launch('scriptrunner', launchOpts);
            } else if (ext === 'exe') {
                // Check if it's a registered app
                const node = FileSystemManager.getNode(filePath);
                if (node && node.appId) {
                    AppRegistry.launch(node.appId);
                }
            } else if (ext === 'lnk') {
                // Handle shortcut files
                const node = FileSystemManager.getNode(filePath);
                if (node && node.isShortcut) {
                    if (node.shortcutType === 'app') {
                        AppRegistry.launch(node.shortcutTarget);
                    } else if (node.shortcutType === 'link') {
                        AppRegistry.launch('browser', { url: node.shortcutTarget });
                    }
                }
            } else {
                // Default: try opening in Notepad for unknown text-like files
                AppRegistry.launch('notepad', launchOpts);
            }
        } catch (e) {
            console.error('Error opening file:', e);
        }
    }

    navigateToPath(path) {
        // Save current path to history
        const history = this.getInstanceState('history') || [];
        const currentPath = this.getInstanceState('currentPath') || [];
        if (currentPath.length > 0 || path.length > 0) {
            history.push([...currentPath]);
            this.setInstanceState('history', history);
        }

        // Clear forward history when navigating to new path
        this.setInstanceState('forwardHistory', []);

        // Navigate to new path
        this.setInstanceState('currentPath', path);
        this.refreshView();
    }

    navigateBack() {
        const history = this.getInstanceState('history') || [];
        if (history.length === 0) return;

        // Save current path to forward history
        const currentPath = this.getInstanceState('currentPath') || [];
        const forwardHistory = this.getInstanceState('forwardHistory') || [];
        forwardHistory.push([...currentPath]);
        this.setInstanceState('forwardHistory', forwardHistory);

        const previousPath = history.pop();
        this.setInstanceState('history', history);
        this.setInstanceState('currentPath', previousPath);
        this.refreshView();
    }

    navigateForward() {
        const forwardHistory = this.getInstanceState('forwardHistory') || [];
        if (forwardHistory.length === 0) return;

        // Save current path to back history
        const currentPath = this.getInstanceState('currentPath') || [];
        const history = this.getInstanceState('history') || [];
        history.push([...currentPath]);
        this.setInstanceState('history', history);

        const nextPath = forwardHistory.pop();
        this.setInstanceState('forwardHistory', forwardHistory);
        this.setInstanceState('currentPath', nextPath);
        this.refreshView();
    }

    navigateUp() {
        const currentPath = this.getInstanceState('currentPath') || [];
        if (currentPath.length === 0) return; // Already at root

        // Save to history and clear forward history
        const history = this.getInstanceState('history') || [];
        history.push([...currentPath]);
        this.setInstanceState('history', history);
        this.setInstanceState('forwardHistory', []);

        // Go up one level
        const newPath = currentPath.slice(0, -1);
        this.setInstanceState('currentPath', newPath);
        this.refreshView();
    }

    refreshView() {
        const currentPath = this.getInstanceState('currentPath') || [];
        const content = this.getElement('#content');
        const addressBar = this.getElement('#address-bar');
        const backBtn = this.getElement('#back-btn');
        const forwardBtn = this.getElement('#forward-btn');
        const upBtn = this.getElement('#up-btn');
        const history = this.getInstanceState('history') || [];
        const forwardHistory = this.getInstanceState('forwardHistory') || [];

        // Clear selection when view changes
        this.setInstanceState('selectedItem', null);

        let html = '';
        let address = 'My Computer';

        if (currentPath.length === 0) {
            // Root view - show drives and system folders
            html = this.renderRootView();
            address = 'My Computer';
            if (backBtn) backBtn.disabled = history.length === 0;
            if (forwardBtn) forwardBtn.disabled = forwardHistory.length === 0;
            if (upBtn) upBtn.disabled = true;
        } else {
            // Directory view - show contents
            html = this.renderDirectoryView(currentPath);
            address = 'My Computer\\' + currentPath.join('\\');
            if (backBtn) backBtn.disabled = history.length === 0;
            if (forwardBtn) forwardBtn.disabled = forwardHistory.length === 0;
            if (upBtn) upBtn.disabled = false;
        }

        if (content) content.innerHTML = html;
        if (addressBar) addressBar.textContent = address;

        // Re-setup handlers for new content
        this.setupContentHandlers();
        this.updateStatus();

        // Apply cut visual state to items
        this.updateCutVisualState();
    }

    /**
     * Update cut visual state for all items
     * Applies .cut class to items that are in the cut list
     */
    updateCutVisualState() {
        const cutItemPaths = this.getInstanceState('cutItemPaths') || [];
        const content = this.getElement('#content');
        const currentPath = this.getInstanceState('currentPath') || [];

        if (!content) return;

        // Remove cut class from all items first
        content.querySelectorAll('.cut').forEach(el => el.classList.remove('cut'));

        if (cutItemPaths.length === 0) return;

        // Get all file and directory items and apply cut class if they match
        const allItems = content.querySelectorAll('.file-item, .directory-item');
        allItems.forEach(item => {
            const itemName = item.dataset.name;
            if (itemName) {
                // Compute full path same way as context menu handlers
                const itemPath = [...currentPath, itemName];
                const pathStr = JSON.stringify(itemPath);
                if (cutItemPaths.includes(pathStr)) {
                    item.classList.add('cut');
                }
            }
        });
    }

    /**
     * Open a native file picker and upload the selected file(s).
     * Uses PHP backend if available, otherwise stores files client-side
     * as data URLs in the virtual filesystem.
     */
    triggerFileUpload() {
        const currentPath = this.getInstanceState('currentPath') || [];
        if (currentPath.length === 0) {
            EventBus.emit('notification:show', {
                title: 'Upload',
                message: 'Navigate to a folder before uploading.',
                type: 'warning',
                duration: 3000,
            });
            return;
        }

        // Create a hidden file input
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        // Accept a broad range of file types
        input.accept = [
            // Images
            'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/tiff',
            // Audio
            'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/x-m4a', 'audio/webm', 'audio/midi',
            // Video
            'video/mp4', 'video/webm', 'video/ogg', 'video/x-msvideo', 'video/x-matroska', 'video/quicktime',
            // Documents
            'text/plain', 'text/html', 'text/css', 'text/javascript', 'text/markdown', 'text/csv',
            'application/json', 'application/xml', 'application/pdf',
            // Common extensions
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif',
            '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.mid', '.midi',
            '.mp4', '.webm', '.ogv', '.avi', '.mkv', '.mov',
            '.txt', '.md', '.log', '.ini', '.cfg', '.json', '.xml', '.html', '.css', '.js', '.csv',
            '.retro'
        ].join(',');
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            document.body.removeChild(input);

            if (files.length === 0) return;

            let successCount = 0;
            let errorMessages = [];

            // If backend available, use server upload; otherwise store client-side
            const useBackend = isBackendAvailable();

            for (const file of files) {
                try {
                    if (useBackend) {
                        const virtualPath = [...currentPath, file.name].join('/');
                        await FileSystemManager.uploadFile(virtualPath, file);
                    } else {
                        await this.storeFileClientSide(file, currentPath);
                    }
                    successCount++;
                } catch (err) {
                    errorMessages.push(`${file.name}: ${err.message}`);
                }
            }

            // Show result notification
            if (successCount > 0) {
                EventBus.emit('notification:show', {
                    title: 'Upload Complete',
                    message: `${successCount} file(s) imported successfully.`,
                    type: 'success',
                    duration: 3000,
                });
                this.refreshView();
            }

            if (errorMessages.length > 0) {
                EventBus.emit('notification:show', {
                    title: 'Import Error',
                    message: errorMessages.join('\n'),
                    type: 'error',
                    duration: 6000,
                });
            }
        });

        input.click();
    }

    /**
     * Store a user-selected file client-side in the virtual filesystem.
     * Images and text are stored as data URLs/text content.
     * Audio/video files are stored with blob URL references.
     */
    storeFileClientSide(file, targetPath) {
        return new Promise((resolve, reject) => {
            const fileName = file.name;
            const ext = (fileName.split('.').pop() || '').toLowerCase();
            const filePath = [...targetPath, fileName];

            // Determine file category
            const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif'];
            const textExts = ['txt', 'md', 'log', 'ini', 'cfg', 'json', 'xml', 'html', 'css', 'js', 'csv', 'retro'];
            const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'mid', 'midi', 'webm'];
            const videoExts = ['mp4', 'webm', 'ogv', 'avi', 'mkv', 'mov'];

            if (textExts.includes(ext)) {
                // Read as text
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        FileSystemManager.writeFile(filePath, e.target.result, ext);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            } else if (imageExts.includes(ext)) {
                // Read as data URL for images (so Paint can display them)
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        FileSystemManager.writeFile(filePath, e.target.result, ext);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            } else if (audioExts.includes(ext) || videoExts.includes(ext)) {
                // For media files, create a blob URL and store metadata
                const blobUrl = URL.createObjectURL(file);
                const mimeType = file.type || `${audioExts.includes(ext) ? 'audio' : 'video'}/${ext}`;
                try {
                    const mediaName = fileName.replace(/\.[^/.]+$/, '');
                    FileSystemManager.writeFile(filePath, '', ext, {
                        src: blobUrl,
                        mediaName: mediaName,
                        mimeType: mimeType,
                        size: file.size,
                        isBlob: true
                    });
                    resolve();
                } catch (err) {
                    reject(err);
                }
            } else {
                // For other files, try reading as data URL
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        FileSystemManager.writeFile(filePath, e.target.result, ext);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            }
        });
    }

    updateStatus() {
        const statusText = this.getElement('#status-text');
        const statusItems = this.getElement('#status-items');
        const currentPath = this.getInstanceState('currentPath') || [];

        if (!statusText || !statusItems) return;

        if (currentPath.length === 0) {
            // Root view
            const drives = this.getDrives();
            statusText.textContent = 'My Computer';
            statusItems.textContent = `${drives.length} drive(s)`;
        } else {
            // Directory view
            try {
                const items = FileSystemManager.listDirectory(currentPath);
                statusText.textContent = currentPath.join('\\');
                statusItems.textContent = `${items.length} item(s)`;
            } catch (e) {
                statusText.textContent = 'Error';
                statusItems.textContent = '';
            }
        }
    }
}

export default MyComputer;
