/**
 * Inbox - 90s-style Email Client for IlluminatOS!
 * A fully featured, on-theme, scriptable mailbox application
 * designed for ARG content delivery and retro immersion.
 *
 * SCRIPTING SUPPORT:
 *   Commands: deliverMessage, sendMessage, markRead, markUnread,
 *             moveMessage, deleteMessage, restoreMessage,
 *             createFolder, renameFolder, deleteFolder,
 *             setFlag, clearFlag,
 *             setNotificationState, clearNewIndicator,
 *             scheduledDelivery, setAutoReply, clearAutoReply,
 *             bulkDeliver, reset
 *   Queries:  getFolders, getMessages, getMessageById,
 *             getUnreadCount, searchMessages, getStatus, getConfig
 *   Events:   app:inbox:messageReceived, app:inbox:messageSent,
 *             app:inbox:messageReadChanged, app:inbox:messageMoved,
 *             app:inbox:messageDeleted, app:inbox:messageRestored,
 *             app:inbox:folderChanged,
 *             app:inbox:unreadCountChanged,
 *             app:inbox:notificationStateChanged,
 *             app:inbox:scheduledDelivered, app:inbox:autoReplySet
 */

import AppBase from './AppBase.js';
import FileSystemManager from '../core/FileSystemManager.js';
import EventBus from '../core/EventBus.js';
import { escapeHtml } from '../core/Sanitize.js';

// ============================================
// Mail directory paths
// ============================================
const MAIL_ROOT = 'C:/Users/User/Mail';
const DEFAULT_FOLDERS = ['Inbox', 'Sent', 'Drafts', 'Archive', 'Trash'];

class Inbox extends AppBase {
    constructor() {
        super({
            id: 'inbox',
            name: 'Inbox',
            icon: '📧',
            width: 880,
            height: 620,
            minWidth: 600,
            minHeight: 440,
            resizable: true,
            singleton: true,
            category: 'internet'
        });

        // ---------- app state ----------
        this.messages = [];         // flat array of all messages
        this.folders = [...DEFAULT_FOLDERS];
        this.activeFolder = 'Inbox';
        this.activeMessageId = null;
        this.composing = false;
        this.sortField = 'timestamp';
        this.sortAsc = false;
        this.searchQuery = '';
        this.unreadCount = 0;
        this.hasNewMail = false;    // for notification icon

        // tray icon element reference
        this._trayIcon = null;
        this._trayUnsub = null;

        // ARG scripting state
        this._autoReply = null;
        this._scheduledDeliveries = {};
        this._scheduleCounter = 0;
    }

    // ===================================================================
    //  PHASE 1 — App foundation & shell integration
    // ===================================================================

    onOpen() {
        return `
            <div class="inbox-app">
                <!-- Toolbar -->
                <div class="inbox-toolbar" id="inboxToolbar">
                    <button class="inbox-toolbar-btn" data-action="compose" title="New Message (Ctrl+N)">
                        &#9993; New
                    </button>
                    <button class="inbox-toolbar-btn" data-action="reply" title="Reply (Ctrl+R)">
                        &#8617; Reply
                    </button>
                    <button class="inbox-toolbar-btn" data-action="forward" title="Forward">
                        &#10145; Fwd
                    </button>
                    <div class="inbox-toolbar-sep"></div>
                    <button class="inbox-toolbar-btn" data-action="markread" title="Mark Read">
                        &#9745; Read
                    </button>
                    <button class="inbox-toolbar-btn" data-action="archive" title="Archive">
                        &#128230; Archive
                    </button>
                    <button class="inbox-toolbar-btn" data-action="delete" title="Delete (Del)">
                        &#128465; Delete
                    </button>
                    <div class="inbox-toolbar-sep"></div>
                    <button class="inbox-toolbar-btn" data-action="refresh" title="Check Mail (Ctrl+R)">
                        &#128259; Check Mail
                    </button>
                    <div class="inbox-search">
                        <span>&#128269;</span>
                        <input type="text" id="inboxSearch" placeholder="Search mail..." title="Search messages">
                    </div>
                </div>

                <!-- Three pane body -->
                <div class="inbox-body">
                    <!-- Folder pane -->
                    <div class="inbox-folder-pane" id="inboxFolderPane">
                        <div class="inbox-folder-header">&#128233; Mailbox</div>
                        <div id="inboxFolderList"></div>
                    </div>

                    <!-- Message list pane -->
                    <div class="inbox-list-pane" id="inboxListPane">
                        <div class="inbox-list-header">
                            <span class="col-flag" data-sort="starred" title="Starred">&#9733;</span>
                            <span class="col-from" data-sort="from" title="Sort by sender">From</span>
                            <span class="col-subject" data-sort="subject" title="Sort by subject">Subject</span>
                            <span class="col-date" data-sort="timestamp" title="Sort by date">Date</span>
                        </div>
                        <div class="inbox-list-scroll" id="inboxListScroll"></div>
                    </div>

                    <!-- Viewer / Composer pane -->
                    <div class="inbox-viewer-pane" id="inboxViewerPane">
                        <div class="inbox-viewer-empty" id="inboxViewerEmpty">
                            <div class="inbox-viewer-empty-icon">&#128233;</div>
                            <div>Select a message to read</div>
                            <div style="font-size:12px;">&mdash; or &mdash;</div>
                            <div>Click <b>New</b> to compose</div>
                        </div>
                        <div id="inboxViewerContent" style="display:none;flex:1;flex-direction:column;"></div>
                        <div id="inboxComposeContent" style="display:none;flex:1;flex-direction:column;"></div>
                    </div>
                </div>

                <!-- Status bar -->
                <div class="inbox-statusbar">
                    <span id="inboxStatus">Ready</span>
                    <span id="inboxCount"></span>
                </div>
            </div>
        `;
    }

    onMount() {
        // Initialize mail folders in VFS
        this._ensureMailFolders();

        // Load messages from VFS
        this._loadMessages();

        // Render UI
        this._renderFolders();
        this._renderMessageList();
        this._updateStatusBar();

        // Bind toolbar buttons
        this.addHandler(this.getElement('#inboxToolbar'), 'click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            this._handleToolbarAction(btn.dataset.action);
        });

        // Bind folder clicks
        this.addHandler(this.getElement('#inboxFolderList'), 'click', (e) => {
            const item = e.target.closest('.inbox-folder-item');
            if (!item) return;
            this._selectFolder(item.dataset.folder);
        });

        // Bind message list clicks
        this.addHandler(this.getElement('#inboxListScroll'), 'click', (e) => {
            const row = e.target.closest('.inbox-msg-row');
            if (!row) return;
            this._selectMessage(row.dataset.id);
        });

        // Bind list header sorting
        this.addHandler(this.getElement('.inbox-list-header'), 'click', (e) => {
            const col = e.target.closest('[data-sort]');
            if (!col) return;
            const field = col.dataset.sort;
            if (this.sortField === field) {
                this.sortAsc = !this.sortAsc;
            } else {
                this.sortField = field;
                this.sortAsc = field === 'from' || field === 'subject';
            }
            this._renderMessageList();
        });

        // Bind search
        this.addHandler(this.getElement('#inboxSearch'), 'input', (e) => {
            this.searchQuery = e.target.value.trim().toLowerCase();
            this._renderMessageList();
        });

        // Keyboard shortcuts
        this.addHandler(this.getWindow(), 'keydown', (e) => {
            this._handleKeyboard(e);
        });

        // Register scripting contract
        this._registerScriptingCommands();
        this._registerScriptingQueries();

        // Install tray icon
        this._installTrayIcon();

        // Listen for FS changes to reload messages if external write
        this.onEvent('filesystem:changed', () => {
            this._loadMessages();
            this._renderFolders();
            this._renderMessageList();
            this._renderViewer();
        });
    }

    onClose() {
        // Cancel any scheduled deliveries
        for (const id of Object.keys(this._scheduledDeliveries)) {
            clearTimeout(this._scheduledDeliveries[id].timeoutId);
        }
        this._scheduledDeliveries = {};

        // Remove tray icon
        this._removeTrayIcon();
    }

    onRelaunch(params) {
        // Support opening with a specific message or folder
        if (params.folder) {
            this._selectFolder(params.folder);
        }
        if (params.messageId) {
            this._selectMessage(params.messageId);
        }
    }

    // ===================================================================
    //  PHASE 2 — Data model and FS-backed persistence
    // ===================================================================

    /**
     * Ensure mail directory structure exists in VFS.
     */
    _ensureMailFolders() {
        const fs = FileSystemManager;
        try {
            if (!fs.exists(MAIL_ROOT)) {
                fs.createDirectory(MAIL_ROOT);
            }
        } catch { /* exists */ }

        for (const folder of this.folders) {
            const folderPath = `${MAIL_ROOT}/${folder}`;
            try {
                if (!fs.exists(folderPath)) {
                    fs.createDirectory(folderPath);
                }
            } catch { /* exists */ }
        }
    }

    /**
     * Load all messages from the VFS mail directories.
     * Also discovers custom folders that exist in VFS but aren't tracked yet.
     */
    _loadMessages() {
        const fs = FileSystemManager;
        this.messages = [];
        const usedIds = new Set();

        // Discover custom folders from VFS
        try {
            if (fs.exists(MAIL_ROOT)) {
                const items = fs.listDirectory(MAIL_ROOT, false);
                for (const item of items) {
                    if (item.type === 'directory' && !this.folders.includes(item.name)) {
                        this.folders.push(item.name);
                    }
                }
            }
        } catch { /* noop */ }

        for (const folder of this.folders) {
            const folderPath = `${MAIL_ROOT}/${folder}`;
            try {
                if (!fs.exists(folderPath)) continue;
                const items = fs.listDirectory(folderPath, false);
                for (const item of items) {
                    if (item.type !== 'file' || !item.name.endsWith('.mail.json')) continue;
                    try {
                        const content = fs.readFile(`${folderPath}/${item.name}`);
                        const fileId = item.name.replace(/\.mail\.json$/, '');
                        const parsed = JSON.parse(content);
                        const msg = (parsed && typeof parsed === 'object') ? parsed : {};

                        // Backward compatibility: old message files may miss IDs or core fields.
                        if (typeof msg.id !== 'string' || !msg.id.trim()) {
                            msg.id = fileId;
                        }

                        // Ensure global uniqueness so UI selection always maps to one message.
                        if (usedIds.has(msg.id)) {
                            let suffix = 1;
                            const baseId = msg.id;
                            while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1;
                            msg.id = `${baseId}-${suffix}`;
                        }
                        usedIds.add(msg.id);

                        msg.folder = folder; // ensure folder matches FS location
                        if (typeof msg.subject !== 'string') msg.subject = '(No Subject)';
                        if (typeof msg.from !== 'string') msg.from = 'Unknown';
                        if (typeof msg.body !== 'string') msg.body = '';
                        if (!Array.isArray(msg.to)) msg.to = [msg.to || 'User'];

                        // Persist any migration fixes immediately.
                        if (msg.id !== fileId || msg.folder !== folder || typeof parsed?.id !== 'string') {
                            this._saveMessage(msg);
                        }

                        this.messages.push(msg);
                    } catch (e) {
                        console.warn(`[Inbox] Failed to parse ${item.name}:`, e.message);
                    }
                }
            } catch (e) {
                console.warn(`[Inbox] Failed to list ${folder}:`, e.message);
            }
        }

        this._recalcUnreadCount();
    }

    /**
     * Persist a single message to VFS.
     */
    _saveMessage(msg) {
        const fs = FileSystemManager;
        const folder = msg.folder || 'Inbox';
        const folderPath = `${MAIL_ROOT}/${folder}`;

        try {
            if (!fs.exists(folderPath)) {
                fs.createDirectory(folderPath);
            }
        } catch { /* exists */ }

        const fileName = `${msg.id}.mail.json`;
        fs.writeFile(`${folderPath}/${fileName}`, JSON.stringify(msg, null, 2), 'json');
    }

    /**
     * Delete a message file from VFS.
     */
    _deleteMessageFile(msg) {
        const fs = FileSystemManager;
        const filePath = `${MAIL_ROOT}/${msg.folder}/${msg.id}.mail.json`;
        try {
            if (fs.exists(filePath)) {
                fs.deleteFile(filePath);
            }
        } catch (e) {
            console.warn(`[Inbox] Failed to delete ${filePath}:`, e.message);
        }
    }

    /**
     * Move message file between VFS folders.
     */
    _moveMessageFile(msg, fromFolder, toFolder) {
        const fs = FileSystemManager;
        const fromPath = `${MAIL_ROOT}/${fromFolder}/${msg.id}.mail.json`;
        const toDir = `${MAIL_ROOT}/${toFolder}`;

        try {
            if (!fs.exists(toDir)) {
                fs.createDirectory(toDir);
            }
        } catch { /* exists */ }

        try {
            if (fs.exists(fromPath)) {
                fs.moveItem(fromPath, toDir);
            } else {
                // File doesn't exist in source; just save to destination
                this._saveMessage(msg);
            }
        } catch (e) {
            // fallback: delete old, write new
            try { fs.deleteFile(fromPath); } catch { /* noop */ }
            this._saveMessage(msg);
        }
    }

    /**
     * Generate a unique message ID.
     */
    _generateId() {
        return 'msg-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
    }

    /**
     * Canonical message factory.
     */
    _createMessage(overrides = {}) {
        const now = new Date().toISOString();
        return {
            id: overrides.id || this._generateId(),
            threadId: overrides.threadId || null,
            from: overrides.from || 'Unknown',
            to: Array.isArray(overrides.to) ? overrides.to : [overrides.to || 'User'],
            subject: overrides.subject || '(No Subject)',
            body: overrides.body || '',
            folder: overrides.folder || 'Inbox',
            timestamp: overrides.timestamp || now,
            read: overrides.read === true,
            starred: overrides.starred === true,
            tags: Array.isArray(overrides.tags) ? overrides.tags : [],
            attachments: Array.isArray(overrides.attachments) ? overrides.attachments : [],
            scriptMeta: overrides.scriptMeta || {},
            headers: overrides.headers || {},
            ...overrides
        };
    }

    _recalcUnreadCount() {
        const prev = this.unreadCount;
        this.unreadCount = this.messages.filter(m => !m.read && m.folder === 'Inbox').length;
        if (prev !== this.unreadCount) {
            this.emitAppEvent('unreadCountChanged', { unreadCount: this.unreadCount });
            this._updateTrayIcon();
        }
    }

    // ===================================================================
    //  PHASE 3 — Scriptability contract
    // ===================================================================

    _registerScriptingCommands() {
        // --- deliverMessage ---
        this.registerCommand('deliverMessage', (payload) => {
            // Guard: reject duplicate IDs
            if (payload.id && this._findMessage(payload.id)) {
                return { success: false, error: 'Duplicate message ID' };
            }

            const msg = this._createMessage({
                ...payload,
                folder: payload.folder || 'Inbox',
                read: false
            });
            this.messages.push(msg);
            this._saveMessage(msg);
            this._recalcUnreadCount();

            // Set new mail notification
            this.hasNewMail = true;
            this._updateTrayIcon();
            this.emitAppEvent('notificationStateChanged', { hasNewMail: true });

            this.playSound('notify');
            this.emitAppEvent('messageReceived', { message: this._sanitizeMessage(msg) });

            // Refresh UI if open
            this._renderFolders();
            this._renderMessageList();

            return { success: true, messageId: msg.id };
        });

        // --- sendMessage ---
        this.registerCommand('sendMessage', (payload) => {
            const msg = this._createMessage({
                ...payload,
                from: payload.from || 'User',
                folder: 'Sent',
                read: true,
                timestamp: new Date().toISOString()
            });
            this.messages.push(msg);
            this._saveMessage(msg);
            this.emitAppEvent('messageSent', { message: this._sanitizeMessage(msg) });
            this._renderFolders();
            this._renderMessageList();
            return { success: true, messageId: msg.id };
        });

        // --- markRead ---
        this.registerCommand('markRead', (payload) => {
            const msg = this._findMessage(payload.messageId || payload.id);
            if (!msg) return { success: false, error: 'Message not found' };
            if (msg.read) return { success: true };
            msg.read = true;
            this._saveMessage(msg);
            this._recalcUnreadCount();
            this.emitAppEvent('messageReadChanged', { messageId: msg.id, read: true });
            this._renderMessageList();
            return { success: true };
        });

        // --- markUnread ---
        this.registerCommand('markUnread', (payload) => {
            const msg = this._findMessage(payload.messageId || payload.id);
            if (!msg) return { success: false, error: 'Message not found' };
            if (!msg.read) return { success: true };
            msg.read = false;
            this._saveMessage(msg);
            this._recalcUnreadCount();
            this.emitAppEvent('messageReadChanged', { messageId: msg.id, read: false });
            this._renderMessageList();
            return { success: true };
        });

        // --- moveMessage ---
        this.registerCommand('moveMessage', (payload) => {
            const msg = this._findMessage(payload.messageId || payload.id);
            if (!msg) return { success: false, error: 'Message not found' };
            const toFolder = payload.folder || payload.to;
            if (!toFolder) return { success: false, error: 'Target folder required' };

            // Ensure folder exists
            if (!this.folders.includes(toFolder)) {
                this.folders.push(toFolder);
                this._ensureMailFolders();
                this.emitAppEvent('folderChanged', { folders: [...this.folders] });
            }

            const fromFolder = msg.folder;
            msg.folder = toFolder;
            this._moveMessageFile(msg, fromFolder, toFolder);
            this._recalcUnreadCount();
            this.emitAppEvent('messageMoved', { messageId: msg.id, from: fromFolder, to: toFolder });

            if (this.activeMessageId === msg.id && this.activeFolder !== toFolder) {
                this.activeMessageId = null;
            }
            this._renderFolders();
            this._renderMessageList();
            this._renderViewer();
            return { success: true };
        });

        // --- deleteMessage ---
        this.registerCommand('deleteMessage', (payload) => {
            const msg = this._findMessage(payload.messageId || payload.id);
            if (!msg) return { success: false, error: 'Message not found' };

            const permanent = payload.permanent === true;
            if (msg.folder === 'Trash' || permanent) {
                // Permanent delete
                this._deleteMessageFile(msg);
                this.messages = this.messages.filter(m => m.id !== msg.id);
                this.emitAppEvent('messageDeleted', { messageId: msg.id, permanent: true });
            } else {
                // Move to Trash
                const fromFolder = msg.folder;
                msg.folder = 'Trash';
                this._moveMessageFile(msg, fromFolder, 'Trash');
                this.emitAppEvent('messageDeleted', { messageId: msg.id, permanent: false });
            }

            if (this.activeMessageId === msg.id) {
                this.activeMessageId = null;
            }
            this._recalcUnreadCount();
            this._renderFolders();
            this._renderMessageList();
            this._renderViewer();
            return { success: true };
        });

        // --- restoreMessage ---
        this.registerCommand('restoreMessage', (payload) => {
            const msg = this._findMessage(payload.messageId || payload.id);
            if (!msg) return { success: false, error: 'Message not found' };
            if (msg.folder !== 'Trash') return { success: false, error: 'Message not in Trash' };
            const target = payload.folder || 'Inbox';
            msg.folder = target;
            this._moveMessageFile(msg, 'Trash', target);
            this._recalcUnreadCount();
            this.emitAppEvent('messageRestored', { messageId: msg.id, folder: target });
            this._renderFolders();
            this._renderMessageList();
            return { success: true };
        });

        // --- createFolder ---
        this.registerCommand('createFolder', (payload) => {
            const name = payload.name || payload.folder;
            if (!name) return { success: false, error: 'Folder name required' };
            if (this.folders.includes(name)) return { success: false, error: 'Folder already exists' };
            this.folders.push(name);
            this._ensureMailFolders();
            this.emitAppEvent('folderChanged', { folders: [...this.folders] });
            this._renderFolders();
            return { success: true };
        });

        // --- renameFolder ---
        this.registerCommand('renameFolder', (payload) => {
            const oldName = payload.oldName || payload.from;
            const newName = payload.newName || payload.to;
            if (!oldName || !newName) return { success: false, error: 'Both oldName and newName required' };
            if (DEFAULT_FOLDERS.includes(oldName)) return { success: false, error: 'Cannot rename default folder' };
            const idx = this.folders.indexOf(oldName);
            if (idx === -1) return { success: false, error: 'Folder not found' };
            this.folders[idx] = newName;

            // Rename in VFS
            try {
                FileSystemManager.renameItem(`${MAIL_ROOT}/${oldName}`, newName);
            } catch { /* noop */ }

            // Update messages
            this.messages.forEach(m => { if (m.folder === oldName) m.folder = newName; });

            if (this.activeFolder === oldName) this.activeFolder = newName;
            this.emitAppEvent('folderChanged', { folders: [...this.folders] });
            this._renderFolders();
            this._renderMessageList();
            return { success: true };
        });

        // --- deleteFolder ---
        this.registerCommand('deleteFolder', (payload) => {
            const name = payload.name || payload.folder;
            if (!name) return { success: false, error: 'Folder name required' };
            if (DEFAULT_FOLDERS.includes(name)) return { success: false, error: 'Cannot delete default folder' };
            const idx = this.folders.indexOf(name);
            if (idx === -1) return { success: false, error: 'Folder not found' };

            // Move messages to Trash
            this.messages.forEach(m => {
                if (m.folder === name) {
                    this._moveMessageFile(m, name, 'Trash');
                    m.folder = 'Trash';
                }
            });

            // Remove folder from VFS
            try {
                FileSystemManager.deleteDirectory(`${MAIL_ROOT}/${name}`, true);
            } catch { /* noop */ }

            this.folders.splice(idx, 1);
            if (this.activeFolder === name) this.activeFolder = 'Inbox';
            this._recalcUnreadCount();
            this.emitAppEvent('folderChanged', { folders: [...this.folders] });
            this._renderFolders();
            this._renderMessageList();
            return { success: true };
        });

        // --- setFlag ---
        this.registerCommand('setFlag', (payload) => {
            const msg = this._findMessage(payload.messageId || payload.id);
            if (!msg) return { success: false, error: 'Message not found' };
            const flag = payload.flag || 'starred';
            if (flag === 'starred') msg.starred = true;
            else if (flag === 'tag' && payload.tag) {
                if (!msg.tags.includes(payload.tag)) msg.tags.push(payload.tag);
            } else {
                if (!msg.scriptMeta) msg.scriptMeta = {};
                msg.scriptMeta[flag] = payload.value !== undefined ? payload.value : true;
            }
            this._saveMessage(msg);
            this._renderMessageList();
            this._renderViewer();
            return { success: true };
        });

        // --- clearFlag ---
        this.registerCommand('clearFlag', (payload) => {
            const msg = this._findMessage(payload.messageId || payload.id);
            if (!msg) return { success: false, error: 'Message not found' };
            const flag = payload.flag || 'starred';
            if (flag === 'starred') msg.starred = false;
            else if (flag === 'tag' && payload.tag) {
                msg.tags = msg.tags.filter(t => t !== payload.tag);
            } else {
                if (msg.scriptMeta) delete msg.scriptMeta[flag];
            }
            this._saveMessage(msg);
            this._renderMessageList();
            this._renderViewer();
            return { success: true };
        });

        // --- setNotificationState ---
        this.registerCommand('setNotificationState', (payload) => {
            this.hasNewMail = payload.hasNewMail !== false;
            this._updateTrayIcon();
            this.emitAppEvent('notificationStateChanged', { hasNewMail: this.hasNewMail });
            return { success: true };
        });

        // --- clearNewIndicator ---
        this.registerCommand('clearNewIndicator', () => {
            this.hasNewMail = false;
            this._updateTrayIcon();
            this.emitAppEvent('notificationStateChanged', { hasNewMail: false });
            return { success: true };
        });
    }

    _registerScriptingQueries() {
        // --- getFolders ---
        this.registerQuery('getFolders', () => {
            return {
                folders: this.folders.map(f => ({
                    name: f,
                    isDefault: DEFAULT_FOLDERS.includes(f),
                    messageCount: this.messages.filter(m => m.folder === f).length,
                    unreadCount: this.messages.filter(m => m.folder === f && !m.read).length
                }))
            };
        });

        // --- getMessages ---
        this.registerQuery('getMessages', (payload = {}) => {
            let msgs = [...this.messages];
            if (payload.folder) msgs = msgs.filter(m => m.folder === payload.folder);
            if (payload.read !== undefined) msgs = msgs.filter(m => m.read === payload.read);
            if (payload.starred) msgs = msgs.filter(m => m.starred);
            if (payload.tag) msgs = msgs.filter(m => m.tags && m.tags.includes(payload.tag));
            if (payload.from) msgs = msgs.filter(m => m.from.toLowerCase().includes(payload.from.toLowerCase()));
            if (payload.search) {
                const q = payload.search.toLowerCase();
                msgs = msgs.filter(m =>
                    m.subject.toLowerCase().includes(q) ||
                    m.body.toLowerCase().includes(q) ||
                    m.from.toLowerCase().includes(q)
                );
            }

            // Sort
            const field = payload.sortField || 'timestamp';
            const asc = payload.sortAsc === true;
            msgs.sort((a, b) => {
                let va = a[field] || '';
                let vb = b[field] || '';
                if (typeof va === 'string') va = va.toLowerCase();
                if (typeof vb === 'string') vb = vb.toLowerCase();
                if (va < vb) return asc ? -1 : 1;
                if (va > vb) return asc ? 1 : -1;
                return 0;
            });

            // Pagination
            const offset = payload.offset || 0;
            const limit = payload.limit || msgs.length;
            const total = msgs.length;
            msgs = msgs.slice(offset, offset + limit);

            return {
                messages: msgs.map(m => this._sanitizeMessage(m)),
                total,
                offset,
                limit
            };
        });

        // --- getMessageById ---
        this.registerQuery('getMessageById', (payload) => {
            const msg = this._findMessage(payload.messageId || payload.id);
            if (!msg) return { message: null, error: 'Not found' };
            return { message: this._sanitizeMessage(msg) };
        });

        // --- getUnreadCount ---
        this.registerQuery('getUnreadCount', (payload = {}) => {
            const folder = payload.folder || 'Inbox';
            if (folder === '*') {
                return { unreadCount: this.messages.filter(m => !m.read).length };
            }
            return {
                folder,
                unreadCount: this.messages.filter(m => m.folder === folder && !m.read).length
            };
        });

        // --- searchMessages ---
        this.registerQuery('searchMessages', (payload = {}) => {
            const q = (payload.query || '').toLowerCase();
            if (!q) return { messages: [], total: 0 };
            const results = this.messages.filter(m =>
                m.subject.toLowerCase().includes(q) ||
                m.body.toLowerCase().includes(q) ||
                m.from.toLowerCase().includes(q) ||
                (m.tags && m.tags.some(t => t.toLowerCase().includes(q)))
            );
            return {
                messages: results.map(m => this._sanitizeMessage(m)),
                total: results.length
            };
        });

        // --- getStatus ---
        this.registerQuery('getStatus', () => ({
            activeFolder: this.activeFolder,
            activeMessageId: this.activeMessageId,
            composing: this.composing,
            unreadCount: this.unreadCount,
            hasNewMail: this.hasNewMail,
            totalMessages: this.messages.length,
            folders: [...this.folders]
        }));

        // ===== ARG SCRIPTING COMMANDS =====

        // COMMAND: Schedule a message delivery after a delay
        this.registerCommand('scheduledDelivery', (payload) => {
            const delay = payload.delay || 5000;
            const msg = {
                from: payload.from || 'Unknown',
                subject: payload.subject || '(No Subject)',
                body: payload.body || payload.text || '',
                folder: payload.folder || 'Inbox',
                headers: payload.headers || null,
                attachments: payload.attachments || null,
                starred: payload.starred || false
            };

            const id = 'sched_' + (++this._scheduleCounter);
            const timeoutId = setTimeout(() => {
                delete this._scheduledDeliveries[id];
                // Use the existing deliverMessage command pattern
                EventBus.emit(`command:${this.id}:deliverMessage`, msg);
                this.emitAppEvent('scheduledDelivered', { id, from: msg.from, subject: msg.subject });
            }, delay);

            this._scheduledDeliveries[id] = { timeoutId, msg, delay };
            return { success: true, id };
        });

        // COMMAND: Set auto-reply message
        this.registerCommand('setAutoReply', (payload) => {
            const message = payload.message || payload.text;
            if (!message) return { success: false, error: 'Message required' };
            this._autoReply = {
                subject: payload.subject || 'Auto-Reply',
                body: message,
                from: payload.from || 'Auto-Reply System'
            };
            this.emitAppEvent('autoReplySet', { message });
            return { success: true };
        });

        // COMMAND: Clear auto-reply
        this.registerCommand('clearAutoReply', () => {
            this._autoReply = null;
            return { success: true };
        });

        // COMMAND: Deliver multiple messages at once (for ARG phase transitions)
        this.registerCommand('bulkDeliver', (payload) => {
            const messages = payload.messages;
            if (!messages || !Array.isArray(messages)) {
                return { success: false, error: 'Messages array required' };
            }
            const delivered = [];
            for (const msg of messages) {
                EventBus.emit(`command:${this.id}:deliverMessage`, {
                    from: msg.from || 'Unknown',
                    subject: msg.subject || '(No Subject)',
                    body: msg.body || msg.text || '',
                    folder: msg.folder || 'Inbox',
                    headers: msg.headers || null,
                    attachments: msg.attachments || null,
                    starred: msg.starred || false
                });
                delivered.push(msg.subject || '(No Subject)');
            }
            return { success: true, count: delivered.length, subjects: delivered };
        });

        // COMMAND: Full state reset
        this.registerCommand('reset', () => {
            // Cancel scheduled deliveries
            for (const id of Object.keys(this._scheduledDeliveries)) {
                clearTimeout(this._scheduledDeliveries[id].timeoutId);
            }
            this._scheduledDeliveries = {};
            this._autoReply = null;
            this.messages = [];
            this.activeMessageId = null;
            this.composing = false;
            this.unreadCount = 0;
            this.hasNewMail = false;
            this._recalcUnreadCount();
            this._renderFolders();
            this._renderMessageList();
            this._renderViewer();
            return { success: true };
        });

        // QUERY: Get config state
        this.registerQuery('getConfig', () => ({
            activeFolder: this.activeFolder,
            composing: this.composing,
            unreadCount: this.unreadCount,
            hasNewMail: this.hasNewMail,
            totalMessages: this.messages.length,
            folders: [...this.folders],
            autoReply: this._autoReply ? { ...this._autoReply } : null,
            scheduledDeliveries: Object.keys(this._scheduledDeliveries).length
        }));
    }

    _findMessage(id) {
        return this.messages.find(m => m.id === id) || null;
    }

    _sanitizeMessage(msg) {
        return { ...msg };
    }

    // ===================================================================
    //  PHASE 4 — Notification icon system
    // ===================================================================

    _installTrayIcon() {
        const tray = document.getElementById('systemTray');
        if (!tray) return;

        this._trayIcon = tray.querySelector('#inboxTrayIcon');

        if (!this._trayIcon) {
            const divider = tray.querySelector('.taskbar-divider-small');
            this._trayIcon = document.createElement('div');

            // Insert before the divider (or at start of tray)
            if (divider) {
                tray.insertBefore(this._trayIcon, divider);
            } else {
                tray.insertBefore(this._trayIcon, tray.firstChild);
            }
        }

        this._trayIcon.className = 'tray-icon';
        this._trayIcon.id = 'inboxTrayIcon';
        this._trayIcon.title = 'Inbox';
        this._trayIcon.textContent = '\u{1F4E8}'; // envelope
        this._trayIcon.style.cursor = 'pointer';
        this._trayIcon.style.position = 'relative';

        // Click to open/focus inbox
        this._trayIcon.onclick = () => {
            // Import AppRegistry dynamically to avoid circular dependency
            import('./AppRegistry.js').then(mod => {
                mod.default.launch('inbox');
            });
        };

        this._updateTrayIcon();
    }

    _removeTrayIcon() {
        // We keep the tray icon alive even when the window closes
        // It's part of the system notification area
    }

    _updateTrayIcon() {
        if (!this._trayIcon) return;

        if (this.hasNewMail || this.unreadCount > 0) {
            this._trayIcon.textContent = '\u{1F4E9}'; // envelope with arrow (new mail)
            this._trayIcon.title = `Inbox (${this.unreadCount} unread)`;
            // Add badge
            let badge = this._trayIcon.querySelector('.inbox-tray-badge');
            if (!badge && this.unreadCount > 0) {
                badge = document.createElement('span');
                badge.className = 'inbox-tray-badge';
                badge.style.cssText = 'position:absolute;top:-4px;right:-4px;background:#cc0000;color:#fff;font-size:11px;font-weight:bold;padding:0 3px;border-radius:6px;min-width:12px;text-align:center;line-height:15px;pointer-events:none;';
                this._trayIcon.appendChild(badge);
            }
            if (badge) {
                badge.textContent = this.unreadCount > 99 ? '99+' : String(this.unreadCount);
                badge.style.display = this.unreadCount > 0 ? 'block' : 'none';
            }
        } else {
            this._trayIcon.textContent = '\u{1F4E8}'; // normal envelope
            this._trayIcon.title = 'Inbox';
            const badge = this._trayIcon.querySelector('.inbox-tray-badge');
            if (badge) badge.style.display = 'none';
        }
    }

    // ===================================================================
    //  PHASE 5 — UI rendering & UX polish
    // ===================================================================

    _renderFolders() {
        const container = this.getElement('#inboxFolderList');
        if (!container) return;

        const folderIcons = {
            'Inbox': '\u{1F4E5}',
            'Sent': '\u{1F4E4}',
            'Drafts': '\u{1F4DD}',
            'Archive': '\u{1F4E6}',
            'Trash': '\u{1F5D1}\uFE0F'
        };

        container.innerHTML = this.folders.map(f => {
            const icon = folderIcons[f] || '\u{1F4C1}';
            const count = this.messages.filter(m => m.folder === f && !m.read).length;
            const active = this.activeFolder === f ? ' active' : '';
            const badge = count > 0 ? `<span class="inbox-folder-badge">${count}</span>` : '';
            return `<div class="inbox-folder-item${active}" data-folder="${this._escapeAttr(f)}">
                <span><span class="folder-icon">${icon}</span> ${escapeHtml(f)}</span>
                ${badge}
            </div>`;
        }).join('');
    }

    _renderMessageList() {
        const container = this.getElement('#inboxListScroll');
        if (!container) return;

        // Update header arrows to indicate sort state
        this.getElements('.inbox-list-header [data-sort]').forEach(el => {
            el.classList.remove('sorted-asc', 'sorted-desc');
            if (el.dataset.sort === this.sortField) {
                el.classList.add(this.sortAsc ? 'sorted-asc' : 'sorted-desc');
            }
        });

        const msgs = this._getVisibleMessages();

        if (!msgs.some(m => m.id === this.activeMessageId)) {
            this.activeMessageId = null;
        }

        if (msgs.length === 0) {
            container.innerHTML = `<div class="inbox-list-empty">${this.searchQuery ? 'No messages match your search' : 'No messages in this folder'}</div>`;
        } else {
            container.innerHTML = msgs.map(m => {
                const active = this.activeMessageId === m.id ? ' active' : '';
                const unread = !m.read ? ' unread' : '';
                const star = m.starred ? '\u2605' : '\u2606';
                const dateStr = this._formatDate(m.timestamp);
                const fromDisplay = this.activeFolder === 'Sent' ? `To: ${(m.to || ['?']).join(', ')}` : m.from;
                return `<div class="inbox-msg-row${active}${unread}" data-id="${this._escapeAttr(m.id)}">
                    <span class="col-flag">${star}</span>
                    <span class="col-from">${escapeHtml(fromDisplay)}</span>
                    <span class="col-subject">${escapeHtml(m.subject)}</span>
                    <span class="col-date">${dateStr}</span>
                </div>`;
            }).join('');
        }

        this._updateStatusBar();
    }

    _getVisibleMessages() {
        let msgs = this.messages.filter(m => m.folder === this.activeFolder);

        // Apply search
        if (this.searchQuery) {
            const q = this.searchQuery;
            msgs = msgs.filter(m =>
                m.subject.toLowerCase().includes(q) ||
                m.body.toLowerCase().includes(q) ||
                m.from.toLowerCase().includes(q)
            );
        }

        // Sort
        msgs.sort((a, b) => {
            let va = a[this.sortField] || '';
            let vb = b[this.sortField] || '';
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return this.sortAsc ? -1 : 1;
            if (va > vb) return this.sortAsc ? 1 : -1;
            return 0;
        });

        return msgs;
    }

    _renderViewer() {
        if (this.composing) return; // don't clobber compose view

        const emptyEl = this.getElement('#inboxViewerEmpty');
        const viewerEl = this.getElement('#inboxViewerContent');
        const composeEl = this.getElement('#inboxComposeContent');
        if (!emptyEl || !viewerEl || !composeEl) return;

        composeEl.style.display = 'none';

        if (!this.activeMessageId) {
            emptyEl.style.display = 'flex';
            viewerEl.style.display = 'none';
            return;
        }

        const msg = this._findMessage(this.activeMessageId);
        if (!msg) {
            emptyEl.style.display = 'flex';
            viewerEl.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        viewerEl.style.display = 'flex';

        // Build extra headers (for ARG clues)
        let extraHeaders = '';
        if (msg.headers && Object.keys(msg.headers).length > 0) {
            const hdrLines = Object.entries(msg.headers)
                .map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`)
                .join('\n');
            extraHeaders = `<div class="hdr-extra">${hdrLines}</div>`;
        }

        // Tags display
        const tagsHtml = msg.tags && msg.tags.length > 0
            ? `<div class="hdr-row"><span class="hdr-label">Tags:</span><span class="hdr-value">${msg.tags.map(t => escapeHtml(t)).join(', ')}</span></div>`
            : '';

        // Attachments
        let attachmentsHtml = '';
        if (msg.attachments && msg.attachments.length > 0) {
            attachmentsHtml = `<div class="inbox-viewer-attachments">
                ${msg.attachments.map(a => `<span class="inbox-attachment">\u{1F4CE} ${escapeHtml(typeof a === 'string' ? a : a.name || 'file')}</span>`).join('')}
            </div>`;
        }

        viewerEl.innerHTML = `
            <div class="inbox-viewer-headers">
                <div class="hdr-row"><span class="hdr-label">From:</span><span class="hdr-value">${escapeHtml(msg.from)}</span></div>
                <div class="hdr-row"><span class="hdr-label">To:</span><span class="hdr-value">${escapeHtml((msg.to || []).join(', '))}</span></div>
                <div class="hdr-row"><span class="hdr-label">Date:</span><span class="hdr-value">${new Date(msg.timestamp).toLocaleString()}</span></div>
                <div class="hdr-row"><span class="hdr-label">Subject:</span><span class="hdr-value" style="font-weight:bold;">${escapeHtml(msg.subject)}</span></div>
                ${tagsHtml}
                ${extraHeaders}
            </div>
            <div class="inbox-viewer-body">${escapeHtml(msg.body)}</div>
            ${attachmentsHtml}
        `;
    }

    _showCompose(prefill = {}) {
        this.composing = true;
        this.activeMessageId = null;

        const emptyEl = this.getElement('#inboxViewerEmpty');
        const viewerEl = this.getElement('#inboxViewerContent');
        const composeEl = this.getElement('#inboxComposeContent');
        if (!emptyEl || !viewerEl || !composeEl) return;

        emptyEl.style.display = 'none';
        viewerEl.style.display = 'none';
        composeEl.style.display = 'flex';

        composeEl.innerHTML = `
            <div class="inbox-compose">
                <div class="inbox-compose-fields">
                    <div class="inbox-compose-row">
                        <span class="inbox-compose-label">To:</span>
                        <input class="inbox-compose-input" id="composeTo" value="${this._escapeAttr(prefill.to || '')}">
                    </div>
                    <div class="inbox-compose-row">
                        <span class="inbox-compose-label">Subject:</span>
                        <input class="inbox-compose-input" id="composeSubject" value="${this._escapeAttr(prefill.subject || '')}">
                    </div>
                </div>
                <textarea class="inbox-compose-body" id="composeBody" placeholder="Type your message...">${escapeHtml(prefill.body || '')}</textarea>
                <div class="inbox-compose-toolbar">
                    <button class="inbox-toolbar-btn" id="composeSend">\u2709 Send</button>
                    <button class="inbox-toolbar-btn" id="composeSaveDraft">\u{1F4BE} Save Draft</button>
                    <button class="inbox-toolbar-btn" id="composeCancel">\u2716 Discard</button>
                </div>
            </div>
        `;

        // Bind compose actions
        this.addHandler(this.getElement('#composeSend'), 'click', () => this._handleSend());
        this.addHandler(this.getElement('#composeSaveDraft'), 'click', () => this._saveDraft());
        this.addHandler(this.getElement('#composeCancel'), 'click', () => this._discardCompose());

        // Focus To field
        setTimeout(() => this.getElement('#composeTo')?.focus(), 50);
    }

    _handleSend() {
        const toEl = this.getElement('#composeTo');
        const subjectEl = this.getElement('#composeSubject');
        const bodyEl = this.getElement('#composeBody');

        const to = toEl?.value.trim();
        const subject = subjectEl?.value.trim() || '(No Subject)';
        const body = bodyEl?.value || '';

        if (!to) {
            const statusEl = this.getElement('#inboxStatus');
            if (statusEl) statusEl.textContent = '! Please enter a recipient.';
            this.playSound('error');
            toEl?.focus();
            return;
        }

        const msg = this._createMessage({
            from: 'User',
            to: to.split(',').map(t => t.trim()).filter(Boolean),
            subject,
            body,
            folder: 'Sent',
            read: true,
            timestamp: new Date().toISOString()
        });

        this.messages.push(msg);
        this._saveMessage(msg);
        this.emitAppEvent('messageSent', { message: this._sanitizeMessage(msg) });
        this.playSound('notify');
        this._cancelCompose();
        this._renderFolders();
        this._renderMessageList();

        // Show status
        const statusEl = this.getElement('#inboxStatus');
        if (statusEl) statusEl.textContent = `Message sent to ${to}`;
    }

    _composeFieldValues() {
        const to = this.getElement('#composeTo')?.value.trim() || '';
        const subject = this.getElement('#composeSubject')?.value.trim() || '';
        const body = this.getElement('#composeBody')?.value || '';
        return { to, subject, body };
    }

    _saveDraft() {
        const { to, subject, body } = this._composeFieldValues();
        if (!to && !subject && !body) {
            this.playSound('error');
            const statusEl = this.getElement('#inboxStatus');
            if (statusEl) statusEl.textContent = '! Nothing to save.';
            return;
        }
        const msg = this._createMessage({
            from: 'User',
            to: to.split(',').map(t => t.trim()).filter(Boolean),
            subject: subject || '(Draft)',
            body,
            folder: 'Drafts',
            read: true,
            timestamp: new Date().toISOString()
        });
        this.messages.push(msg);
        this._saveMessage(msg);
        this.emitAppEvent('draftSaved', { message: this._sanitizeMessage(msg) });
        this.playSound('floppy');
        this._cancelCompose();
        this._renderFolders();
        this._renderMessageList();
        const statusEl = this.getElement('#inboxStatus');
        if (statusEl) statusEl.textContent = 'Draft saved.';
    }

    async _discardCompose() {
        const { to, subject, body } = this._composeFieldValues();
        const hasContent = to || subject || body;
        if (hasContent) {
            const ok = await this.confirm('Discard this message? Your draft will be lost.', 'Discard');
            if (!ok) return;
        }
        this.playSound('click');
        this._cancelCompose();
    }

    _cancelCompose() {
        this.composing = false;
        const composeEl = this.getElement('#inboxComposeContent');
        if (composeEl) {
            composeEl.style.display = 'none';
            composeEl.innerHTML = '';
        }
        this._renderViewer();
    }

    _selectFolder(folder) {
        this.activeFolder = folder;
        this.activeMessageId = null;
        this.composing = false;

        // Clear new-mail indicator when viewing inbox
        if (folder === 'Inbox' && this.hasNewMail) {
            this.hasNewMail = false;
            this._updateTrayIcon();
            this.emitAppEvent('notificationStateChanged', { hasNewMail: false });
        }

        this.emitAppEvent('folderSelected', { folder });

        this._renderFolders();
        this._renderMessageList();
        this._renderViewer();
    }

    _selectMessage(id) {
        if (this.composing) this._cancelCompose();

        this.activeMessageId = id;
        const msg = this._findMessage(id);

        if (msg && !msg.read) {
            msg.read = true;
            this._saveMessage(msg);
            this._recalcUnreadCount();
            this.emitAppEvent('messageReadChanged', { messageId: msg.id, read: true });
        }

        if (msg) {
            this.emitAppEvent('messageSelected', { messageId: msg.id, from: msg.from, subject: msg.subject });
        }

        this._renderMessageList();
        this._renderViewer();
    }

    _handleToolbarAction(action) {
        this.playSound('click');
        switch (action) {
            case 'compose':
                this._showCompose();
                break;

            case 'reply': {
                const msg = this._findMessage(this.activeMessageId);
                if (!msg) return;
                this._showCompose({
                    to: msg.from === 'User' ? (msg.to || []).join(', ') : msg.from,
                    subject: msg.subject.startsWith('Re: ') ? msg.subject : `Re: ${msg.subject}`,
                    body: `\n\n--- Original Message ---\nFrom: ${msg.from}\nDate: ${new Date(msg.timestamp).toLocaleString()}\n\n${msg.body}`
                });
                break;
            }

            case 'forward': {
                const msg = this._findMessage(this.activeMessageId);
                if (!msg) return;
                this._showCompose({
                    subject: msg.subject.startsWith('Fwd: ') ? msg.subject : `Fwd: ${msg.subject}`,
                    body: `\n\n--- Forwarded Message ---\nFrom: ${msg.from}\nTo: ${(msg.to || []).join(', ')}\nDate: ${new Date(msg.timestamp).toLocaleString()}\nSubject: ${msg.subject}\n\n${msg.body}`
                });
                break;
            }

            case 'markread': {
                const msg = this._findMessage(this.activeMessageId);
                if (!msg) return;
                if (msg.read) {
                    EventBus.emit(`command:inbox:markUnread`, { messageId: msg.id });
                } else {
                    EventBus.emit(`command:inbox:markRead`, { messageId: msg.id });
                }
                break;
            }

            case 'archive': {
                const msg = this._findMessage(this.activeMessageId);
                if (!msg) return;
                EventBus.emit(`command:inbox:moveMessage`, { messageId: msg.id, folder: 'Archive' });
                break;
            }

            case 'delete': {
                const msg = this._findMessage(this.activeMessageId);
                if (!msg) return;
                EventBus.emit(`command:inbox:deleteMessage`, { messageId: msg.id });
                break;
            }

            case 'refresh':
                this._loadMessages();
                this._renderFolders();
                this._renderMessageList();
                this._renderViewer();
                this.playSound('click');
                const statusEl = this.getElement('#inboxStatus');
                if (statusEl) statusEl.textContent = 'Mail checked.';
                break;
        }
    }

    _handleKeyboard(e) {
        // Ctrl+N: new message
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            this._showCompose();
            return;
        }
        // Ctrl+R: reply or refresh
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            if (this.activeMessageId) {
                this._handleToolbarAction('reply');
            } else {
                this._handleToolbarAction('refresh');
            }
            return;
        }
        // Delete: trash
        if (e.key === 'Delete' && this.activeMessageId && !this.composing) {
            this._handleToolbarAction('delete');
            return;
        }
        // Enter: open message
        if (e.key === 'Enter' && this.activeMessageId && !this.composing) {
            this._renderViewer();
            return;
        }
        // Escape: cancel compose or deselect
        if (e.key === 'Escape') {
            if (this.composing) {
                this._cancelCompose();
            } else {
                this.activeMessageId = null;
                this._renderMessageList();
                this._renderViewer();
            }
            return;
        }
        // Arrow keys for message navigation
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !this.composing) {
            e.preventDefault();
            const currentMsgs = this._getVisibleMessages();
            if (currentMsgs.length === 0) return;
            const idx = currentMsgs.findIndex(m => m.id === this.activeMessageId);
            let newIdx;
            if (e.key === 'ArrowDown') {
                newIdx = idx < currentMsgs.length - 1 ? idx + 1 : idx;
            } else {
                newIdx = idx > 0 ? idx - 1 : 0;
            }
            if (newIdx !== idx || this.activeMessageId === null) {
                this._selectMessage(currentMsgs[Math.max(0, newIdx)].id);
            }
        }
    }

    _updateStatusBar() {
        const statusEl = this.getElement('#inboxStatus');
        const countEl = this.getElement('#inboxCount');
        if (!countEl) return;

        const folderMsgs = this.messages.filter(m => m.folder === this.activeFolder);
        const unread = folderMsgs.filter(m => !m.read).length;
        countEl.textContent = `${folderMsgs.length} message${folderMsgs.length !== 1 ? 's' : ''}${unread > 0 ? `, ${unread} unread` : ''}`;
    }

    _formatDate(isoStr) {
        try {
            const d = new Date(isoStr);
            const now = new Date();
            const isToday = d.toDateString() === now.toDateString();
            if (isToday) {
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
        } catch {
            return '';
        }
    }

    _escapeAttr(text) {
        return String(text || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

export default Inbox;
