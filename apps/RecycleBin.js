/**
 * Recycle Bin - Deleted Items Manager
 * View and restore deleted desktop icons
 */

import AppBase from './AppBase.js';
import StateManager from '../core/StateManager.js';
import { escapeHtml } from '../core/Sanitize.js';
import EventBus from '../core/EventBus.js';
import FileSystemManager from '../core/FileSystemManager.js';

class RecycleBin extends AppBase {
    constructor() {
        super({
            id: 'recyclebin',
            name: 'Recycle Bin',
            icon: '🗑️',
            width: 650,
            height: 480,
            minWidth: 460,
            minHeight: 360,
            resizable: true,
            singleton: true,
            category: 'system'
        });

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('restoreItem', (payload) => {
            if (payload === undefined || payload === null || payload.index === undefined) return { success: false, error: 'No index provided' };
            const recycledItems = StateManager.getState('recycledItems') || [];
            if (payload.index < 0 || payload.index >= recycledItems.length) return { success: false, error: 'Invalid index' };
            this.restoreItem(payload.index);
            return { success: true };
        });

        this.registerCommand('deleteItem', (payload) => {
            if (payload === undefined || payload === null || payload.index === undefined) return { success: false, error: 'No index provided' };
            const recycledItems = StateManager.getState('recycledItems') || [];
            if (payload.index < 0 || payload.index >= recycledItems.length) return { success: false, error: 'Invalid index' };
            this.deleteItem(payload.index);
            return { success: true };
        });

        this.registerCommand('emptyBin', () => {
            this.emptyRecycleBin();
            return { success: true };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getItems', () => {
            const recycledItems = StateManager.getState('recycledItems') || [];
            return recycledItems.map(item => ({
                id: item.id,
                label: item.label,
                type: item.type,
                emoji: item.emoji
            }));
        });

        this.registerQuery('getCount', () => {
            const recycledItems = StateManager.getState('recycledItems') || [];
            return { count: recycledItems.length };
        });
    }

    onOpen() {
        const recycledItems = StateManager.getState('recycledItems') || [];

        return `
            <style>
                .recyclebin-app {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #c0c0c0;
                }
                .recyclebin-toolbar {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px;
                    background: #c0c0c0;
                    border-bottom: 2px groove #fff;
                }
                .recyclebin-btn {
                    padding: 4px 12px;
                    border: 2px outset #fff;
                    background: #c0c0c0;
                    cursor: pointer;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-weight: bold;
                }
                .recyclebin-btn:active:not(:disabled) {
                    border-style: inset;
                }
                .recyclebin-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .recyclebin-btn.danger {
                    background: #d00;
                    color: white;
                }
                .recyclebin-content {
                    flex: 1;
                    background: white;
                    overflow-y: auto;
                }
                .recyclebin-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: #666;
                }
                .recyclebin-empty-icon {
                    font-size: 96px;
                    margin-bottom: 20px;
                    opacity: 0.3;
                }
                .recyclebin-empty-text {
                    font-size: 14px;
                    font-weight: bold;
                }
                .recyclebin-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                    gap: 20px;
                    padding: 20px;
                }
                .recyclebin-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    padding: 10px;
                    cursor: pointer;
                    border: 2px solid transparent;
                    position: relative;
                }
                .recyclebin-item:hover {
                    background: #e0e0e0;
                }
                .recyclebin-item.selected {
                    background: #000080;
                    color: white;
                    border-color: #000080;
                }
                .recyclebin-item-icon {
                    font-size: 32px;
                    position: relative;
                }
                .recyclebin-item-icon::after {
                    content: '❌';
                    position: absolute;
                    bottom: -5px;
                    right: -5px;
                    font-size: 16px;
                    filter: drop-shadow(0 0 2px white);
                }
                .recyclebin-item-label {
                    font-size: 12px;
                    text-align: center;
                    word-break: break-word;
                }
                .recyclebin-item-info {
                    font-size: 12px;
                    text-align: center;
                    color: #666;
                }
                .recyclebin-item.selected .recyclebin-item-info {
                    color: #ccc;
                }
                .recyclebin-status {
                    padding: 4px 8px;
                    background: #c0c0c0;
                    border-top: 2px groove #fff;
                    font-size: 12px;
                    display: flex;
                    justify-content: space-between;
                }
                .recyclebin-list {
                    padding: 10px;
                }
                .recyclebin-list-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 6px 10px;
                    border-bottom: 1px solid #e0e0e0;
                    cursor: pointer;
                }
                .recyclebin-list-item:hover {
                    background: #e0e0e0;
                }
                .recyclebin-list-item.selected {
                    background: #000080;
                    color: white;
                }
                .recyclebin-list-icon {
                    font-size: 24px;
                    position: relative;
                }
                .recyclebin-list-icon::after {
                    content: '❌';
                    position: absolute;
                    bottom: -3px;
                    right: -3px;
                    font-size: 12px;
                    filter: drop-shadow(0 0 2px white);
                }
                .recyclebin-list-details {
                    flex: 1;
                }
                .recyclebin-list-label {
                    font-size: 12px;
                    font-weight: bold;
                }
                .recyclebin-list-info {
                    font-size: 12px;
                    color: #666;
                }
                .recyclebin-list-item.selected .recyclebin-list-info {
                    color: #ccc;
                }
                /* Drag and drop styles */
                .recyclebin-content.drop-target {
                    background: rgba(0, 0, 128, 0.1) !important;
                    outline: 2px dashed #000080;
                    outline-offset: -4px;
                }
                .recyclebin-item.dragging,
                .recyclebin-list-item.dragging {
                    opacity: 0.5;
                    transform: scale(0.95);
                }
                .recyclebin-item[draggable="true"],
                .recyclebin-list-item[draggable="true"] {
                    cursor: grab;
                }
                .recyclebin-item[draggable="true"]:active,
                .recyclebin-list-item[draggable="true"]:active {
                    cursor: grabbing;
                }
            </style>

            <div class="recyclebin-app">
                <div class="recyclebin-toolbar">
                    <button class="recyclebin-btn" id="restore-btn" disabled>
                        ↩️ Restore
                    </button>
                    <button class="recyclebin-btn danger" id="delete-btn" disabled>
                        🗑️ Delete
                    </button>
                    <div style="width: 2px; height: 20px; background: #808080; margin: 0 4px;"></div>
                    <button class="recyclebin-btn danger" id="empty-btn" ${recycledItems.length === 0 ? 'disabled' : ''}>
                        🔥 Empty Recycle Bin
                    </button>
                    <div style="flex: 1;"></div>
                    <button class="recyclebin-btn" id="view-btn">
                        📋 ${this.getInstanceState('viewMode', 'grid') === 'grid' ? 'List' : 'Grid'} View
                    </button>
                </div>

                <div class="recyclebin-content" id="content">
                    ${recycledItems.length === 0 ? this.renderEmptyView() : this.renderItemsView(recycledItems)}
                </div>

                <div class="recyclebin-status">
                    <span id="status-text">${recycledItems.length} item(s)</span>
                    <span id="status-selection"></span>
                </div>
            </div>
        `;
    }

    onMount() {
        // Initialize view mode
        if (this.getInstanceState('viewMode') === undefined) {
            this.setInstanceState('viewMode', 'grid');
        }

        // Setup toolbar handlers
        this.setupToolbarHandlers();

        // Setup item click handlers
        this.setupItemHandlers();

        // Setup drag and drop
        this.setupDragDrop();

        // Subscribe to recycle bin updates via event
        this.onEvent('recyclebin:update', () => {
            this.refreshView();
        });

        // Also subscribe directly to state changes for more reliable updates
        this._unsubscribeState = StateManager.subscribe('recycledItems', () => {
            this.refreshView();
        });
    }

    onClose() {
        // Clean up state subscription
        if (this._unsubscribeState) {
            this._unsubscribeState();
        }
    }

    renderEmptyView() {
        return `
            <div class="recyclebin-empty">
                <div class="recyclebin-empty-icon">🗑️</div>
                <div class="recyclebin-empty-text">Recycle Bin is empty</div>
                <div style="font-size: 12px; margin-top: 10px; color: #888;">
                    Deleted items will appear here
                </div>
            </div>
        `;
    }

    renderItemsView(items) {
        const viewMode = this.getInstanceState('viewMode', 'grid');

        if (viewMode === 'grid') {
            return this.renderGridView(items);
        } else {
            return this.renderListView(items);
        }
    }

    renderGridView(items) {
        return `
            <div class="recyclebin-grid">
                ${items.map((item, index) => `
                    <div class="recyclebin-item" data-index="${index}">
                        <div class="recyclebin-item-icon">${escapeHtml(item.emoji || '📄')}</div>
                        <div class="recyclebin-item-label">${escapeHtml(item.label || item.id)}</div>
                        <div class="recyclebin-item-info">${escapeHtml(this.getItemTypeLabel(item))}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getItemTypeLabel(item) {
        if (item.type === 'recycled_file') {
            return item.fileType === 'directory' ? 'Folder' : 'File';
        } else if (item.type === 'link') {
            return 'Shortcut';
        } else if (item.type === 'app') {
            return 'Application';
        }
        return item.type || 'Item';
    }

    renderListView(items) {
        return `
            <div class="recyclebin-list">
                ${items.map((item, index) => `
                    <div class="recyclebin-list-item" data-index="${index}">
                        <div class="recyclebin-list-icon">${escapeHtml(item.emoji || '📄')}</div>
                        <div class="recyclebin-list-details">
                            <div class="recyclebin-list-label">${escapeHtml(item.label || item.id)}</div>
                            <div class="recyclebin-list-info">
                                ${escapeHtml(this.getItemInfo(item))}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getItemInfo(item) {
        if (item.type === 'recycled_file' && item.originalPath) {
            const path = item.originalPath.join('\\');
            const date = item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : 'Unknown';
            return `Original: ${path} • Deleted: ${date}`;
        } else if (item.url) {
            return `Type: ${item.type || 'link'} • URL: ${item.url}`;
        } else {
            return `Type: ${item.type || 'app'} • ID: ${item.id}`;
        }
    }

    setupToolbarHandlers() {
        // Restore button
        const restoreBtn = this.getElement('#restore-btn');
        if (restoreBtn) {
            this.addHandler(restoreBtn, 'click', () => {
                this.restoreSelected();
            });
        }

        // Delete button
        const deleteBtn = this.getElement('#delete-btn');
        if (deleteBtn) {
            this.addHandler(deleteBtn, 'click', () => {
                this.deleteSelected();
            });
        }

        // Empty button
        const emptyBtn = this.getElement('#empty-btn');
        if (emptyBtn) {
            this.addHandler(emptyBtn, 'click', () => {
                this.emptyRecycleBin();
            });
        }

        // View toggle button
        const viewBtn = this.getElement('#view-btn');
        if (viewBtn) {
            this.addHandler(viewBtn, 'click', () => {
                const currentMode = this.getInstanceState('viewMode', 'grid');
                const newMode = currentMode === 'grid' ? 'list' : 'grid';
                this.setInstanceState('viewMode', newMode);
                this.refreshView();
            });
        }
    }

    setupItemHandlers() {
        const items = this.getElements('.recyclebin-item, .recyclebin-list-item');
        const recycledItems = StateManager.getState('recycledItems') || [];

        items.forEach(item => {
            const index = parseInt(item.dataset.index);
            const recycledItem = recycledItems[index];

            // Make item draggable for restoring by dragging out
            item.draggable = true;

            // Single click - select
            this.addHandler(item, 'click', (e) => {
                // Clear previous selection
                items.forEach(i => i.classList.remove('selected'));

                // Select this item
                e.currentTarget.classList.add('selected');

                // Update toolbar buttons
                this.updateToolbarButtons(true);

                // Update status
                this.updateStatus(recycledItem);
            });

            // Double click - restore
            this.addHandler(item, 'dblclick', (e) => {
                this.restoreItem(index);
            });

            // Drag start - for dragging items out to restore
            this.addHandler(item, 'dragstart', (e) => {
                item.classList.add('dragging');

                // Set data for restoration
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/retros-recyclebin-item', JSON.stringify({
                    index: index,
                    item: recycledItem
                }));

                // Also set as a desktop icon for the desktop to recognize
                if (recycledItem.type === 'recycled_file') {
                    e.dataTransfer.setData('application/retros-restore-file', JSON.stringify({
                        index: index,
                        originalPath: recycledItem.originalPath,
                        content: recycledItem.content,
                        fileType: recycledItem.fileType,
                        extension: recycledItem.extension,
                        label: recycledItem.label
                    }));
                } else {
                    e.dataTransfer.setData('application/retros-restore-icon', JSON.stringify({
                        index: index,
                        item: recycledItem
                    }));
                }
            });

            this.addHandler(item, 'dragend', (e) => {
                item.classList.remove('dragging');
            });
        });
    }

    setupDragDrop() {
        const content = this.getElement('#content');
        if (!content) return;

        // Accept drops to delete items
        this.addHandler(content, 'dragover', (e) => {
            // Check if it's an item we can accept (desktop icon or file)
            const hasDesktopIcon = e.dataTransfer.types.includes('application/retros-desktop-icon');
            const hasFile = e.dataTransfer.types.includes('application/retros-file');
            const hasRecycleItem = e.dataTransfer.types.includes('application/retros-recyclebin-item');

            // Don't accept items from the recycle bin itself (that's for dragging OUT)
            if (hasRecycleItem) return;

            if (hasDesktopIcon || hasFile) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                content.classList.add('drop-target');
            }
        });

        this.addHandler(content, 'dragleave', (e) => {
            // Only remove highlight when actually leaving the content area
            if (e.target === content || !content.contains(e.relatedTarget)) {
                content.classList.remove('drop-target');
            }
        });

        this.addHandler(content, 'drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            content.classList.remove('drop-target');

            // Handle desktop icon drop
            const desktopIconData = e.dataTransfer.getData('application/retros-desktop-icon');
            if (desktopIconData) {
                this.handleIconDrop(desktopIconData);
                return;
            }

            // Handle file drop
            const fileData = e.dataTransfer.getData('application/retros-file');
            if (fileData) {
                this.handleFileDrop(fileData);
            }
        });
    }

    handleIconDrop(dataString) {
        try {
            const iconInfo = JSON.parse(dataString);

            // Don't allow recycling the recycle bin
            if (iconInfo.id === 'recyclebin') return;

            if (iconInfo.type === 'file') {
                // Need to get full file data - emit event to have DesktopRenderer handle it
                EventBus.emit('recyclebin:recycle-file', { iconId: iconInfo.id });
            } else {
                // Recycle app/link icon
                StateManager.recycleIcon(iconInfo.id);
                this.playSound('recycle');
            }

            EventBus.emit('desktop:render');
            this.refreshView();
        } catch (err) {
            console.error('[RecycleBin] Failed to handle icon drop:', err);
        }
    }

    handleFileDrop(dataString) {
        try {
            const fileData = JSON.parse(dataString);

            if (!fileData.filePath || !Array.isArray(fileData.filePath)) {
                console.error('[RecycleBin] Invalid file data');
                return;
            }

            // Read file content before deleting
            let content = '';
            let extension = fileData.extension || '';

            if (fileData.fileType !== 'directory') {
                try {
                    content = FileSystemManager.readFile(fileData.filePath);
                    const info = FileSystemManager.getInfo(fileData.filePath);
                    extension = info.extension || extension;
                } catch (e) {
                    // File might not be readable
                }
            }

            // Add to recycled items
            const recycledItem = {
                id: `recycled_file_${Date.now()}`,
                label: fileData.fileName,
                emoji: this.getFileEmoji(fileData.fileType, extension),
                type: 'recycled_file',
                originalPath: fileData.filePath,
                fileType: fileData.fileType,
                extension: extension,
                content: content,
                deletedAt: Date.now()
            };

            const recycledItems = StateManager.getState('recycledItems') || [];
            recycledItems.push(recycledItem);
            StateManager.setState('recycledItems', recycledItems, true);

            // Delete from filesystem
            if (fileData.fileType === 'directory') {
                try {
                    FileSystemManager.deleteDirectory(fileData.filePath, true);
                } catch (e) {
                    console.error('Failed to delete directory:', e);
                }
            } else {
                try {
                    FileSystemManager.deleteFile(fileData.filePath);
                } catch (e) {
                    console.error('Failed to delete file:', e);
                }
            }

            this.playSound('recycle');
            EventBus.emit('filesystem:changed');
            this.refreshView();
        } catch (err) {
            console.error('[RecycleBin] Failed to handle file drop:', err);
        }
    }

    getFileEmoji(fileType, extension) {
        if (fileType === 'directory') return '📁';
        switch (extension) {
            case 'txt':
            case 'md':
                return '📝';
            case 'png':
            case 'jpg':
            case 'bmp':
                return '🖼️';
            case 'exe':
                return '⚙️';
            case 'log':
                return '📋';
            default:
                return '📄';
        }
    }

    updateToolbarButtons(hasSelection) {
        const restoreBtn = this.getElement('#restore-btn');
        const deleteBtn = this.getElement('#delete-btn');

        if (restoreBtn) restoreBtn.disabled = !hasSelection;
        if (deleteBtn) deleteBtn.disabled = !hasSelection;
    }

    updateStatus(selectedItem) {
        const statusSelection = this.getElement('#status-selection');
        if (!statusSelection) return;

        if (selectedItem) {
            statusSelection.textContent = `Selected: ${selectedItem.label || selectedItem.id}`;
        } else {
            statusSelection.textContent = '';
        }
    }

    getSelectedIndex() {
        const selected = this.getElement('.recyclebin-item.selected, .recyclebin-list-item.selected');
        return selected ? parseInt(selected.dataset.index) : -1;
    }

    restoreSelected() {
        const index = this.getSelectedIndex();
        if (index >= 0) {
            this.restoreItem(index);
        }
    }

    restoreItem(index) {
        const recycledItems = StateManager.getState('recycledItems');
        if (index < 0 || index >= recycledItems.length) return;

        const item = recycledItems[index];

        // Check if this is a recycled file (from filesystem)
        if (item.type === 'recycled_file' && item.originalPath) {
            this.restoreFileItem(item, index);
        } else {
            // Restore app/link icon to desktop
            StateManager.restoreIcon(index);
        }

        // Refresh desktop
        EventBus.emit('desktop:refresh');

        // Refresh this view
        this.refreshView();

        // Show notification
        this.playSound('restore');

        // Emit item restored event
        this.emitAppEvent('item:restored', { item: { id: item.id, label: item.label, type: item.type } });

        console.log(`[RecycleBin] Restored: ${item.label}`);
    }

    restoreFileItem(item, index) {
        const { originalPath, content, fileType, extension } = item;

        try {
            if (fileType === 'directory') {
                // Restore directory
                FileSystemManager.createDirectory(originalPath);
            } else {
                // Restore file with its original content
                FileSystemManager.writeFile(originalPath, content || '', extension || 'txt');
            }

            // Remove from recycle bin
            const recycledItems = StateManager.getState('recycledItems');
            const newRecycledItems = recycledItems.filter((_, i) => i !== index);
            StateManager.setState('recycledItems', newRecycledItems, true);

            // Emit filesystem change event
            EventBus.emit('filesystem:changed');

            console.log(`[RecycleBin] Restored file to: ${originalPath.join('\\')}`);
        } catch (err) {
            console.error('[RecycleBin] Failed to restore file:', err);
            this.alert(`Failed to restore "${item.label}": ${err.message}`);
        }
    }

    deleteSelected() {
        const index = this.getSelectedIndex();
        if (index >= 0) {
            this.deleteItem(index);
        }
    }

    async deleteItem(index) {
        const recycledItems = StateManager.getState('recycledItems');
        if (index < 0 || index >= recycledItems.length) return;

        const item = recycledItems[index];

        if (await this.confirm(`Permanently delete "${item.label}"?\n\nThis cannot be undone.`, 'Confirm Delete')) {
            // Remove from recycle bin
            const newRecycledItems = recycledItems.filter((_, i) => i !== index);
            StateManager.setState('recycledItems', newRecycledItems, true);

            // Refresh view
            this.refreshView();
            this.playSound('recycle');

            // Emit item deleted event
            this.emitAppEvent('item:deleted', { item: { id: item.id, label: item.label, type: item.type } });

            console.log(`[RecycleBin] Permanently deleted: ${item.label}`);
        }
    }

    async emptyRecycleBin() {
        const recycledItems = StateManager.getState('recycledItems');
        if (recycledItems.length === 0) return;

        if (await this.confirm(`Empty the Recycle Bin?\n\nThis will permanently delete all ${recycledItems.length} item(s).\n\nThis cannot be undone.`, 'Empty Recycle Bin')) {
            // Clear recycle bin
            StateManager.setState('recycledItems', [], true);

            // Refresh view
            this.refreshView();
            this.playSound('recycle');

            // Emit bin emptied event
            this.emitAppEvent('bin:emptied', {});

            console.log('[RecycleBin] Emptied recycle bin');
        }
    }

    refreshView() {
        const recycledItems = StateManager.getState('recycledItems') || [];
        const content = this.getElement('#content');
        const statusText = this.getElement('#status-text');
        const emptyBtn = this.getElement('#empty-btn');
        const viewBtn = this.getElement('#view-btn');

        if (content) {
            content.innerHTML = recycledItems.length === 0
                ? this.renderEmptyView()
                : this.renderItemsView(recycledItems);
        }

        if (statusText) {
            statusText.textContent = `${recycledItems.length} item(s)`;
        }

        if (emptyBtn) {
            emptyBtn.disabled = recycledItems.length === 0;
        }

        if (viewBtn) {
            const viewMode = this.getInstanceState('viewMode', 'grid');
            viewBtn.textContent = `📋 ${viewMode === 'grid' ? 'List' : 'Grid'} View`;
        }

        // Re-setup item handlers for new content
        this.setupItemHandlers();

        // Reset selection
        this.updateToolbarButtons(false);
        this.updateStatus(null);
    }
}

export default RecycleBin;
