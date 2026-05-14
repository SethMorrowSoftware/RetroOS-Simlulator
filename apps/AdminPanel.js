/**
 * Admin Panel - Advanced System Administration
 * For power users to manage desktop icons, menu items, and system configuration
 */

import AppBase from './AppBase.js';
import StateManager from '../core/StateManager.js';
import StorageManager from '../core/StorageManager.js';
import EventBus from '../core/EventBus.js';
import { getConfig } from '../core/ConfigLoader.js';
import { escapeHtml } from '../core/Sanitize.js';
import AchievementSystem from '../features/AchievementSystem.js';

class AdminPanel extends AppBase {
    constructor() {
        super({
            id: 'adminpanel',
            name: 'Admin Panel',
            icon: '🔐',
            width: 700,
            height: 600,
            minWidth: 560,
            minHeight: 480,
            resizable: true,
            category: 'system',
            showInMenu: true
        });

        // Register semantic event commands for scriptability
        this.registerCommands();
        this.registerQueries();
    }

    registerCommands() {
        this.registerCommand('addIcon', (payload) => {
            if (!payload || !payload.emoji || !payload.id || !payload.label) {
                return { success: false, error: 'emoji, id, and label are required' };
            }
            const newIcon = {
                emoji: payload.emoji,
                id: payload.id,
                label: payload.label,
                type: payload.type || 'app'
            };
            if (Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
                newIcon.x = payload.x;
                newIcon.y = payload.y;
            }
            if (payload.url) newIcon.url = payload.url;
            StateManager.addIcon(newIcon);
            EventBus.emit('desktop:refresh');
            this.emitAppEvent('icon:added', newIcon);
            return { success: true };
        });

        this.registerCommand('removeIcon', (payload) => {
            if (!payload || payload.index === undefined) return { success: false, error: 'index is required' };
            const icons = StateManager.getState('icons') || [];
            if (payload.index < 0 || payload.index >= icons.length) return { success: false, error: 'Invalid index' };
            const removed = icons.splice(payload.index, 1)[0];
            StateManager.setState('icons', icons, true);
            EventBus.emit('desktop:refresh');
            this.emitAppEvent('icon:removed', removed);
            return { success: true };
        });

        this.registerCommand('unlockAchievement', (payload) => {
            if (!payload || !payload.achievement) return { success: false, error: 'achievement is required' };
            const achievements = StateManager.getState('achievements') || [];
            if (!achievements.includes(payload.achievement)) {
                achievements.push(payload.achievement);
                StateManager.setState('achievements', achievements, true);
                this.emitAppEvent('achievement:unlocked', { achievement: payload.achievement });
            }
            return { success: true };
        });

        this.registerCommand('resetAchievements', () => {
            StateManager.setState('achievements', [], true);
            this.emitAppEvent('achievements:reset', {});
            return { success: true };
        });
    }

    registerQueries() {
        this.registerQuery('getIcons', () => {
            return StateManager.getState('icons') || [];
        });

        this.registerQuery('getAchievements', () => {
            return StateManager.getState('achievements') || [];
        });

        this.registerQuery('isAdmin', () => {
            return StateManager.getState('user.isAdmin') || false;
        });

        this.registerQuery('getSystemInfo', () => {
            return {
                iconCount: (StateManager.getState('icons') || []).length,
                openWindows: (StateManager.getState('windows') || []).length,
                recycledItems: (StateManager.getState('recycledItems') || []).length,
                achievements: (StateManager.getState('achievements') || []).length,
                sound: StateManager.getState('settings.sound'),
                crtEffect: StateManager.getState('settings.crtEffect')
            };
        });
    }

    onOpen() {
        const icons = StateManager.getState('icons') || [];
        const isAdmin = StateManager.getState('user.isAdmin');
        const hasPassword = !!StorageManager.get('adminPassword');

        if (!isAdmin && hasPassword) {
            return this.renderPasswordPrompt();
        }

        return this.renderAdminInterface();
    }

    renderPasswordPrompt() {
        return `
            <style>
                .admin-login {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    background: #c0c0c0;
                    padding: 40px;
                }
                .admin-login-box {
                    background: white;
                    border: 2px groove #fff;
                    padding: 30px;
                    text-align: center;
                    min-width: 300px;
                }
                .admin-login-icon {
                    font-size: 48px;
                    margin-bottom: 20px;
                }
                .admin-login-title {
                    font-size: 16px;
                    font-weight: bold;
                    margin-bottom: 20px;
                    color: #000080;
                }
                .admin-input {
                    width: 100%;
                    padding: 8px;
                    border: 2px inset #fff;
                    margin-bottom: 15px;
                    font-size: 12px;
                }
                .admin-btn {
                    padding: 8px 30px;
                    background: #c0c0c0;
                    border: 2px outset #fff;
                    cursor: pointer;
                    font-weight: bold;
                }
                .admin-btn:active {
                    border-style: inset;
                }
                .admin-error {
                    color: red;
                    font-size: 12px;
                    margin-top: 10px;
                    display: none;
                }
            </style>
            <div class="admin-login">
                <div class="admin-login-box">
                    <div class="admin-login-icon">🔐</div>
                    <div class="admin-login-title">Administrator Access Required</div>
                    <div style="margin-bottom: 15px; font-size: 12px; color: #666;">
                        Enter password to access Admin Panel
                    </div>
                    <input type="password" class="admin-input" id="admin-password" placeholder="Password">
                    <button class="admin-btn" id="admin-login-btn">Login</button>
                    <div class="admin-error" id="admin-error">Incorrect password</div>
                </div>
            </div>
        `;
    }

    renderAdminInterface() {
        const icons = StateManager.getState('icons') || [];
        const achievements = StateManager.getState('achievements') || [];

        return `
            <style>
                .admin-panel {
                    background: #c0c0c0;
                    height: 100%;
                    overflow-y: auto;
                }
                .admin-tabs {
                    display: flex;
                    background: #c0c0c0;
                    border-bottom: 2px solid #808080;
                    padding: 5px 5px 0 5px;
                }
                .admin-tab {
                    padding: 8px 20px;
                    background: #a0a0a0;
                    border: 2px outset #fff;
                    border-bottom: none;
                    cursor: pointer;
                    margin-right: 2px;
                    font-size: 12px;
                    font-weight: bold;
                }
                .admin-tab.active {
                    background: #c0c0c0;
                    border-style: groove;
                    border-bottom: 2px solid #c0c0c0;
                }
                .admin-tab-content {
                    display: none;
                    padding: 15px;
                }
                .admin-tab-content.active {
                    display: block;
                }
                .admin-section {
                    background: white;
                    border: 2px groove #fff;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .admin-section-title {
                    font-weight: bold;
                    font-size: 14px;
                    margin-bottom: 10px;
                    color: #000080;
                    border-bottom: 1px solid #c0c0c0;
                    padding-bottom: 5px;
                }
                .admin-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }
                .admin-table th {
                    background: #c0c0c0;
                    padding: 6px;
                    text-align: left;
                    border: 1px solid #808080;
                    font-weight: bold;
                }
                .admin-table td {
                    padding: 6px;
                    border: 1px solid #c0c0c0;
                }
                .admin-button {
                    padding: 4px 12px;
                    background: #c0c0c0;
                    border: 2px outset #fff;
                    cursor: pointer;
                    font-size: 12px;
                }
                .admin-button:active {
                    border-style: inset;
                }
                .admin-button.danger {
                    background: #d00;
                    color: white;
                }
                .admin-input {
                    padding: 4px;
                    border: 2px inset #fff;
                    font-size: 12px;
                }
                .admin-form {
                    display: grid;
                    grid-template-columns: 120px 1fr;
                    gap: 10px;
                    align-items: center;
                }
                .admin-form label {
                    font-size: 12px;
                    font-weight: bold;
                }
            </style>

            <div class="admin-panel">
                <div class="admin-tabs">
                    <div class="admin-tab active" data-tab="icons">🖼️ Desktop Icons</div>
                    <div class="admin-tab" data-tab="security">🔒 Security</div>
                    <div class="admin-tab" data-tab="achievements">🏆 Achievements</div>
                    <div class="admin-tab" data-tab="system">⚙️ System</div>
                </div>

                <div class="admin-tab-content active" data-content="icons">
                    <div class="admin-section">
                        <div class="admin-section-title">Desktop Icons Manager</div>
                        <div style="margin-bottom: 15px;">
                            <button class="admin-button" id="add-icon-btn">➕ Add New Icon</button>
                            <button class="admin-button" id="reset-icons-btn">🔄 Reset to Defaults</button>
                        </div>
                        <div style="overflow-x: auto;">
                            <table class="admin-table">
                                <thead>
                                    <tr>
                                        <th>Icon</th>
                                        <th>ID</th>
                                        <th>Label</th>
                                        <th>Type</th>
                                        <th>Position</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="icons-table">
                                    ${icons.map((icon, idx) => `
                                        <tr>
                                            <td style="font-size: 20px;">${escapeHtml(icon.emoji)}</td>
                                            <td>${escapeHtml(icon.id)}</td>
                                            <td>${escapeHtml(icon.label)}</td>
                                            <td>${escapeHtml(icon.type || 'app')}</td>
                                            <td>${escapeHtml(icon.x)}, ${escapeHtml(icon.y)}</td>
                                            <td>
                                                <button class="admin-button edit-icon-btn" data-index="${idx}">Edit</button>
                                                <button class="admin-button danger delete-icon-btn" data-index="${idx}">Delete</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="admin-section" id="icon-editor" style="display: none;">
                        <div class="admin-section-title" id="editor-title">Add New Icon</div>
                        <div class="admin-form">
                            <label>Icon Emoji:</label>
                            <input type="text" class="admin-input" id="icon-emoji" placeholder="🎮" maxlength="2">

                            <label>ID:</label>
                            <input type="text" class="admin-input" id="icon-id" placeholder="my-app">

                            <label>Label:</label>
                            <input type="text" class="admin-input" id="icon-label" placeholder="My App">

                            <label>Type:</label>
                            <select class="admin-input" id="icon-type">
                                <option value="app">App</option>
                                <option value="link">Link</option>
                                <option value="folder">Folder</option>
                            </select>

                            <label>URL (if link):</label>
                            <input type="text" class="admin-input" id="icon-url" placeholder="https://...">

                            <label>X Position:</label>
                            <input type="number" class="admin-input" id="icon-x" value="20" step="10">

                            <label>Y Position:</label>
                            <input type="number" class="admin-input" id="icon-y" value="20" step="10">
                        </div>
                        <div style="margin-top: 15px;">
                            <button class="admin-button" id="save-icon-btn">💾 Save Icon</button>
                            <button class="admin-button" id="cancel-icon-btn">❌ Cancel</button>
                        </div>
                    </div>
                </div>

                <div class="admin-tab-content" data-content="security">
                    <div class="admin-section">
                        <div class="admin-section-title">Security Settings</div>
                        <div class="admin-form">
                            <label>Admin Password:</label>
                            <div>
                                <input type="password" class="admin-input" id="new-password" placeholder="New password" style="width: 200px;">
                                <button class="admin-button" id="set-password-btn">Set Password</button>
                            </div>

                            <label>Clear Password:</label>
                            <div>
                                <button class="admin-button danger" id="clear-password-btn">Remove Password Protection</button>
                            </div>
                        </div>
                    </div>

                    <div class="admin-section">
                        <div class="admin-section-title">Session Info</div>
                        <div style="font-size: 12px; line-height: 1.8;">
                            <strong>Status:</strong> Administrator<br>
                            <strong>Browser:</strong> ${navigator.userAgent}<br>
                            <strong>Screen:</strong> ${window.screen.width}x${window.screen.height}<br>
                            <strong>LocalStorage:</strong> Available
                        </div>
                    </div>
                </div>

                <div class="admin-tab-content" data-content="achievements">
                    <div class="admin-section">
                        <div class="admin-section-title">Achievements Manager</div>
                        <div style="margin-bottom: 15px;">
                            <button class="admin-button" id="unlock-all-btn">🏆 Unlock All Achievements</button>
                            <button class="admin-button danger" id="clear-achievements-btn">❌ Clear All Achievements</button>
                        </div>
                        <div style="font-size: 12px;">
                            <strong>Unlocked:</strong> ${achievements.length} achievements<br>
                            ${achievements.length > 0 ? `<div style="margin-top: 10px;">${achievements.join(', ')}</div>` : '<div style="margin-top: 10px; color: #666;">No achievements unlocked yet</div>'}
                        </div>
                    </div>
                </div>

                <div class="admin-tab-content" data-content="system">
                    <div class="admin-section">
                        <div class="admin-section-title">System Diagnostics</div>
                        <div style="font-size: 12px; font-family: monospace; background: black; color: #0f0; padding: 10px; overflow-x: auto;">
                            ${getConfig('branding.osName', 'IlluminatOS!')} System Diagnostics v1.0<br>
                            ═══════════════════════════════<br><br>
                            Desktop Icons: ${icons.length}<br>
                            Open Windows: ${StateManager.getState('windows').length}<br>
                            Recycled Items: ${StateManager.getState('recycledItems').length}<br>
                            Achievements: ${achievements.length}<br>
                            Sound: ${StateManager.getState('settings.sound') ? 'Enabled' : 'Disabled'}<br>
                            CRT Effect: ${StateManager.getState('settings.crtEffect') ? 'Enabled' : 'Disabled'}<br>
                            Desktop Pet: ${StateManager.getState('settings.pet.enabled') ? StateManager.getState('settings.pet.type') : 'Disabled'}<br><br>
                            System Status: OK
                        </div>
                    </div>

                    <div class="admin-section">
                        <div class="admin-section-title">Developer Tools</div>
                        <div>
                            <button class="admin-button" id="console-btn">🖥️ Open Console</button>
                            <button class="admin-button" id="reload-btn">🔄 Reload Page</button>
                            <button class="admin-button danger" id="clear-all-btn">⚠️ Factory Reset</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    onMount() {
        // Check if we're in login mode
        const loginBtn = this.getElement('#admin-login-btn');
        if (loginBtn) {
            this.setupLoginHandlers();
            return;
        }

        // Setup admin interface handlers
        this.setupTabHandlers();
        this.setupIconManagement();
        this.setupSecurityHandlers();
        this.setupAchievementHandlers();
        this.setupSystemHandlers();
    }

    async _hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    setupLoginHandlers() {
        const passwordInput = this.getElement('#admin-password');
        const loginBtn = this.getElement('#admin-login-btn');
        const errorDiv = this.getElement('#admin-error');

        const attemptLogin = async () => {
            const password = passwordInput.value;
            const savedHash = StorageManager.get('adminPasswordHash') || StorageManager.get('adminPassword');

            // Support migration from plaintext to hashed passwords
            const inputHash = await this._hashPassword(password);
            const isMatch = inputHash === savedHash || password === savedHash;

            if (isMatch) {
                // Migrate plaintext password to hash if needed
                if (StorageManager.get('adminPassword') && !StorageManager.get('adminPasswordHash')) {
                    StorageManager.set('adminPasswordHash', inputHash);
                    StorageManager.remove('adminPassword');
                }
                StateManager.setState('user.isAdmin', true);
                this.playSound('startup');
                this.setContent(this.renderAdminInterface());
            } else {
                errorDiv.style.display = 'block';
                passwordInput.value = '';
                passwordInput.focus();
                this.playSound('error');
            }
        };

        this.addHandler(loginBtn, 'click', attemptLogin);
        this.addHandler(passwordInput, 'keypress', (e) => {
            if (e.key === 'Enter') attemptLogin();
        });

        passwordInput.focus();
    }

    setupTabHandlers() {
        const tabs = this.getElements('.admin-tab');
        tabs.forEach(tab => {
            this.addHandler(tab, 'click', (e) => {
                const targetTab = e.currentTarget.dataset.tab;

                // Update tabs
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');

                // Update content
                const contents = this.getElements('.admin-tab-content');
                contents.forEach(content => {
                    if (content.dataset.content === targetTab) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }
                });
            });
        });
    }

    setupIconManagement() {
        // Add icon button
        const addBtn = this.getElement('#add-icon-btn');
        if (addBtn) {
            this.addHandler(addBtn, 'click', () => {
                this.setInstanceState('editingIndex', null);
                this.showIconEditor();
            });
        }

        // Reset icons button
        const resetBtn = this.getElement('#reset-icons-btn');
        if (resetBtn) {
            this.addHandler(resetBtn, 'click', async () => {
                if (await this.confirm('Reset all desktop icons to defaults?', 'Reset Icons')) {
                    StorageManager.remove('desktopIcons');
                    window.location.reload();
                }
            });
        }

        // Edit buttons
        const editBtns = this.getElements('.edit-icon-btn');
        editBtns.forEach(btn => {
            this.addHandler(btn, 'click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                this.editIcon(index);
            });
        });

        // Delete buttons
        const deleteBtns = this.getElements('.delete-icon-btn');
        deleteBtns.forEach(btn => {
            this.addHandler(btn, 'click', async (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                const icons = StateManager.getState('icons');
                if (await this.confirm(`Delete icon "${icons[index].label}"?`, 'Delete Icon')) {
                    icons.splice(index, 1);
                    StateManager.setState('icons', icons, true);
                    EventBus.emit('desktop:refresh');
                    this.setContent(this.renderAdminInterface());
                }
            });
        });

        // Save icon button
        const saveBtn = this.getElement('#save-icon-btn');
        if (saveBtn) {
            this.addHandler(saveBtn, 'click', () => {
                this.saveIcon();
            });
        }

        // Cancel button
        const cancelBtn = this.getElement('#cancel-icon-btn');
        if (cancelBtn) {
            this.addHandler(cancelBtn, 'click', () => {
                this.hideIconEditor();
            });
        }
    }

    showIconEditor() {
        const editor = this.getElement('#icon-editor');
        if (editor) editor.style.display = 'block';

        // Clear form
        this.getElement('#icon-emoji').value = '';
        this.getElement('#icon-id').value = '';
        this.getElement('#icon-label').value = '';
        this.getElement('#icon-type').value = 'app';
        this.getElement('#icon-url').value = '';
        this.getElement('#icon-x').value = '20';
        this.getElement('#icon-y').value = '20';

        this.getElement('#editor-title').textContent = 'Add New Icon';
    }

    hideIconEditor() {
        const editor = this.getElement('#icon-editor');
        if (editor) editor.style.display = 'none';
    }

    editIcon(index) {
        const icons = StateManager.getState('icons');
        const icon = icons[index];

        this.setInstanceState('editingIndex', index);
        this.showIconEditor();

        this.getElement('#icon-emoji').value = icon.emoji || '';
        this.getElement('#icon-id').value = icon.id || '';
        this.getElement('#icon-label').value = icon.label || '';
        this.getElement('#icon-type').value = icon.type || 'app';
        this.getElement('#icon-url').value = icon.url || '';
        this.getElement('#icon-x').value = icon.x || 20;
        this.getElement('#icon-y').value = icon.y || 20;

        this.getElement('#editor-title').textContent = 'Edit Icon';
    }

    saveIcon() {
        const editingIndex = this.getInstanceState('editingIndex');
        const icons = StateManager.getState('icons');

        const parsedX = parseInt(this.getElement('#icon-x').value, 10);
        const parsedY = parseInt(this.getElement('#icon-y').value, 10);

        const newIcon = {
            emoji: this.getElement('#icon-emoji').value,
            id: this.getElement('#icon-id').value,
            label: this.getElement('#icon-label').value,
            type: this.getElement('#icon-type').value
        };

        if (Number.isFinite(parsedX) && Number.isFinite(parsedY)) {
            newIcon.x = parsedX;
            newIcon.y = parsedY;
        }

        if (newIcon.type === 'link') {
            newIcon.url = this.getElement('#icon-url').value;
        }

        if (editingIndex !== null) {
            icons[editingIndex] = newIcon;
            StateManager.setState('icons', icons, true);
        } else {
            StateManager.addIcon(newIcon);
        }

        EventBus.emit('desktop:refresh');
        this.setContent(this.renderAdminInterface());
    }

    setupSecurityHandlers() {
        const setPasswordBtn = this.getElement('#set-password-btn');
        if (setPasswordBtn) {
            this.addHandler(setPasswordBtn, 'click', async () => {
                const password = this.getElement('#new-password').value;
                if (password) {
                    const hash = await this._hashPassword(password);
                    StorageManager.set('adminPasswordHash', hash);
                    StorageManager.remove('adminPassword'); // Remove any legacy plaintext
                    this.alert('Password set successfully!');
                    this.getElement('#new-password').value = '';
                }
            });
        }

        const clearPasswordBtn = this.getElement('#clear-password-btn');
        if (clearPasswordBtn) {
            this.addHandler(clearPasswordBtn, 'click', async () => {
                if (await this.confirm('Remove password protection?', 'Remove Password')) {
                    StorageManager.remove('adminPasswordHash');
                    StorageManager.remove('adminPassword'); // Legacy cleanup
                    StateManager.setState('user.isAdmin', false);
                    this.alert('Password protection removed');
                }
            });
        }
    }

    setupAchievementHandlers() {
        const unlockAllBtn = this.getElement('#unlock-all-btn');
        if (unlockAllBtn) {
            this.addHandler(unlockAllBtn, 'click', () => {
                const allAchievements = AchievementSystem.getAll().map(a => a.id);
                StateManager.setState('achievements', allAchievements, true);
                this.alert('All achievements unlocked!');
                this.setContent(this.renderAdminInterface());
            });
        }

        const clearBtn = this.getElement('#clear-achievements-btn');
        if (clearBtn) {
            this.addHandler(clearBtn, 'click', async () => {
                if (await this.confirm('Clear all achievements?', 'Clear Achievements')) {
                    StateManager.setState('achievements', [], true);
                    this.setContent(this.renderAdminInterface());
                }
            });
        }
    }

    setupSystemHandlers() {
        const consoleBtn = this.getElement('#console-btn');
        if (consoleBtn) {
            this.addHandler(consoleBtn, 'click', () => {
                console.log(`${getConfig('branding.osName', 'IlluminatOS!')} State:`, StateManager.exportState());
                this.alert('State logged to console. Press F12 to view.');
            });
        }

        const reloadBtn = this.getElement('#reload-btn');
        if (reloadBtn) {
            this.addHandler(reloadBtn, 'click', () => {
                window.location.reload();
            });
        }

        const clearAllBtn = this.getElement('#clear-all-btn');
        if (clearAllBtn) {
            this.addHandler(clearAllBtn, 'click', async () => {
                if (await this.confirm(`WARNING: This will erase ALL data and reset ${getConfig('branding.osName', 'IlluminatOS!')} to factory defaults. Continue?`, 'Factory Reset')) {
                    if (await this.confirm('Are you absolutely sure? This cannot be undone.', 'Confirm Factory Reset')) {
                        StateManager.reset();
                    }
                }
            });
        }
    }
}

export default AdminPanel;
