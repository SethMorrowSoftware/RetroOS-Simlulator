/**
 * DesktopRenderer - Renders and manages desktop icons
 * Handles icon display, drag & drop, and desktop interactions
 */

import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import AppRegistry from '../apps/AppRegistry.js';
import FileSystemManager from '../core/FileSystemManager.js';
import { PATHS } from '../core/Constants.js';
import { GRID, snapToSlot, getNextDesktopSlot, findNearestFreeSlot, getAllOccupiedPositions } from '../core/DesktopLayout.js';

const debugLog = (...args) => {
    if (window.__RETRO_OS_DEBUG__ === true) {
        console.log(...args);
    }
};


class DesktopRendererClass {
    constructor() {
        this.desktop = null;
        this.draggedIcon = null;
        this.dragOffset = { x: 0, y: 0 };
        this.selectionBox = null;
        this.selectionStart = null;

        // Bound handlers for selection box
        this.boundUpdateSelection = this.updateSelection.bind(this);
        this.boundEndSelection = this.endSelection.bind(this);

        // Debounced render to prevent excessive DOM thrashing
        this._renderTimer = null;
        this._renderBound = this._doRender.bind(this);
    }

    /**
     * Initialize desktop renderer
     */
    initialize() {
        this.desktop = document.getElementById('desktop');
        if (!this.desktop) {
            console.error('[DesktopRenderer] Desktop element not found');
            return;
        }

        // Track cut item paths for visual styling
        this.cutItemPaths = [];

        // Track subscriptions for cleanup
        this._unsubs = [];

        // Initial render
        this.render();

        // Subscribe to state changes
        this._unsubs.push(StateManager.subscribe('icons', () => this.render()));

        // Listen for render requests
        this._unsubs.push(EventBus.on('desktop:render', () => this.render()));

        // Listen for file system changes
        this._unsubs.push(EventBus.on('filesystem:changed', () => this.render()));
        this._unsubs.push(EventBus.on('filesystem:file:changed', () => this.render()));
        this._unsubs.push(EventBus.on('filesystem:directory:changed', () => this.render()));

        // Listen for clipboard cut state changes
        this._unsubs.push(EventBus.on('clipboard:cut-state', ({ cutPaths }) => {
            this.cutItemPaths = cutPaths || [];
            this.updateCutVisualState();
        }));

        // Listen for recycle bin requests to recycle file icons
        this._unsubs.push(EventBus.on('recyclebin:recycle-file', ({ iconId }) => {
            const iconEl = this.desktop.querySelector(`[data-icon-id="${iconId}"]`);
            if (iconEl && iconEl._iconData) {
                this.recycleFileToTrash(iconEl._iconData);
                this.render();
            }
        }));

        // Setup desktop events
        this.setupDesktopEvents();

        // Setup delegated icon event handlers (once, not per-icon)
        this.setupIconDelegation();

        debugLog('[DesktopRenderer] Initialized');
    }

    /**
     * Setup delegated event handlers for icon interactions.
     * Uses event delegation on the desktop element so handlers
     * don't need to be re-attached when icons are re-rendered.
     */
    setupIconDelegation() {
        // Double-click to open icon
        this.desktop.addEventListener('dblclick', (e) => {
            const iconEl = e.target.closest('.icon[data-icon-id]');
            if (iconEl && iconEl._iconData) {
                this.handleIconOpen(iconEl._iconData);
            }
        });

        // Right-click context menu for icon
        this.desktop.addEventListener('contextmenu', (e) => {
            const iconEl = e.target.closest('.icon[data-icon-id]');
            if (iconEl && iconEl._iconData) {
                this.showIconContextMenu(e, iconEl._iconData);
            }
        });

        // Enter key to open icon
        this.desktop.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const iconEl = e.target.closest('.icon[data-icon-id]');
                if (iconEl && iconEl._iconData) {
                    this.handleIconOpen(iconEl._iconData);
                }
            }
        });
    }

    /**
     * Render all desktop icons (debounced to prevent DOM thrashing).
     * Multiple rapid state changes are coalesced into a single render pass.
     */
    render() {
        if (!this.desktop) return;

        if (this._renderTimer) {
            cancelAnimationFrame(this._renderTimer);
        }
        this._renderTimer = requestAnimationFrame(this._renderBound);
    }

    /**
     * Internal render implementation — called by the debounced render().
     */
    _doRender() {
        this._renderTimer = null;
        if (!this.desktop) return;

        const icons = StateManager.getState('icons') || [];

        // Clear existing icons (preserve special elements)
        Array.from(this.desktop.children).forEach(child => {
            if (child.classList.contains('icon')) {
                child.remove();
            }
        });

        // Render app/link icons from StateManager
        icons.forEach(icon => this.renderIcon(icon));

        // Render file icons from Desktop folder
        this.renderFileIcons();

        // Apply cut visual state after rendering
        this.updateCutVisualState();
    }

    /**
     * Render file icons from the Desktop folder
     * Skips .lnk files since those are already rendered from StateManager icons
     */
    renderFileIcons() {
        try {
            const desktopPath = [...PATHS.DESKTOP];
            debugLog('[DesktopRenderer] renderFileIcons() - Looking in:', desktopPath.join('/'));

            const files = FileSystemManager.listDirectory(desktopPath);
            debugLog('[DesktopRenderer] Files found in Desktop folder:', files.length, files.map(f => `${f.name} (${f.type})`));

            // Filter out .lnk files - those are shortcuts synced from StateManager
            // and are already displayed as icons on the desktop
            const realFiles = files.filter(file => file.extension !== 'lnk');
            debugLog('[DesktopRenderer] Real files (non-.lnk) to render:', realFiles.length, realFiles.map(f => f.name));

            // Get saved file positions
            const filePositions = StateManager.getState('filePositions') || {};

            let positionsUpdated = false;

            realFiles.forEach((file) => {
                const fileId = `file_${file.name}`;

                let x, y;

                // Use saved position if it exists
                if (filePositions[fileId]) {
                    x = filePositions[fileId].x;
                    y = filePositions[fileId].y;
                } else {
                    const occupiedPositions = [
                        ...(StateManager.getState('icons') || []),
                        ...Object.values(filePositions)
                    ];
                    const slot = getNextDesktopSlot(occupiedPositions);
                    x = slot.x;
                    y = slot.y;

                    // Save position so it persists and is visible to future slots
                    filePositions[fileId] = { x, y };
                    positionsUpdated = true;
                }

                const fileIcon = {
                    id: fileId,
                    emoji: this.getFileEmoji(file),
                    label: file.name,
                    type: 'file',
                    filePath: [...desktopPath, file.name],
                    fileType: file.type,
                    extension: file.extension,
                    x: x,
                    y: y
                };

                // Debug logging
                debugLog('[DesktopRenderer] Creating file icon:', fileIcon.label, 'type:', fileIcon.type);

                this.renderIcon(fileIcon);
            });

            // Persist new file positions if any were added
            if (positionsUpdated) {
                StateManager.setState('filePositions', filePositions, true);
            }
        } catch (e) {
            debugLog('Desktop folder empty or not found:', e.message);
        }
    }

    /**
     * Get emoji icon for file based on type
     * @param {Object} file - File metadata
     * @returns {string} Emoji
     */
    getFileEmoji(file) {
        if (file.type === 'directory') {
            return '📁';
        } else if (file.type === 'file') {
            const ext = (file.extension || '').toLowerCase();
            const iconMap = {
                // Text / code
                'txt': '📝', 'md': '📝', 'log': '📋', 'ini': '📋', 'cfg': '📋',
                'json': '📋', 'xml': '📋', 'csv': '📊',
                'js': '📜', 'css': '🎨', 'html': '🌐', 'retro': '📜',
                // Images
                'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️',
                'bmp': '🖼️', 'webp': '🖼️', 'svg': '🖼️', 'ico': '🖼️',
                'tiff': '🖼️', 'tif': '🖼️',
                // Audio
                'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
                'm4a': '🎵', 'aac': '🎵', 'wma': '🎵', 'mid': '🎵', 'midi': '🎵',
                // Video
                'mp4': '🎬', 'webm': '🎬', 'ogv': '🎬', 'avi': '🎬',
                'mkv': '🎬', 'mov': '🎬',
                // System
                'exe': '⚙️', 'lnk': '🔗', 'pdf': '📕',
                'zip': '📦', 'tar': '📦', 'gz': '📦'
            };
            return iconMap[ext] || '📄';
        }
        return '📄';
    }

    /**
     * Render a single icon
     * @param {Object} icon - Icon data
     */
    renderIcon(icon) {
        const iconEl = document.createElement('div');
        iconEl.className = 'icon';
        iconEl.dataset.iconId = icon.id;
        iconEl.style.left = `${icon.x}px`;
        iconEl.style.top = `${icon.y}px`;
        iconEl.tabIndex = 0;
        iconEl.draggable = true;

        // Store icon data for drag operations
        iconEl.dataset.iconType = icon.type || 'app';
        if (icon.filePath) {
            iconEl.dataset.filePath = JSON.stringify(icon.filePath);
            iconEl.dataset.fileType = icon.fileType || 'file';
        }

        // Store full icon data for reference
        iconEl._iconData = icon;

        const iconImageDiv = document.createElement('div');
        iconImageDiv.className = 'icon-image';
        iconImageDiv.textContent = icon.emoji;
        const iconLabelDiv = document.createElement('div');
        iconLabelDiv.className = 'icon-label';
        iconLabelDiv.textContent = icon.label;
        iconEl.appendChild(iconImageDiv);
        iconEl.appendChild(iconLabelDiv);

        // HTML5 drag start - set transfer data
        iconEl.addEventListener('dragstart', (e) => {
            // Store the icon being dragged for repositioning
            this.draggedIcon = { element: iconEl, data: icon };

            // Calculate offset from mouse to icon top-left
            const rect = iconEl.getBoundingClientRect();
            this.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            e.dataTransfer.effectAllowed = 'copyMove';

            // Set custom drag image (the icon itself)
            const dragImage = iconEl.cloneNode(true);
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-1000px';
            dragImage.style.opacity = '0.8';
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, this.dragOffset.x, this.dragOffset.y);
            setTimeout(() => dragImage.remove(), 0);

            // Set transfer data for inter-component drag
            if (icon.type === 'file' && icon.filePath) {
                e.dataTransfer.setData('application/retros-file', JSON.stringify({
                    filePath: icon.filePath,
                    fileName: icon.label,
                    fileType: icon.fileType || 'file',
                    extension: icon.extension || ''
                }));
            } else {
                e.dataTransfer.setData('application/retros-shortcut', JSON.stringify({
                    id: icon.id,
                    label: icon.label,
                    emoji: icon.emoji,
                    type: icon.type || 'app',
                    url: icon.url || null
                }));
                e.dataTransfer.setData('application/retros-file', JSON.stringify({
                    filePath: null,
                    fileName: icon.label,
                    fileType: 'shortcut',
                    isShortcut: true,
                    shortcutTarget: icon.type === 'link' ? icon.url : icon.id,
                    shortcutType: icon.type || 'app',
                    shortcutIcon: icon.emoji
                }));
            }

            // Set desktop icon ID for repositioning
            e.dataTransfer.setData('application/retros-desktop-icon', JSON.stringify({
                id: icon.id,
                type: icon.type
            }));

            iconEl.classList.add('dragging');
            EventBus.emit(Events.DRAG_START, { type: 'icon', id: icon.id });
        });

        iconEl.addEventListener('dragend', () => {
            iconEl.classList.remove('dragging');
            this.draggedIcon = null;
            // Clear any recycle bin highlight
            const recycleBin = this.desktop.querySelector('[data-icon-id="recyclebin"]');
            if (recycleBin) recycleBin.classList.remove('drop-target');
            EventBus.emit(Events.DRAG_END, { type: 'icon', id: icon.id });
        });

        this.desktop.appendChild(iconEl);
    }

    /**
     * Handle icon double-click
     * @param {Object} icon - Icon data
     */
    handleIconOpen(icon) {
        EventBus.emit(Events.SOUND_PLAY, { type: 'open' });
        EventBus.emit(Events.ICON_DBLCLICK, {
            iconId: icon.id,
            appId: icon.type === 'app' ? icon.id : undefined
        });

        if (icon.type === 'link' && icon.url) {
            AppRegistry.launch('browser', { url: icon.url });
        } else if (icon.type === 'app') {
            AppRegistry.launch(icon.id);
        } else if (icon.type === 'file') {
            // Open file in appropriate app
            this.openFile(icon);
        }
    }

    /**
     * Open a file in the appropriate application
     * @param {Object} icon - File icon data
     */
    openFile(icon) {
        const { filePath, extension, fileType } = icon;
        const ext = (extension || '').toLowerCase();

        if (fileType === 'directory') {
            AppRegistry.launch('mycomputer', { initialPath: filePath });
            return;
        }

        // Text / code files → Notepad
        const textExts = ['txt', 'md', 'log', 'ini', 'cfg', 'json', 'xml', 'html', 'css', 'js', 'csv'];
        // Image files → Paint
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff', 'tif'];
        // Audio files → Media Player
        const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'mid', 'midi'];
        // Video files → Media Player
        const videoExts = ['mp4', 'avi', 'mkv', 'webm', 'ogv', 'mov'];

        if (textExts.includes(ext)) {
            AppRegistry.launch('notepad', { filePath });
        } else if (imageExts.includes(ext)) {
            AppRegistry.launch('paint', { filePath });
        } else if (audioExts.includes(ext) || videoExts.includes(ext)) {
            AppRegistry.launch('mediaplayer', { filePath });
        } else if (ext === 'retro') {
            AppRegistry.launch('scriptrunner', { filePath });
        } else if (ext === 'exe') {
            const node = FileSystemManager.getNode(filePath);
            if (node && node.appId) {
                AppRegistry.launch(node.appId);
            }
        } else if (ext === 'lnk') {
            const node = FileSystemManager.getNode(filePath);
            if (node && node.isShortcut) {
                if (node.shortcutType === 'app') {
                    AppRegistry.launch(node.shortcutTarget);
                } else if (node.shortcutType === 'link') {
                    AppRegistry.launch('browser', { url: node.shortcutTarget });
                }
            }
        } else {
            // Default: try opening in Notepad
            AppRegistry.launch('notepad', { filePath });
        }
    }

    /**
     * Setup desktop-level events
     */
    setupDesktopEvents() {
        // Context menu on desktop
        this.desktop.addEventListener('contextmenu', (e) => {
            if (e.target === this.desktop) {
                e.preventDefault();
                EventBus.emit(Events.CONTEXT_MENU_SHOW, {
                    x: e.clientX,
                    y: e.clientY,
                    type: 'desktop'
                });
            }
        });

        // Selection box
        this.desktop.addEventListener('mousedown', (e) => {
            if (e.target === this.desktop && e.button === 0) {
                this.startSelection(e);
            }
        });

        // Click to deselect
        this.desktop.addEventListener('click', (e) => {
            if (e.target === this.desktop) {
                this.deselectAll();
            }
        });

        // HTML5 Drag and Drop - Desktop is a drop zone
        this.desktop.addEventListener('dragover', (e) => {
            e.preventDefault();

            // Check if this is a desktop icon being repositioned
            const isDesktopIcon = e.dataTransfer.types.includes('application/retros-desktop-icon');
            const isFileData = e.dataTransfer.types.includes('application/retros-file');
            const isRestoreFile = e.dataTransfer.types.includes('application/retros-restore-file');
            const isRestoreIcon = e.dataTransfer.types.includes('application/retros-restore-icon');

            const isNativeFiles = e.dataTransfer.types.includes('Files');

            if (isDesktopIcon || isFileData || isRestoreFile || isRestoreIcon || isNativeFiles) {
                e.dataTransfer.dropEffect = isNativeFiles ? 'copy' : 'move';

                // Check if hovering over recycle bin
                const recycleBin = this.getRecycleBinAtPoint(e.clientX, e.clientY);
                if (recycleBin) {
                    // Don't allow dropping recycle bin on itself or restoring TO recycle bin
                    if ((this.draggedIcon && this.draggedIcon.data.id === 'recyclebin') || isRestoreFile || isRestoreIcon) {
                        e.dataTransfer.dropEffect = 'none';
                        return;
                    }
                    recycleBin.classList.add('drop-target');
                    this.desktop.classList.remove('drop-target');
                } else {
                    // Clear recycle bin highlight
                    const rb = this.desktop.querySelector('[data-icon-id="recyclebin"]');
                    if (rb) rb.classList.remove('drop-target');

                    // Only show drop-target for external files (from MyComputer), not for repositioning
                    if (!isDesktopIcon && isFileData) {
                        this.desktop.classList.add('drop-target');
                    }
                }
            }
        });

        this.desktop.addEventListener('dragleave', (e) => {
            // Only remove if actually leaving the desktop
            if (e.target === this.desktop) {
                this.desktop.classList.remove('drop-target');
            }
        });

        this.desktop.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.desktop.classList.remove('drop-target');

            // Clear recycle bin highlight
            const recycleBin = this.desktop.querySelector('[data-icon-id="recyclebin"]');
            if (recycleBin) recycleBin.classList.remove('drop-target');

            // Check if this is a restoration from recycle bin
            const restoreFileData = e.dataTransfer.getData('application/retros-restore-file');
            if (restoreFileData) {
                this.handleRestoreFileDrop(e, restoreFileData);
                return;
            }

            const restoreIconData = e.dataTransfer.getData('application/retros-restore-icon');
            if (restoreIconData) {
                this.handleRestoreIconDrop(e, restoreIconData);
                return;
            }

            // Check if dropped on recycle bin
            const recycleBinTarget = this.getRecycleBinAtPoint(e.clientX, e.clientY);
            if (recycleBinTarget) {
                // Don't allow dropping recycle bin on itself
                if (this.draggedIcon && this.draggedIcon.data.id === 'recyclebin') {
                    return;
                }
                this.handleRecycleBinDrop(e);
                return;
            }

            // Check if this is a desktop icon being repositioned
            const desktopIconData = e.dataTransfer.getData('application/retros-desktop-icon');
            if (desktopIconData) {
                this.handleDesktopIconDrop(e, desktopIconData);
                return;
            }

            // Handle native file drops from user's OS
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const retrosData = e.dataTransfer.getData('application/retros-file');
                if (!retrosData) {
                    this.handleNativeFileDrop(e);
                    return;
                }
            }

            // Otherwise handle as file drop from MyComputer
            this.handleFileDrop(e);
        });
    }

    /**
     * Check if a point is over the recycle bin icon
     * @param {number} x - Client X coordinate
     * @param {number} y - Client Y coordinate
     * @returns {HTMLElement|null} The recycle bin element if point is over it, null otherwise
     */
    getRecycleBinAtPoint(x, y) {
        const recycleBin = this.desktop.querySelector('[data-icon-id="recyclebin"]');
        if (!recycleBin) return null;

        const rect = recycleBin.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return recycleBin;
        }
        return null;
    }

    /**
     * Handle desktop icon repositioning via drop
     * @param {DragEvent} e - Drag event
     * @param {string} desktopIconData - JSON string with icon data
     */
    handleDesktopIconDrop(e, desktopIconData) {
        try {
            const iconInfo = JSON.parse(desktopIconData);
            const desktopRect = this.desktop.getBoundingClientRect();

            // Calculate new position
            let x = e.clientX - desktopRect.left - this.dragOffset.x;
            let y = e.clientY - desktopRect.top - this.dragOffset.y;

            // Keep on screen
            x = Math.max(0, Math.min(x, desktopRect.width - 100));
            y = Math.max(0, Math.min(y, desktopRect.height - 100));

            // Get all occupied positions, excluding the icon being moved
            const allPositions = getAllOccupiedPositions(k => StateManager.getState(k))
                .filter(pos => {
                    // Exclude the icon being dragged from occupied set
                    const icons = StateManager.getState('icons') || [];
                    const movingIcon = icons.find(i => i.id === iconInfo.id);
                    if (movingIcon && pos.x === movingIcon.x && pos.y === movingIcon.y) return false;
                    // Also exclude file positions for the dragged file icon
                    const filePositions = StateManager.getState('filePositions') || {};
                    const fp = filePositions[iconInfo.id];
                    if (fp && pos.x === fp.x && pos.y === fp.y) return false;
                    return true;
                });

            // Snap to grid and find nearest free slot to avoid overlaps
            const slot = findNearestFreeSlot(x, y, allPositions);
            x = slot.x;
            y = slot.y;

            // Find and update the icon element
            const iconEl = this.desktop.querySelector(`[data-icon-id="${iconInfo.id}"]`);
            if (iconEl) {
                iconEl.style.left = `${x}px`;
                iconEl.style.top = `${y}px`;
            }

            // Save position based on icon type
            if (iconInfo.type === 'file') {
                this.saveFilePosition(iconInfo.id, x, y);
            } else {
                StateManager.updateIconPosition(iconInfo.id, x, y);
            }

            EventBus.emit(Events.ICON_MOVE, { id: iconInfo.id, x, y });
        } catch (err) {
            console.error('Failed to reposition desktop icon:', err);
        }
    }

    /**
     * Handle restoration of a file from recycle bin
     * @param {DragEvent} e - Drag event
     * @param {string} dataString - JSON string with restore data
     */
    handleRestoreFileDrop(e, dataString) {
        try {
            const data = JSON.parse(dataString);
            const { index, originalPath, content, fileType, extension, label } = data;

            // Restore the file to its original location
            if (fileType === 'directory') {
                FileSystemManager.createDirectory(originalPath);
            } else {
                FileSystemManager.writeFile(originalPath, content || '', extension || 'txt');
            }

            // Remove from recycle bin
            const recycledItems = StateManager.getState('recycledItems') || [];
            const newRecycledItems = recycledItems.filter((_, i) => i !== index);
            StateManager.setState('recycledItems', newRecycledItems, true);

            // Emit events
            EventBus.emit('filesystem:changed');
            EventBus.emit('recyclebin:update');
            EventBus.emit(Events.SOUND_PLAY, { type: 'restore' });
            this.showDropFeedback(`"${label}" restored`, 'success');

            debugLog(`[DesktopRenderer] Restored file to: ${originalPath.join('\\')}`);
        } catch (err) {
            console.error('Failed to restore file from recycle bin:', err);
            EventBus.emit(Events.SOUND_PLAY, { type: 'error' });
            this.showDropFeedback('Failed to restore file', 'error');
        }
    }

    /**
     * Handle restoration of an icon from recycle bin
     * @param {DragEvent} e - Drag event
     * @param {string} dataString - JSON string with restore data
     */
    handleRestoreIconDrop(e, dataString) {
        try {
            const data = JSON.parse(dataString);
            const { index, item } = data;

            // Restore the icon to desktop
            StateManager.restoreIcon(index);

            // Emit events
            EventBus.emit('desktop:refresh');
            EventBus.emit('recyclebin:update');
            EventBus.emit(Events.SOUND_PLAY, { type: 'restore' });
            this.showDropFeedback(`"${item.label}" restored`, 'success');

            debugLog(`[DesktopRenderer] Restored icon: ${item.label}`);
        } catch (err) {
            console.error('Failed to restore icon from recycle bin:', err);
            EventBus.emit(Events.SOUND_PLAY, { type: 'error' });
            this.showDropFeedback('Failed to restore item', 'error');
        }
    }

    /**
     * Handle drop on Recycle Bin - delete/recycle the dropped item
     * @param {DragEvent} e - Drag event
     */
    handleRecycleBinDrop(e) {
        // Check if it's a desktop icon (app/link/file)
        const desktopIconData = e.dataTransfer.getData('application/retros-desktop-icon');
        if (desktopIconData) {
            try {
                const iconInfo = JSON.parse(desktopIconData);

                // Don't allow recycling the recycle bin
                if (iconInfo.id === 'recyclebin') return;

                // For file icons, use the file recycling system
                if (iconInfo.type === 'file') {
                    // Find the icon element to get full data
                    const iconEl = this.desktop.querySelector(`[data-icon-id="${iconInfo.id}"]`);
                    if (iconEl && iconEl._iconData) {
                        this.recycleFileToTrash(iconEl._iconData);
                    }
                } else {
                    // For app/link icons, use StateManager recycling
                    StateManager.recycleIcon(iconInfo.id);
                    EventBus.emit(Events.SOUND_PLAY, { type: 'recycle' });
                    this.showDropFeedback('Moved to Recycle Bin', 'success');
                }

                EventBus.emit('desktop:render');
            } catch (err) {
                console.error('Failed to recycle item:', err);
            }
            return;
        }

        // Handle files dragged from MyComputer
        const fileData = e.dataTransfer.getData('application/retros-file');
        if (fileData) {
            try {
                const file = JSON.parse(fileData);
                if (file.filePath && Array.isArray(file.filePath)) {
                    this.recycleFileToTrash({
                        id: `file_${file.fileName}`,
                        label: file.fileName,
                        filePath: file.filePath,
                        fileType: file.fileType,
                        extension: file.extension || ''
                    });
                    EventBus.emit('desktop:render');
                }
            } catch (err) {
                console.error('Failed to recycle file:', err);
            }
        }
    }

    /**
     * Move a file to the recycle bin
     * @param {Object} fileIcon - File icon data with filePath
     */
    recycleFileToTrash(fileIcon) {
        const { filePath, fileType, label } = fileIcon;

        try {
            // Read file content before deleting (for potential restore)
            let content = '';
            let extension = fileIcon.extension || '';

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
                label: label,
                emoji: this.getFileEmoji({ type: fileType, extension }),
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
                try {
                    FileSystemManager.deleteDirectory(filePath, true);
                } catch (e) {
                    console.error('Failed to delete directory:', e);
                }
            } else {
                try {
                    FileSystemManager.deleteFile(filePath);
                } catch (e) {
                    console.error('Failed to delete file:', e);
                }
            }

            // Remove from file positions if tracked
            const filePositions = StateManager.getState('filePositions') || {};
            const fileId = `file_${label}`;
            if (filePositions[fileId]) {
                delete filePositions[fileId];
                StateManager.setState('filePositions', filePositions, true);
            }

            EventBus.emit(Events.SOUND_PLAY, { type: 'recycle' });
            this.showDropFeedback(`"${label}" moved to Recycle Bin`, 'success');

        } catch (err) {
            console.error('Failed to recycle file:', err);
            EventBus.emit(Events.SOUND_PLAY, { type: 'error' });
            this.showDropFeedback(`Failed to delete "${label}"`, 'error');
        }
    }

    /**
     * Handle file drop from other components
     * @param {DragEvent} e - Drag event
     */
    handleFileDrop(e) {
        const data = e.dataTransfer.getData('application/retros-file');
        if (!data) return;

        try {
            const fileData = JSON.parse(data);
            const { filePath, fileName, fileType } = fileData;

            if (!filePath || !Array.isArray(filePath)) {
                console.error('Invalid file path in drop data');
                return;
            }

            // Desktop folder path
            const desktopPath = [...PATHS.DESKTOP];

            // Check if already on desktop
            const sourceDir = filePath.slice(0, -1);
            if (JSON.stringify(sourceDir) === JSON.stringify(desktopPath)) {
                this.showDropFeedback('File is already on desktop', 'info');
                return;
            }

            // Move the file to desktop
            try {
                FileSystemManager.moveItem(filePath, desktopPath);
                EventBus.emit(Events.SOUND_PLAY, { type: 'notify' });
                this.showDropFeedback(`Moved "${fileName}" to Desktop`, 'success');
            } catch (err) {
                console.error('Failed to move file:', err.message);
                EventBus.emit(Events.SOUND_PLAY, { type: 'error' });
                this.showDropFeedback(`Failed to move file: ${err.message}`, 'error');
            }
        } catch (err) {
            console.error('Failed to parse drop data:', err);
        }
    }

    /**
     * Handle native files dropped from the user's OS onto the desktop
     */
    handleNativeFileDrop(e) {
        const files = Array.from(e.dataTransfer.files);
        const desktopPath = [...PATHS.DESKTOP];

        let successCount = 0;

        for (const file of files) {
            try {
                const fileName = file.name;
                const ext = (fileName.split('.').pop() || '').toLowerCase();
                const filePath = [...desktopPath, fileName];

                const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif'];
                const textExts = ['txt', 'md', 'log', 'ini', 'cfg', 'json', 'xml', 'html', 'css', 'js', 'csv', 'retro'];
                const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'mid', 'midi', 'webm'];
                const videoExts = ['mp4', 'webm', 'ogv', 'avi', 'mkv', 'mov'];

                const reader = new FileReader();

                if (textExts.includes(ext)) {
                    reader.onload = (evt) => {
                        try {
                            FileSystemManager.writeFile(filePath, evt.target.result, ext);
                            this.renderFileIcons();
                        } catch (err) { console.error('Failed to save file:', err); }
                    };
                    reader.readAsText(file);
                } else if (imageExts.includes(ext)) {
                    reader.onload = (evt) => {
                        try {
                            FileSystemManager.writeFile(filePath, evt.target.result, ext);
                            this.renderFileIcons();
                        } catch (err) { console.error('Failed to save file:', err); }
                    };
                    reader.readAsDataURL(file);
                } else if (audioExts.includes(ext) || videoExts.includes(ext)) {
                    const blobUrl = URL.createObjectURL(file);
                    const mediaName = fileName.replace(/\.[^/.]+$/, '');
                    FileSystemManager.writeFile(filePath, '', ext, {
                        src: blobUrl,
                        mediaName: mediaName,
                        mimeType: file.type || `${audioExts.includes(ext) ? 'audio' : 'video'}/${ext}`,
                        size: file.size,
                        isBlob: true
                    });
                    this.renderFileIcons();
                } else {
                    reader.onload = (evt) => {
                        try {
                            FileSystemManager.writeFile(filePath, evt.target.result, ext);
                            this.renderFileIcons();
                        } catch (err) { console.error('Failed to save file:', err); }
                    };
                    reader.readAsDataURL(file);
                }

                successCount++;
            } catch (err) {
                console.error('Failed to import file:', err);
            }
        }

        if (successCount > 0) {
            EventBus.emit(Events.SOUND_PLAY, { type: 'notify' });
            this.showDropFeedback(`${successCount} file(s) imported to Desktop`, 'success');
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
     * Save file icon position
     * @param {string} fileId - File icon ID
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    saveFilePosition(fileId, x, y) {
        const filePositions = StateManager.getState('filePositions') || {};
        filePositions[fileId] = { x, y };
        StateManager.setState('filePositions', filePositions, true);
    }

    // ===== SELECTION BOX =====

    /**
     * Start selection box
     * @param {MouseEvent} e - Mouse event
     */
    startSelection(e) {
        this.deselectAll();

        this.selectionStart = { x: e.clientX, y: e.clientY };

        if (!this.selectionBox) {
            this.selectionBox = document.createElement('div');
            this.selectionBox.className = 'selection-box';
            document.body.appendChild(this.selectionBox);
        }

        this.selectionBox.style.left = `${e.clientX}px`;
        this.selectionBox.style.top = `${e.clientY}px`;
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';
        this.selectionBox.classList.add('active');

        document.addEventListener('mousemove', this.boundUpdateSelection);
        document.addEventListener('mouseup', this.boundEndSelection);
    }

    /**
     * Update selection box
     * @param {MouseEvent} e - Mouse event
     */
    updateSelection(e) {
        if (!this.selectionStart || !this.selectionBox) return;

        const width = Math.abs(e.clientX - this.selectionStart.x);
        const height = Math.abs(e.clientY - this.selectionStart.y);
        const left = Math.min(e.clientX, this.selectionStart.x);
        const top = Math.min(e.clientY, this.selectionStart.y);

        this.selectionBox.style.left = `${left}px`;
        this.selectionBox.style.top = `${top}px`;
        this.selectionBox.style.width = `${width}px`;
        this.selectionBox.style.height = `${height}px`;
    }

    /**
     * End selection box
     */
    endSelection() {
        if (this.selectionBox && this.selectionStart) {
            const boxRect = this.selectionBox.getBoundingClientRect();

            // Select icons within bounds
            this.desktop.querySelectorAll('.icon').forEach(icon => {
                const iconRect = icon.getBoundingClientRect();
                const overlaps = !(
                    iconRect.right < boxRect.left ||
                    iconRect.left > boxRect.right ||
                    iconRect.bottom < boxRect.top ||
                    iconRect.top > boxRect.bottom
                );

                if (overlaps) {
                    icon.classList.add('selected');
                }
            });
        }

        if (this.selectionBox) {
            this.selectionBox.classList.remove('active');
        }

        this.selectionStart = null;
        document.removeEventListener('mousemove', this.boundUpdateSelection);
        document.removeEventListener('mouseup', this.boundEndSelection);
    }

    /**
     * Deselect all icons
     */
    deselectAll() {
        this.desktop.querySelectorAll('.icon.selected').forEach(icon => {
            icon.classList.remove('selected');
        });
    }

    /**
     * Update cut visual state for all icons
     * Applies .cut class to icons that are in the cut list
     */
    updateCutVisualState() {
        if (!this.desktop) return;

        // Remove cut class from all icons first
        this.desktop.querySelectorAll('.icon.cut').forEach(icon => {
            icon.classList.remove('cut');
        });

        // Apply cut class to icons that match cut paths
        if (this.cutItemPaths.length > 0) {
            this.desktop.querySelectorAll('.icon').forEach(iconEl => {
                const iconData = iconEl._iconData;
                if (iconData?.filePath) {
                    const pathStr = JSON.stringify(iconData.filePath);
                    if (this.cutItemPaths.includes(pathStr)) {
                        iconEl.classList.add('cut');
                    }
                }
            });
        }
    }

    /**
     * Show icon context menu
     * @param {MouseEvent} e - Mouse event
     * @param {Object} icon - Icon data
     */
    showIconContextMenu(e, icon) {
        e.preventDefault();
        e.stopPropagation();

        // Debug logging
        debugLog('[DesktopRenderer] showIconContextMenu called');
        debugLog('[DesktopRenderer] icon:', icon);
        debugLog('[DesktopRenderer] icon.type:', icon?.type, 'icon.filePath:', icon?.filePath);

        EventBus.emit(Events.CONTEXT_MENU_SHOW, {
            x: e.clientX,
            y: e.clientY,
            type: 'icon',
            icon
        });
    }

    /**
     * Arrange icons in grid
     */
    arrangeIcons() {
        const icons = StateManager.getState('icons') || [];
        const occupiedPositions = [];

        // Arrange all StateManager icons (built-in + script/user-created)
        icons.forEach(icon => {
            const slot = getNextDesktopSlot(occupiedPositions);
            icon.x = slot.x;
            icon.y = slot.y;
            occupiedPositions.push(slot);
        });

        StateManager.setState('icons', icons, true);

        // Also arrange file icons from the Desktop folder
        try {
            const desktopPath = [...PATHS.DESKTOP];
            const files = FileSystemManager.listDirectory(desktopPath);
            const realFiles = files.filter(file => file.extension !== 'lnk');

            if (realFiles.length > 0) {
                const filePositions = StateManager.getState('filePositions') || {};

                realFiles.forEach(file => {
                    const fileId = `file_${file.name}`;
                    const slot = getNextDesktopSlot(occupiedPositions);
                    filePositions[fileId] = { x: slot.x, y: slot.y };
                    occupiedPositions.push(slot);
                });

                StateManager.setState('filePositions', filePositions, true);
            }
        } catch (e) {
            // Desktop folder may be empty or not exist yet
            debugLog('[DesktopRenderer] No file icons to arrange:', e.message);
        }

        this.render();
    }

    /**
     * Refresh desktop with shake animation
     */
    refresh() {
        if (this.desktop) {
            this.desktop.classList.add('shake');
            setTimeout(() => this.desktop.classList.remove('shake'), 500);
        }
        this.render();
    }

    /**
     * Cleanup all subscriptions and event listeners
     */
    destroy() {
        if (this._unsubs) {
            this._unsubs.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
            this._unsubs = [];
        }

        if (this._renderTimer) {
            cancelAnimationFrame(this._renderTimer);
            this._renderTimer = null;
        }

        if (this.desktop) {
            document.removeEventListener('mousemove', this.boundUpdateSelection);
            document.removeEventListener('mouseup', this.boundEndSelection);
        }

        this.desktop = null;
        debugLog('[DesktopRenderer] Destroyed');
    }
}

// Singleton
const DesktopRenderer = new DesktopRendererClass();

export default DesktopRenderer;
