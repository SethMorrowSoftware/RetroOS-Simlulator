/**
 * Control Panel - Windows 95 Style System Settings
 * Provides access to system configuration and settings
 */

import AppBase from './AppBase.js';
import AppRegistry from './AppRegistry.js';
import { escapeHtml } from '../core/Sanitize.js';
import StateManager from '../core/StateManager.js';
import StorageManager from '../core/StorageManager.js';
import EventBus from '../core/EventBus.js';
import { getConfig, getSessionToken } from '../core/ConfigLoader.js';
import MultiplayerClient from '../core/MultiplayerClient.js';

class ControlPanel extends AppBase {
    constructor() {
        super({
            id: 'controlpanel',
            name: 'Control Panel',
            icon: '⚙️',
            width: 640,
            height: 530,
            minWidth: 520,
            minHeight: 440,
            resizable: true,
            singleton: true,
            category: 'settings'
        });

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('setSetting', (payload) => {
            if (!payload || !payload.setting) return { success: false, error: 'No setting provided' };
            const settingMap = {
                crtEffect: () => {
                    StateManager.setState('settings.crtEffect', payload.value, true);
                    const overlay = document.querySelector('.crt-overlay');
                    if (overlay) overlay.style.display = payload.value ? 'block' : 'none';
                },
                sound: () => {
                    StateManager.setState('settings.sound', payload.value, true);
                },
                petEnabled: () => {
                    StateManager.setState('settings.pet.enabled', payload.value, true);
                    EventBus.emit('pet:toggle', { enabled: payload.value });
                },
                petType: () => {
                    StateManager.setState('settings.pet.type', payload.value, true);
                    EventBus.emit('pet:change', { type: payload.value });
                },
                screensaverDelay: () => {
                    StateManager.setState('settings.screensaverDelay', payload.value, true);
                    EventBus.emit('screensaver:update-delay', { delay: payload.value });
                },
                desktopBg: () => {
                    StorageManager.set('desktopBg', payload.value);
                    document.body.style.setProperty('--desktop-bg', payload.value);
                    EventBus.emit('desktop:bg-change', { color: payload.value });
                }
            };
            if (!settingMap[payload.setting]) return { success: false, error: 'Unknown setting' };
            settingMap[payload.setting]();
            return { success: true, setting: payload.setting, value: payload.value };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getSettings', () => {
            const settings = StateManager.getState('settings');
            const desktopBg = StorageManager.get('desktopBg') || '#008080';
            return {
                crtEffect: settings.crtEffect,
                sound: settings.sound,
                pet: settings.pet,
                screensaverDelay: settings.screensaverDelay,
                desktopBg
            };
        });
    }

    onOpen() {
        console.log('[ControlPanel] Opening Control Panel...');
        const settings = StateManager.getState('settings');
        const desktopBg = StorageManager.get('desktopBg') || '#008080';
        console.log('[ControlPanel] Rendering with settings:', settings);

        return `
            <style>
                .control-panel {
                    padding: 10px;
                    background: #c0c0c0;
                    height: 100%;
                    overflow-y: auto;
                }
                .control-section {
                    background: white;
                    border: 2px groove #fff;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .control-section-title {
                    font-weight: bold;
                    font-size: 16px;
                    margin-bottom: 10px;
                    color: #000080;
                    border-bottom: 1px solid #c0c0c0;
                    padding-bottom: 5px;
                }
                .control-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 0;
                    border-bottom: 1px dotted #c0c0c0;
                }
                .control-item:last-child {
                    border-bottom: none;
                }
                .control-item-icon {
                    font-size: 24px;
                    width: 32px;
                    text-align: center;
                }
                .control-item-info {
                    flex: 1;
                }
                .control-item-label {
                    font-weight: bold;
                    font-size: 14px;
                }
                .control-item-desc {
                    font-size: 14px;
                    color: #666;
                }
                .control-link {
                    cursor: pointer;
                    transition: background 0.1s;
                }
                .control-link:hover {
                    background: #e8e8ff;
                }
                .control-link:active {
                    background: #d0d0ff;
                }
                .control-toggle {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .control-toggle input[type="checkbox"] {
                    width: 16px;
                    height: 16px;
                }
                .control-color-picker {
                    width: 80px;
                    height: 30px;
                    border: 2px inset #fff;
                    cursor: pointer;
                }
                .control-button {
                    padding: 6px 20px;
                    background: #c0c0c0;
                    border: 2px outset #fff;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                }
                .control-button:active {
                    border-style: inset;
                }
                .control-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                    gap: 15px;
                    padding: 10px;
                }
                .control-grid-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    padding: 15px 10px;
                    background: white;
                    border: 2px groove #fff;
                    cursor: pointer;
                    transition: background 0.1s;
                }
                .control-grid-item:hover {
                    background: #e0e0e0;
                }
                .control-grid-item:active {
                    background: #d0d0d0;
                    border-style: ridge;
                }
                .control-grid-icon {
                    font-size: 32px;
                }
                .control-grid-label {
                    font-size: 13px;
                    text-align: center;
                    font-weight: bold;
                }
                .pet-selector {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    margin-top: 8px;
                }
                .pet-select {
                    padding: 4px 8px;
                    border: 2px inset #fff;
                    background: #fff;
                    font-size: 12px;
                    font-family: 'MS Sans Serif', 'Segoe UI', Tahoma, sans-serif;
                    cursor: pointer;
                    min-width: 140px;
                }
                .pet-preview {
                    width: 32px;
                    height: 32px;
                    border: 2px inset #fff;
                    background: #000;
                    image-rendering: pixelated;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .pet-preview canvas {
                    image-rendering: pixelated;
                    image-rendering: -moz-crisp-edges;
                    image-rendering: crisp-edges;
                }
            </style>

            <div class="control-panel">
                <div class="control-section">
                    <div class="control-section-title">🖥️ Display Settings</div>

                    <div class="control-item">
                        <div class="control-item-icon">🎨</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Desktop Background Color</div>
                            <div class="control-item-desc">Customize your desktop appearance</div>
                        </div>
                        <div>
                            <input type="color" class="control-color-picker" id="bg-color" value="${desktopBg}">
                        </div>
                    </div>

                    <div class="control-item">
                        <div class="control-item-icon">📺</div>
                        <div class="control-item-info">
                            <div class="control-item-label">CRT Effect</div>
                            <div class="control-item-desc">Enable retro monitor scanlines</div>
                        </div>
                        <div class="control-toggle">
                            <input type="checkbox" id="crt-effect" ${settings.crtEffect ? 'checked' : ''}>
                            <label for="crt-effect">${settings.crtEffect ? 'On' : 'Off'}</label>
                        </div>
                    </div>
                </div>

                <div class="control-section">
                    <div class="control-section-title">🔊 Sound Settings</div>

                    <div class="control-item">
                        <div class="control-item-icon">🔔</div>
                        <div class="control-item-info">
                            <div class="control-item-label">System Sounds</div>
                            <div class="control-item-desc">Enable retro sound effects</div>
                        </div>
                        <div class="control-toggle">
                            <input type="checkbox" id="sound-toggle" ${settings.sound ? 'checked' : ''}>
                            <label for="sound-toggle">${settings.sound ? 'On' : 'Off'}</label>
                        </div>
                    </div>
                </div>

                <div class="control-section">
                    <div class="control-section-title">Desktop Pet</div>

                    <div class="control-item">
                        <div class="control-item-icon" style="font-family: monospace; font-size: 16px;">:3</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Enable Desktop Pet</div>
                            <div class="control-item-desc">Your very own virtual companion! Just like 1997.</div>
                        </div>
                        <div class="control-toggle">
                            <input type="checkbox" id="pet-toggle" ${settings.pet.enabled ? 'checked' : ''}>
                            <label for="pet-toggle">${settings.pet.enabled ? 'On' : 'Off'}</label>
                        </div>
                    </div>

                    <div class="control-item">
                        <div class="control-item-info">
                            <div class="control-item-label">Select Pet Type</div>
                            <div class="control-item-desc">Choose your desktop friend</div>
                        </div>
                        <div class="pet-selector">
                            <div class="pet-preview" id="pet-preview"></div>
                            <select class="pet-select" id="pet-type-select">
                                <option value="neko" ${settings.pet.type === 'neko' ? 'selected' : ''}>Neko (Cat)</option>
                                <option value="dog" ${settings.pet.type === 'dog' || !settings.pet.type ? 'selected' : ''}>Dogz</option>
                                <option value="sheep" ${settings.pet.type === 'sheep' ? 'selected' : ''}>eSheep</option>
                            </select>
                        </div>
                    </div>

                    <div class="control-item">
                        <div class="control-item-info">
                            <div class="control-item-label" style="font-size: 13px; color: #666; font-style: italic; font-weight: normal;">
                                Tip: Double-click your pet for a fortune! Drag to move.
                            </div>
                        </div>
                    </div>
                </div>

                <div class="control-section">
                    <div class="control-section-title">💤 Screensaver</div>

                    <div class="control-item">
                        <div class="control-item-icon">⏱️</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Screensaver Delay</div>
                            <div class="control-item-desc">Minutes until screensaver activates</div>
                        </div>
                        <div>
                            <select id="screensaver-delay" style="padding: 4px; border: 2px inset #fff; font-size: 14px;">
                                <option value="60000" ${settings.screensaverDelay === 60000 ? 'selected' : ''}>1 minute</option>
                                <option value="180000" ${settings.screensaverDelay === 180000 ? 'selected' : ''}>3 minutes</option>
                                <option value="300000" ${settings.screensaverDelay === 300000 ? 'selected' : ''}>5 minutes</option>
                                <option value="600000" ${settings.screensaverDelay === 600000 ? 'selected' : ''}>10 minutes</option>
                                <option value="9999999" ${settings.screensaverDelay === 9999999 ? 'selected' : ''}>Never</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="control-section">
                    <div class="control-section-title">📋 System Information</div>

                    <div class="control-item">
                        <div class="control-item-icon">💾</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Storage Used</div>
                            <div class="control-item-desc">LocalStorage data usage</div>
                        </div>
                        <div id="storage-info" style="font-size: 14px; font-weight: bold;">
                            Calculating...
                        </div>
                    </div>

                    <div class="control-item">
                        <div class="control-item-icon">🏆</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Achievements Unlocked</div>
                            <div class="control-item-desc">Your progress in ${getConfig('branding.osName', 'IlluminatOS!')}</div>
                        </div>
                        <div style="font-size: 14px; font-weight: bold;">
                            ${StateManager.getState('achievements').length} achievements
                        </div>
                    </div>
                </div>

                <div class="control-section">
                    <div class="control-section-title">📋 More Settings</div>

                    <div class="control-item control-link" data-app="display">
                        <div class="control-item-icon">🖥️</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Display Properties</div>
                            <div class="control-item-desc">Wallpaper, themes, and visual effects</div>
                        </div>
                        <span style="color: #666;">▶</span>
                    </div>

                    <div class="control-item control-link" data-app="sounds">
                        <div class="control-item-icon">🔊</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Sound Settings</div>
                            <div class="control-item-desc">Volume, sound effects, and audio</div>
                        </div>
                        <span style="color: #666;">▶</span>
                    </div>

                    <div class="control-item control-link" data-app="features-settings">
                        <div class="control-item-icon">⚡</div>
                        <div class="control-item-info">
                            <div class="control-item-label">System Features</div>
                            <div class="control-item-desc">Enable/disable features like Clippy, Easter Eggs</div>
                        </div>
                        <span style="color: #666;">▶</span>
                    </div>
                </div>

                <div class="control-section">
                    <div class="control-section-title">🌐 Multiplayer Settings</div>

                    <div class="control-item">
                        <div class="control-item-icon">📡</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Connection Status</div>
                            <div class="control-item-desc" id="mp-status">${MultiplayerClient.isConnected() ? '● Connected to multiplayer server' : '○ Not connected'}</div>
                        </div>
                        <button class="control-button" id="mp-connect-btn">${MultiplayerClient.isConnected() ? 'Disconnect' : 'Connect'}</button>
                    </div>

                    <div class="control-item">
                        <div class="control-item-icon">👤</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Show Online Status</div>
                            <div class="control-item-desc">Show your online status to other players</div>
                        </div>
                        <div class="control-toggle">
                            <input type="checkbox" id="mp-show-online" ${StorageManager.get('mp.showOnline') !== false ? 'checked' : ''} />
                        </div>
                    </div>

                    <div class="control-item">
                        <div class="control-item-icon">🔔</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Game Notifications</div>
                            <div class="control-item-desc">Show notifications for game invites and turn alerts</div>
                        </div>
                        <div class="control-toggle">
                            <input type="checkbox" id="mp-notifications" ${StorageManager.get('mp.notifications') !== false ? 'checked' : ''} />
                        </div>
                    </div>

                    <div class="control-item control-link" id="mp-open-lobby">
                        <div class="control-item-icon">🎮</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Game Lobby</div>
                            <div class="control-item-desc">Browse and join multiplayer games</div>
                        </div>
                        <span style="color: #666;">▶</span>
                    </div>
                </div>

                <div class="control-section">
                    <div class="control-section-title">⚠️ Advanced Options</div>

                    <div class="control-item">
                        <div class="control-item-icon">🔄</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Reset ${getConfig('branding.osName', 'IlluminatOS!')}</div>
                            <div class="control-item-desc">Clear all data and restore defaults</div>
                        </div>
                        <button class="control-button" id="reset-button">Reset</button>
                    </div>

                    <div class="control-item">
                        <div class="control-item-icon">📤</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Export Settings</div>
                            <div class="control-item-desc">Backup your configuration</div>
                        </div>
                        <button class="control-button" id="export-button">Export</button>
                    </div>

                    <div class="control-item">
                        <div class="control-item-icon">📥</div>
                        <div class="control-item-info">
                            <div class="control-item-label">Import Settings</div>
                            <div class="control-item-desc">Restore from backup</div>
                        </div>
                        <button class="control-button" id="import-button">Import</button>
                    </div>
                </div>
            </div>
        `;
    }

    onMount() {
        // Background color picker
        const bgColorPicker = this.getElement('#bg-color');
        if (bgColorPicker) {
            this.addHandler(bgColorPicker, 'change', (e) => {
                const color = e.target.value;
                StorageManager.set('desktopBg', color);
                document.body.style.setProperty('--desktop-bg', color);
                EventBus.emit('desktop:bg-change', { color });
            });
        }

        // CRT effect toggle
        const crtToggle = this.getElement('#crt-effect');
        if (crtToggle) {
            this.addHandler(crtToggle, 'change', (e) => {
                const enabled = e.target.checked;
                StateManager.setState('settings.crtEffect', enabled, true);
                const overlay = document.querySelector('.crt-overlay');
                if (overlay) {
                    overlay.style.display = enabled ? 'block' : 'none';
                }
                e.target.nextElementSibling.textContent = enabled ? 'On' : 'Off';
            });
        }

        // Sound toggle
        const soundToggle = this.getElement('#sound-toggle');
        if (soundToggle) {
            this.addHandler(soundToggle, 'change', (e) => {
                const enabled = e.target.checked;
                StateManager.setState('settings.sound', enabled, true);
                e.target.nextElementSibling.textContent = enabled ? 'On' : 'Off';
            });
        }

        // Pet toggle
        const petToggle = this.getElement('#pet-toggle');
        if (petToggle) {
            this.addHandler(petToggle, 'change', (e) => {
                const enabled = e.target.checked;
                StateManager.setState('settings.pet.enabled', enabled, true);
                EventBus.emit('pet:toggle', { enabled });
                e.target.nextElementSibling.textContent = enabled ? 'On' : 'Off';
            });
        }

        // Pet type selector dropdown
        const petTypeSelect = this.getElement('#pet-type-select');
        if (petTypeSelect) {
            this.addHandler(petTypeSelect, 'change', (e) => {
                const petType = e.target.value;
                StateManager.setState('settings.pet.type', petType, true);
                EventBus.emit('pet:change', { type: petType });
                this.updatePetPreview(petType);
            });
            // Initialize preview
            this.updatePetPreview(petTypeSelect.value);
        }

        // Screensaver delay
        const screensaverDelay = this.getElement('#screensaver-delay');
        if (screensaverDelay) {
            this.addHandler(screensaverDelay, 'change', (e) => {
                const delay = parseInt(e.target.value);
                StateManager.setState('settings.screensaverDelay', delay, true);
                EventBus.emit('screensaver:update-delay', { delay });
            });
        }

        // Storage info
        this.updateStorageInfo();

        // Settings app links
        const settingsLinks = this.getElements('.control-link');
        console.log('[ControlPanel] Found', settingsLinks.length, 'settings links:', Array.from(settingsLinks).map(l => l.dataset.app));
        settingsLinks.forEach(link => {
            this.addHandler(link, 'click', (e) => {
                const appId = e.currentTarget.dataset.app;
                console.log('[ControlPanel] Settings link clicked:', appId);
                if (appId) {
                    AppRegistry.launch(appId);
                }
            });
        });

        // Reset button
        const resetButton = this.getElement('#reset-button');
        if (resetButton) {
            this.addHandler(resetButton, 'click', async () => {
                if (await this.confirm(`This will delete all your data and reset ${getConfig('branding.osName', 'IlluminatOS!')} to defaults. Continue?`, 'Reset System')) {
                    StateManager.reset();
                }
            });
        }

        // Export button - Complete System Snapshot
        const exportButton = this.getElement('#export-button');
        if (exportButton) {
            this.addHandler(exportButton, 'click', () => {
                const data = StateManager.exportCompleteState();
                const json = JSON.stringify(data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                // Include timestamp in filename for versioning
                const timestamp = new Date().toISOString().split('T')[0];
                a.download = `retros-snapshot-${timestamp}.json`;
                a.click();
                URL.revokeObjectURL(url);

                // Show success message with snapshot info
                const sizeKB = (json.length / 1024).toFixed(2);
                this.alert(`Complete system snapshot exported!\n\nIncludes:\n• Desktop icons & positions\n• File system\n• Display settings\n• App data (calendar, games, etc.)\n• All preferences\n\nSize: ${sizeKB} KB`);
            });
        }

        // Import button - Complete System Snapshot
        const importButton = this.getElement('#import-button');
        if (importButton) {
            this.addHandler(importButton, 'click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'application/json';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const data = JSON.parse(event.target.result);
                            const result = StateManager.importCompleteState(data);

                            if (result.success) {
                                let message = 'System snapshot restored successfully!';
                                if (result.legacy) {
                                    message = 'Legacy backup imported (partial restore).';
                                } else if (result.meta) {
                                    message = `Snapshot restored!\n\nFrom: ${result.meta.timestamp}\nVersion: ${result.meta.version}`;
                                }
                                if (result.warnings && result.warnings.length > 0) {
                                    message += '\n\nWarnings:\n• ' + result.warnings.join('\n• ');
                                }
                                this.alert(message + '\n\nReloading...');
                                window.location.reload();
                            } else {
                                this.alert('Failed to import snapshot: ' + result.error);
                            }
                        } catch (err) {
                            this.alert('Failed to import snapshot: ' + err.message);
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });
        }

        // Multiplayer settings handlers
        const mpConnectBtn = this.getElement('#mp-connect-btn');
        if (mpConnectBtn) {
            this.addHandler(mpConnectBtn, 'click', () => {
                if (MultiplayerClient.isConnected()) {
                    MultiplayerClient.disconnect();
                    mpConnectBtn.textContent = 'Connect';
                    const statusEl = this.getElement('#mp-status');
                    if (statusEl) statusEl.textContent = '○ Not connected';
                } else {
                    const token = getSessionToken();
                    if (token) {
                        MultiplayerClient.connect(token);
                        mpConnectBtn.textContent = 'Disconnect';
                        const statusEl = this.getElement('#mp-status');
                        if (statusEl) statusEl.textContent = '● Connecting...';
                    } else {
                        this.alert('No session token available. Please log in first.');
                    }
                }
            });
        }

        const mpShowOnline = this.getElement('#mp-show-online');
        if (mpShowOnline) {
            this.addHandler(mpShowOnline, 'change', (e) => {
                StorageManager.set('mp.showOnline', e.target.checked);
            });
        }

        const mpNotifications = this.getElement('#mp-notifications');
        if (mpNotifications) {
            this.addHandler(mpNotifications, 'change', (e) => {
                StorageManager.set('mp.notifications', e.target.checked);
            });
        }

        const mpOpenLobby = this.getElement('#mp-open-lobby');
        if (mpOpenLobby) {
            this.addHandler(mpOpenLobby, 'click', () => {
                AppRegistry.launch('gamelobby');
            });
        }
    }

    updateStorageInfo() {
        const storageInfo = this.getElement('#storage-info');
        if (!storageInfo) return;

        let totalSize = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage[key].length + key.length;
            }
        }

        const sizeKB = (totalSize / 1024).toFixed(2);
        storageInfo.textContent = `${sizeKB} KB`;
    }

    updatePetPreview(petType) {
        const preview = this.getElement('#pet-preview');
        if (!preview) return;

        // Create a small canvas for the preview
        preview.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        canvas.style.imageRendering = 'pixelated';
        const ctx = canvas.getContext('2d');

        // Draw a simple preview based on pet type
        switch (petType) {
            case 'neko':
                // Draw cat face
                ctx.fillStyle = '#F5F5DC'; // Beige
                ctx.fillRect(6, 8, 12, 10); // Face
                ctx.fillRect(4, 4, 4, 6); // Left ear
                ctx.fillRect(16, 4, 4, 6); // Right ear
                ctx.fillStyle = '#FFB6C1'; // Pink inner ear
                ctx.fillRect(5, 5, 2, 3);
                ctx.fillRect(17, 5, 2, 3);
                ctx.fillStyle = '#000';
                ctx.fillRect(8, 11, 2, 2); // Left eye
                ctx.fillRect(14, 11, 2, 2); // Right eye
                ctx.fillStyle = '#FFB6C1';
                ctx.fillRect(11, 14, 2, 2); // Nose
                break;
            case 'dog':
                // Draw dog face
                ctx.fillStyle = '#8B4513'; // Brown
                ctx.fillRect(6, 8, 12, 12); // Face
                ctx.fillRect(3, 6, 5, 8); // Left ear
                ctx.fillRect(16, 6, 5, 8); // Right ear
                ctx.fillStyle = '#A0522D';
                ctx.fillRect(8, 10, 8, 6); // Muzzle lighter
                ctx.fillStyle = '#000';
                ctx.fillRect(9, 10, 2, 2); // Left eye
                ctx.fillRect(13, 10, 2, 2); // Right eye
                ctx.fillRect(11, 14, 2, 3); // Nose
                break;
            case 'sheep':
                // Draw sheep face
                ctx.fillStyle = '#F5F5F5'; // White wool
                ctx.fillRect(4, 4, 16, 14); // Wool body
                ctx.fillRect(2, 6, 4, 8);
                ctx.fillRect(18, 6, 4, 8);
                ctx.fillStyle = '#2F2F2F'; // Dark face
                ctx.fillRect(7, 8, 10, 10); // Face
                ctx.fillStyle = '#FFF';
                ctx.fillRect(9, 11, 2, 2); // Left eye
                ctx.fillRect(13, 11, 2, 2); // Right eye
                break;
        }

        preview.appendChild(canvas);
    }
}

export default ControlPanel;
