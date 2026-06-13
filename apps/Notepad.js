/**
 * Notepad App
 * Simple text editor with save/load functionality
 */

import AppBase from './AppBase.js';
import StorageManager from '../core/StorageManager.js';
import FileSystemManager from '../core/FileSystemManager.js';
import SystemDialogs from '../features/SystemDialogs.js';
import { PATHS } from '../core/Constants.js';
import { escapeHtml } from '../core/Sanitize.js';
import MultiplayerClient from '../core/MultiplayerClient.js';

class Notepad extends AppBase {
    constructor() {
        super({
            id: 'notepad',
            name: 'Notepad',
            icon: '📝',
            width: 660,
            height: 520,
            minWidth: 440,
            minHeight: 360,
            resizable: true,
            category: 'accessories'
        });

        this.storageKey = 'notepadContent';
        // Multiplayer collaborative editing state lives in per-window
        // instance state ('mpSession' / 'mpUnsubscribers') — plain fields
        // here are shared across every Notepad window, so closing one
        // window killed another's live share session.
    }

    onOpen(params = {}) {
        // Check if we're opening a specific file
        const filePath = params.filePath;
        let content = '';
        let fileName = 'Untitled';

        if (filePath) {
            try {
                content = FileSystemManager.readFile(filePath);
                fileName = filePath[filePath.length - 1];
                this.setInstanceState('currentFile', filePath);
                this.setInstanceState('fileName', fileName);
            } catch (e) {
                console.error('Error loading file:', e);
                content = '';
            }
        } else {
            // Load from StorageManager (legacy support)
            content = StorageManager.get(this.storageKey) || '';
            this.setInstanceState('currentFile', null);
            this.setInstanceState('fileName', 'Untitled');
        }

        // Update window title
        this.updateTitle(fileName);

        return `
            <style>
                #window-notepad .window-content {
                    padding: 0 !important;
                    overflow: hidden !important;
                    display: flex;
                    flex-direction: column;
                }
                .notepad-app {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #c0c0c0;
                }
                .notepad-toolbar {
                    padding: 4px;
                    border-bottom: 1px solid #808080;
                    flex-shrink: 0;
                }
                .notepad-filepath {
                    padding: 4px 8px;
                    background: #f0f0f0;
                    font-size: 12px;
                    border-bottom: 1px solid #808080;
                    flex-shrink: 0;
                }
                .notepad-content {
                    flex: 1;
                    width: 100%;
                    border: none;
                    padding: 8px;
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    resize: none;
                    box-sizing: border-box;
                    outline: none;
                }
            </style>
            <div class="notepad-app">
                <div class="notepad-toolbar">
                    <button class="btn" id="btnNew">📄 New</button>
                    <button class="btn" id="btnOpen">📂 Open</button>
                    <button class="btn" id="btnSave">💾 Save</button>
                    <button class="btn" id="btnSaveAs">💾 Save As</button>
                    <button class="btn" id="btnDownload">📥 Download</button>
                    <button class="btn" id="btnShare" style="display:none;">🔗 Share</button>
                </div>
                <div id="mpCollabIndicator" style="display:none; padding:2px 8px; background:#ffffcc; font-size:11px; border-bottom:1px solid #808080;">
                    <span id="mpCollabStatus">Sharing...</span>
                    <span id="mpCollabUsers" style="margin-left:8px; color:#666;"></span>
                </div>
                <div class="notepad-filepath">
                    File: <span id="filePathDisplay">${escapeHtml(this.getInstanceState('currentFile') ? this.getInstanceState('currentFile').join('/') : 'Unsaved')}</span>
                </div>
                <textarea class="notepad-content" id="notepadText"
                    placeholder="Start typing... (Ctrl+S to save)">${escapeHtml(content)}</textarea>
            </div>
        `;
    }

    updateTitle(fileName) {
        const window = this.getWindow();
        if (window) {
            const titleBar = window.querySelector('.window-title');
            if (titleBar) {
                titleBar.textContent = `${fileName} - Notepad`;
            }
        }
    }

    onMount() {
        // Button handlers
        const btnNew = this.getElement('#btnNew');
        const btnOpen = this.getElement('#btnOpen');
        const btnSave = this.getElement('#btnSave');
        const btnSaveAs = this.getElement('#btnSaveAs');
        const btnDownload = this.getElement('#btnDownload');
        if (btnNew) this.addHandler(btnNew, 'click', () => this.newDocument());
        if (btnOpen) this.addHandler(btnOpen, 'click', () => this.openFile());
        if (btnSave) this.addHandler(btnSave, 'click', () => this.save());
        if (btnSaveAs) this.addHandler(btnSaveAs, 'click', () => this.saveAs());
        if (btnDownload) this.addHandler(btnDownload, 'click', () => this.download());

        // Keyboard shortcut
        this.addHandler(document, 'keydown', this.handleKeypress);

        // Multiplayer Share button
        const btnShare = this.getElement('#btnShare');
        if (btnShare) this.addHandler(btnShare, 'click', () => this._mpToggleShare());
        this._mpUpdateShareButton();

        // Focus textarea
        setTimeout(() => {
            this.getElement('#notepadText')?.focus();
        }, 100);

        // ===== SCRIPTING SUPPORT =====
        // Register command handlers for scripting automation
        this._registerScriptingCommands();
    }

    /**
     * Register commands and queries for scripting support
     * Enables scripts to control Notepad via semantic events
     */
    _registerScriptingCommands() {
        // Command: Set text content
        this.registerCommand('setText', (payload) => {
            const textarea = this.getElement('#notepadText');
            if (textarea) {
                textarea.value = payload.text || '';
                this.emitAppEvent('textChanged', { text: textarea.value });
                return { success: true, length: textarea.value.length };
            }
            return { success: false, error: 'Textarea not found' };
        });

        // Command: Append text
        this.registerCommand('appendText', (payload) => {
            const textarea = this.getElement('#notepadText');
            if (textarea) {
                textarea.value += payload.text || '';
                this.emitAppEvent('textChanged', { text: textarea.value });
                return { success: true, length: textarea.value.length };
            }
            return { success: false, error: 'Textarea not found' };
        });

        // Command: Clear text
        this.registerCommand('clear', () => {
            const textarea = this.getElement('#notepadText');
            if (textarea) {
                textarea.value = '';
                this.emitAppEvent('textCleared', {});
                return { success: true };
            }
            return { success: false, error: 'Textarea not found' };
        });

        // Command: Save file
        this.registerCommand('save', async (payload) => {
            if (payload.path) {
                // Save to specific path
                const textarea = this.getElement('#notepadText');
                if (textarea) {
                    try {
                        FileSystemManager.writeFile(payload.path, textarea.value);
                        this.setInstanceState('currentFile', payload.path);
                        this.setInstanceState('fileName', payload.path.split('/').pop());
                        this.updateTitle(this.getInstanceState('fileName'));
                        this.updateFilePathDisplay();
                        this.emitAppEvent('saved', { path: payload.path });
                        return { success: true, path: payload.path };
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                }
            } else {
                await this.save();
                return { success: true };
            }
        });

        // Command: Open file
        this.registerCommand('open', async (payload) => {
            if (payload.path) {
                try {
                    const content = FileSystemManager.readFile(payload.path);
                    const textarea = this.getElement('#notepadText');
                    if (textarea) {
                        textarea.value = content;
                        const pathArray = Array.isArray(payload.path) ? payload.path : payload.path.split('/');
                        const fileName = pathArray[pathArray.length - 1];
                        this.setInstanceState('currentFile', pathArray);
                        this.setInstanceState('fileName', fileName);
                        this.updateTitle(fileName);
                        this.updateFilePathDisplay();
                        this.emitAppEvent('fileOpened', { path: payload.path, content });
                        return { success: true, path: payload.path, length: content.length };
                    }
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
            return { success: false, error: 'No path specified' };
        });

        // Command: New document
        this.registerCommand('new', async () => {
            await this.newDocument();
            this.emitAppEvent('newDocument', {});
            return { success: true };
        });

        // Query: Get text content
        this.registerQuery('getText', () => {
            const textarea = this.getElement('#notepadText');
            return textarea ? textarea.value : '';
        });

        // Query: Get current file path
        this.registerQuery('getFilePath', () => {
            return this.getInstanceState('currentFile') || null;
        });

        // Query: Get file name
        this.registerQuery('getFileName', () => {
            return this.getInstanceState('fileName') || 'Untitled';
        });

        // Query: Get text length
        this.registerQuery('getLength', () => {
            const textarea = this.getElement('#notepadText');
            return textarea ? textarea.value.length : 0;
        });

        // Query: Get line count
        this.registerQuery('getLineCount', () => {
            const textarea = this.getElement('#notepadText');
            return textarea ? textarea.value.split('\n').length : 0;
        });
    }

    handleKeypress(e) {
        // Per-window check: the app-level isFocused() is true when ANY
        // Notepad window is focused, so with two windows open every
        // window's handler passed the gate and Ctrl+S saved them all.
        if (!this.isFocused(this.getCurrentWindowId())) return;

        // Ctrl+S to save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.save();
        }
    }

    async openFile() {
        // Show file open dialog - use '*' to show all text-based files
        const result = await SystemDialogs.showFileOpen({
            title: 'Open',
            filter: '*',
            initialPath: [...PATHS.DOCUMENTS]
        });

        if (!result) return;

        try {
            const content = FileSystemManager.readFile(result.fullPath);
            const fileName = result.filename;

            const textarea = this.getElement('#notepadText');
            if (textarea) {
                textarea.value = content;
            }

            this.setInstanceState('currentFile', result.fullPath);
            this.setInstanceState('fileName', fileName);
            this.updateTitle(fileName);
            this.updateFilePathDisplay();
            this.playSound('click');
            this.alert('📂 File opened!');
        } catch (e) {
            await SystemDialogs.alert(`Error opening file: ${e.message}`, 'Error', 'error');
        }
    }

    async save() {
        const textarea = this.getElement('#notepadText');
        if (!textarea) return;

        const currentFile = this.getInstanceState('currentFile');

        if (currentFile) {
            // Save to existing file
            try {
                FileSystemManager.writeFile(currentFile, textarea.value);
                this.playSound('floppy');
                this.alert('💾 File saved!');
                // Emit saved event for script handlers
                const pathString = Array.isArray(currentFile) ? currentFile.join('/') : currentFile;
                this.emitAppEvent('saved', { path: pathString });
            } catch (e) {
                this.playSound('error');
                await SystemDialogs.alert(`Error saving file: ${e.message}`, 'Error', 'error');
            }
        } else {
            // No file selected, prompt for Save As
            this.saveAs();
        }

        // Also save to StorageManager for legacy support
        StorageManager.set(this.storageKey, textarea.value);
    }

    async saveAs() {
        const textarea = this.getElement('#notepadText');
        if (!textarea) return;

        // Generate a default filename - use current file extension or .txt
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const currentFile = this.getInstanceState('currentFile');
        const currentFileName = this.getInstanceState('fileName') || '';

        // Preserve the current file extension if editing an existing file
        let defaultExt = '.txt';
        if (currentFileName && currentFileName.includes('.')) {
            defaultExt = currentFileName.substring(currentFileName.lastIndexOf('.'));
        }
        const defaultName = `note_${timestamp}${defaultExt}`;

        const result = await SystemDialogs.showFileSave({
            title: 'Save As',
            filter: '*',
            initialPath: [...PATHS.DESKTOP],
            defaultFilename: defaultName
        });

        if (!result) return;

        try {
            let fileName = result.filename;

            // Only add .txt extension if no extension provided at all
            if (!fileName.includes('.')) {
                fileName += '.txt';
            }

            // Determine the file extension for writeFile
            const extension = fileName.substring(fileName.lastIndexOf('.') + 1);

            const fullPath = [...result.path, fileName];
            FileSystemManager.writeFile(fullPath, textarea.value, extension);

            this.setInstanceState('currentFile', fullPath);
            this.setInstanceState('fileName', fileName);
            this.updateTitle(fileName);
            this.updateFilePathDisplay();
            this.alert('💾 File saved to ' + fullPath.join('/'));
            // Emit saved event for script handlers
            this.emitAppEvent('saved', { path: fullPath.join('/') });
        } catch (e) {
            await SystemDialogs.alert(`Error saving file: ${e.message}`, 'Error', 'error');
        }
    }

    updateFilePathDisplay() {
        const display = this.getElement('#filePathDisplay');
        const currentFile = this.getInstanceState('currentFile');
        if (display) {
            display.textContent = currentFile ? currentFile.join('/') : 'Unsaved';
        }
    }

    async newDocument() {
        // Check if there's unsaved content
        const textarea = this.getElement('#notepadText');
        if (textarea && textarea.value.trim()) {
            const confirmed = await SystemDialogs.confirm(
                'Create new document? Unsaved changes will be lost.',
                'New Document'
            );
            if (!confirmed) return;
        }

        // Reset file state - this is now a NEW untitled document
        this.setInstanceState('currentFile', null);
        this.setInstanceState('fileName', 'Untitled');

        // Clear textarea
        if (textarea) {
            textarea.value = '';
        }

        // Update UI
        this.updateTitle('Untitled');
        this.updateFilePathDisplay();

        // Clear legacy storage
        StorageManager.remove(this.storageKey);
    }

    download() {
        const textarea = this.getElement('#notepadText');
        if (!textarea) return;

        const blob = new Blob([textarea.value], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'note.txt';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ===== MULTIPLAYER COLLABORATIVE EDITING =====
    // Session + unsubscribers are per-window instance state, and every
    // listener captures its window id + session at registration — the
    // MultiplayerClient callbacks fire under whatever window holds the
    // ambient context, which used to route a collaborator's edits into an
    // unrelated Notepad window.

    _mpUpdateShareButton() {
        const btn = this.getElement('#btnShare');
        if (!btn) return;
        btn.style.display = MultiplayerClient.isConnected() ? '' : 'none';
        btn.textContent = this.getInstanceState('mpSession') ? '🔗 Unshare' : '🔗 Share';
    }

    _mpToggleShare() {
        if (this.getInstanceState('mpSession')) {
            this._mpStopSharing();
        } else {
            this._mpStartSharing();
        }
    }

    /** Run fn with this window's context pinned (for WS-time callbacks). */
    _mpWithWindow(windowId, fn) {
        if (!this.openWindows.has(windowId)) return;
        const prev = this._currentWindowId;
        this._currentWindowId = windowId;
        try {
            fn();
        } finally {
            this._currentWindowId = prev;
        }
    }

    _mpStartSharing() {
        if (!MultiplayerClient.isConnected()) return;

        const windowId = this.getCurrentWindowId();
        const docId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const session = `app:notepad:${docId}`;
        this.setInstanceState('mpSession', session);
        MultiplayerClient.joinRoom(session);

        // Send current document content to new joiners
        const textarea = this.getElement('#notepadText');
        if (textarea) {
            MultiplayerClient.sendEvent(session, 'notepad:fullSync', {
                text: textarea.value
            });
        }

        // Listen for incoming text changes. Server relay shape:
        // { type:'event', event, channel, payload, senderName, ... } —
        // channel lives at the TOP level, payload is the inner data.
        const unsubChange = MultiplayerClient.on('event', (msg) => {
            if (!msg || msg.channel !== session) return;
            this._mpWithWindow(windowId, () => {
                const data = msg.payload || {};
                if (msg.event === 'notepad:textChange') {
                    this._mpApplyRemoteChange(data);
                }
                if (msg.event === 'notepad:fullSync') {
                    const ta = this.getElement('#notepadText');
                    if (ta && data.text !== undefined) {
                        ta.value = data.text;
                    }
                }
            });
        });
        this._mpAddUnsub(unsubChange);

        // Listen for presence in the room
        const unsubPresence = MultiplayerClient.on('presence', (msg) => {
            if (msg.payload && msg.payload.roomId === session) {
                this._mpWithWindow(windowId, () => this._mpUpdateCollabUsers(msg));
            }
        });
        this._mpAddUnsub(unsubPresence);

        // Broadcast local edits using input event on textarea
        if (textarea) {
            let debounceTimer = null;
            const inputHandler = () => {
                if (this.getInstanceState('mpSession') !== session || !MultiplayerClient.isConnected()) return;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    MultiplayerClient.sendEvent(session, 'notepad:textChange', {
                        text: textarea.value
                    });
                }, 150);
            };
            this.addHandler(textarea, 'input', inputHandler);
        }

        // Update UI
        this._mpUpdateShareButton();
        const indicator = this.getElement('#mpCollabIndicator');
        if (indicator) indicator.style.display = '';
        const status = this.getElement('#mpCollabStatus');
        if (status) status.textContent = `Sharing: ${session}`;
    }

    _mpAddUnsub(unsub) {
        const list = this.getInstanceState('mpUnsubscribers') || [];
        list.push(unsub);
        this.setInstanceState('mpUnsubscribers', list);
    }

    _mpStopSharing() {
        const session = this.getInstanceState('mpSession');
        if (session) {
            MultiplayerClient.leaveRoom(session);
        }
        this._mpCleanup();
        this._mpUpdateShareButton();
        const indicator = this.getElement('#mpCollabIndicator');
        if (indicator) indicator.style.display = 'none';
    }

    _mpApplyRemoteChange(changeData) {
        const textarea = this.getElement('#notepadText');
        if (!textarea || changeData.text === undefined) return;
        // Preserve cursor position as best we can
        const cursorPos = textarea.selectionStart;
        textarea.value = changeData.text;
        textarea.selectionStart = textarea.selectionEnd = Math.min(cursorPos, textarea.value.length);
    }

    _mpUpdateCollabUsers(msg) {
        const usersEl = this.getElement('#mpCollabUsers');
        if (!usersEl) return;
        const event = msg.event || msg.payload?.action;
        const name = msg.payload?.displayName || 'Someone';
        if (event === 'join') {
            usersEl.textContent = `${name} joined`;
        } else if (event === 'leave') {
            usersEl.textContent = `${name} left`;
        }
    }

    _mpCleanup() {
        const list = this.getInstanceState('mpUnsubscribers') || [];
        for (const unsub of list) {
            if (typeof unsub === 'function') unsub();
        }
        this.setInstanceState('mpUnsubscribers', []);
        this.setInstanceState('mpSession', null);
    }

    onClose() {
        this._mpStopSharing();
    }

}

export default Notepad;
