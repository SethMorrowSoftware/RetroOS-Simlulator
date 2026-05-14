/**
 * Sound Settings - Windows 95 Style Sound Control Panel
 * Configure system sounds and volume
 */

import AppBase from './AppBase.js';
import StateManager from '../core/StateManager.js';
import EventBus, { Events } from '../core/EventBus.js';

class SoundSettings extends AppBase {
    constructor() {
        super({
            id: 'sounds',
            name: 'Sound Settings',
            icon: '🔊',
            width: 500,
            height: 530,
            minWidth: 440,
            minHeight: 460,
            resizable: true,
            singleton: true,
            category: 'settings'
        });

        this.currentTab = 'sounds';
        this.selectedEvent = null;

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('setVolume', (payload) => {
            if (payload === undefined || payload === null || payload.volume === undefined) return { success: false, error: 'No volume provided' };
            const value = Math.max(0, Math.min(100, payload.volume)) / 100;
            StateManager.setState('settings.volume', value, true);
            EventBus.emit(Events.VOLUME_CHANGE, { volume: value });
            const volumeSlider = this.getElement('#master-volume');
            const volumeDisplay = this.getElement('#volume-display');
            if (volumeSlider) volumeSlider.value = Math.round(value * 100);
            if (volumeDisplay) volumeDisplay.textContent = `${Math.round(value * 100)}%`;
            this.emitAppEvent('volume:changed', { volume: Math.round(value * 100) });
            return { success: true, volume: Math.round(value * 100) };
        });

        this.registerCommand('setSoundEnabled', (payload) => {
            if (payload === undefined || payload === null || payload.enabled === undefined) return { success: false, error: 'No enabled value provided' };
            StateManager.setState('settings.sound', payload.enabled, true);
            const enabledCheck = this.getElement('#sound-enabled');
            if (enabledCheck) enabledCheck.checked = payload.enabled;
            this.emitAppEvent('sound:toggled', { enabled: payload.enabled });
            return { success: true, enabled: payload.enabled };
        });

        this.registerCommand('testSound', (payload) => {
            if (!payload || !payload.type) return { success: false, error: 'No sound type provided' };
            this.playSound(payload.type);
            return { success: true, type: payload.type };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getVolume', () => {
            const volume = StateManager.getState('settings.volume') || 0.5;
            return { volume: Math.round(volume * 100) };
        });

        this.registerQuery('isSoundEnabled', () => {
            const enabled = StateManager.getState('settings.sound');
            return { enabled: !!enabled };
        });
    }

    onOpen() {
        const soundEnabled = StateManager.getState('settings.sound');
        const volume = StateManager.getState('settings.volume') || 0.5;

        return `
            <style>
                .sound-settings {
                    background: #c0c0c0;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    font-size: 12px;
                }
                .sound-tabs {
                    display: flex;
                    padding: 4px 4px 0 4px;
                }
                .sound-tab {
                    padding: 4px 12px;
                    background: #c0c0c0;
                    border: 2px solid;
                    border-color: #fff #808080 #c0c0c0 #fff;
                    cursor: pointer;
                    margin-right: 2px;
                }
                .sound-tab.active {
                    border-bottom-color: #c0c0c0;
                    margin-bottom: -2px;
                    padding-bottom: 6px;
                    z-index: 1;
                }
                .sound-content {
                    flex: 1;
                    border: 2px solid;
                    border-color: #fff #808080 #808080 #fff;
                    margin: 0 4px;
                    padding: 10px;
                    overflow: hidden;
                }
                .sound-panel {
                    display: none;
                    height: 100%;
                    flex-direction: column;
                }
                .sound-panel.active {
                    display: flex;
                }
                .sound-group {
                    background: white;
                    border: 2px groove #fff;
                    padding: 10px;
                    margin-bottom: 10px;
                }
                .sound-group-title {
                    font-weight: bold;
                    margin-bottom: 8px;
                    color: #000080;
                }
                .events-list {
                    height: 120px;
                    overflow-y: auto;
                    background: white;
                    border: 2px inset #fff;
                    margin-bottom: 10px;
                }
                .event-item {
                    padding: 3px 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .event-item:hover {
                    background: #e0e0ff;
                }
                .event-item.selected {
                    background: #000080;
                    color: white;
                }
                .event-icon {
                    font-size: 14px;
                }
                .sound-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 8px;
                }
                .sound-row label {
                    min-width: 80px;
                }
                .sound-row select,
                .sound-row input[type="text"] {
                    flex: 1;
                    padding: 3px;
                    border: 2px inset #fff;
                }
                .sound-btn {
                    padding: 4px 16px;
                    background: #c0c0c0;
                    border: 2px outset #fff;
                    cursor: pointer;
                    min-width: 70px;
                }
                .sound-btn:active {
                    border-style: inset;
                }
                .sound-btn:disabled {
                    color: #808080;
                    cursor: not-allowed;
                }
                .volume-slider {
                    flex: 1;
                    height: 20px;
                }
                .volume-display {
                    min-width: 40px;
                    text-align: right;
                }
                .sound-footer {
                    padding: 10px 4px;
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                }
                .sound-check {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 8px 0;
                }
                .scheme-list {
                    height: 80px;
                    overflow-y: auto;
                    background: white;
                    border: 2px inset #fff;
                    margin-bottom: 10px;
                }
                .scheme-item {
                    padding: 3px 8px;
                    cursor: pointer;
                }
                .scheme-item:hover {
                    background: #e0e0ff;
                }
                .scheme-item.selected {
                    background: #000080;
                    color: white;
                }
                .mixer-channel {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 5px;
                    padding: 10px;
                    background: #d4d4d4;
                    border: 2px groove #fff;
                }
                .mixer-label {
                    font-size: 12px;
                    text-align: center;
                }
                .mixer-slider {
                    writing-mode: bt-lr;
                    -webkit-appearance: slider-vertical;
                    width: 20px;
                    height: 100px;
                }
                .mixer-container {
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    margin-top: 10px;
                }
                .mixer-icon {
                    font-size: 20px;
                }
                .speaker-icon {
                    font-size: 48px;
                    text-align: center;
                    margin-bottom: 15px;
                }
            </style>

            <div class="sound-settings">
                <div class="sound-tabs">
                    <div class="sound-tab active" data-tab="sounds">Sounds</div>
                    <div class="sound-tab" data-tab="audio">Audio</div>
                    <div class="sound-tab" data-tab="volume">Volume</div>
                </div>

                <div class="sound-content">
                    <!-- Sounds Tab -->
                    <div class="sound-panel active" id="panel-sounds">
                        <div class="sound-group">
                            <div class="sound-group-title">Sound Events</div>
                            <div class="events-list" id="events-list">
                                <div class="event-item" data-event="startup">
                                    <span class="event-icon">🔔</span>
                                    <span>Start Windows</span>
                                </div>
                                <div class="event-item" data-event="shutdown">
                                    <span class="event-icon">🔔</span>
                                    <span>Exit Windows</span>
                                </div>
                                <div class="event-item" data-event="error">
                                    <span class="event-icon">🔔</span>
                                    <span>Critical Stop</span>
                                </div>
                                <div class="event-item" data-event="notify">
                                    <span class="event-icon">🔔</span>
                                    <span>Default Beep</span>
                                </div>
                                <div class="event-item" data-event="open">
                                    <span class="event-icon">🔔</span>
                                    <span>Open Program</span>
                                </div>
                                <div class="event-item" data-event="close">
                                    <span class="event-icon">🔔</span>
                                    <span>Close Program</span>
                                </div>
                                <div class="event-item" data-event="click">
                                    <span class="event-icon">🔔</span>
                                    <span>Menu Command</span>
                                </div>
                                <div class="event-item" data-event="achievement">
                                    <span class="event-icon">🔔</span>
                                    <span>New Mail Notification</span>
                                </div>
                            </div>
                        </div>

                        <div class="sound-group">
                            <div class="sound-row">
                                <label>Name:</label>
                                <input type="text" id="sound-name" readonly value="">
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 8px;">
                                <button class="sound-btn" id="btn-preview" disabled>▶ Preview</button>
                                <button class="sound-btn" id="btn-browse">Browse...</button>
                            </div>
                        </div>

                        <div class="sound-group">
                            <div class="sound-group-title">Schemes</div>
                            <div class="scheme-list" id="scheme-list">
                                <div class="scheme-item selected" data-scheme="default">Windows Default</div>
                                <div class="scheme-item" data-scheme="none">No Sounds</div>
                                <div class="scheme-item" data-scheme="retro">Retro Beeps</div>
                                <div class="scheme-item" data-scheme="nature">Nature</div>
                            </div>
                            <button class="sound-btn" id="btn-save-scheme">Save As...</button>
                        </div>
                    </div>

                    <!-- Audio Tab -->
                    <div class="sound-panel" id="panel-audio">
                        <div class="speaker-icon">🔊</div>

                        <div class="sound-group">
                            <div class="sound-group-title">Playback</div>
                            <div class="sound-row">
                                <label>Device:</label>
                                <select id="playback-device">
                                    <option value="default">Sound Blaster 16</option>
                                    <option value="hdmi">HDMI Audio</option>
                                </select>
                            </div>
                            <div class="sound-check">
                                <input type="checkbox" id="playback-default" checked>
                                <label for="playback-default">Use preferred device only</label>
                            </div>
                        </div>

                        <div class="sound-group">
                            <div class="sound-group-title">Recording</div>
                            <div class="sound-row">
                                <label>Device:</label>
                                <select id="recording-device">
                                    <option value="mic">Microphone</option>
                                    <option value="line">Line In</option>
                                </select>
                            </div>
                        </div>

                        <div class="sound-group">
                            <div class="sound-group-title">MIDI Music Playback</div>
                            <div class="sound-row">
                                <label>Device:</label>
                                <select id="midi-device">
                                    <option value="fm">FM Synthesis</option>
                                    <option value="wavetable">Wavetable</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Volume Tab -->
                    <div class="sound-panel" id="panel-volume">
                        <div class="sound-group">
                            <div class="sound-group-title">Master Volume</div>
                            <div class="sound-check">
                                <input type="checkbox" id="sound-enabled" ${soundEnabled ? 'checked' : ''}>
                                <label for="sound-enabled">Enable system sounds</label>
                            </div>
                            <div class="sound-row" style="margin-top: 15px;">
                                <span>🔈</span>
                                <input type="range" class="volume-slider" id="master-volume"
                                       min="0" max="100" value="${Math.round(volume * 100)}">
                                <span>🔊</span>
                                <span class="volume-display" id="volume-display">${Math.round(volume * 100)}%</span>
                            </div>
                        </div>

                        <div class="sound-group">
                            <div class="sound-group-title">Volume Mixer</div>
                            <div class="mixer-container">
                                <div class="mixer-channel">
                                    <div class="mixer-icon">🎵</div>
                                    <input type="range" class="mixer-slider" id="mixer-wave"
                                           min="0" max="100" value="100" orient="vertical">
                                    <div class="mixer-label">Wave</div>
                                </div>
                                <div class="mixer-channel">
                                    <div class="mixer-icon">🎹</div>
                                    <input type="range" class="mixer-slider" id="mixer-midi"
                                           min="0" max="100" value="80" orient="vertical">
                                    <div class="mixer-label">MIDI</div>
                                </div>
                                <div class="mixer-channel">
                                    <div class="mixer-icon">💿</div>
                                    <input type="range" class="mixer-slider" id="mixer-cd"
                                           min="0" max="100" value="75" orient="vertical">
                                    <div class="mixer-label">CD Audio</div>
                                </div>
                                <div class="mixer-channel">
                                    <div class="mixer-icon">🎤</div>
                                    <input type="range" class="mixer-slider" id="mixer-mic"
                                           min="0" max="100" value="50" orient="vertical">
                                    <div class="mixer-label">Mic</div>
                                </div>
                            </div>
                        </div>

                        <div class="sound-check">
                            <input type="checkbox" id="show-tray">
                            <label for="show-tray">Show volume control in taskbar</label>
                        </div>
                    </div>
                </div>

                <div class="sound-footer">
                    <button class="sound-btn" id="btn-ok">OK</button>
                    <button class="sound-btn" id="btn-cancel">Cancel</button>
                    <button class="sound-btn" id="btn-apply">Apply</button>
                </div>
            </div>
        `;
    }

    onMount() {
        // Tab switching
        const tabs = this.getElements('.sound-tab');
        tabs.forEach(tab => {
            this.addHandler(tab, 'click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;

                const panels = this.getElements('.sound-panel');
                panels.forEach(p => p.classList.remove('active'));
                const targetPanel = this.getElement(`#panel-${tab.dataset.tab}`);
                if (targetPanel) targetPanel.classList.add('active');
            });
        });

        // Event selection
        const eventItems = this.getElements('.event-item');
        eventItems.forEach(item => {
            this.addHandler(item, 'click', () => {
                eventItems.forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                this.selectedEvent = item.dataset.event;

                const soundName = this.getElement('#sound-name');
                const previewBtn = this.getElement('#btn-preview');

                if (soundName) {
                    soundName.value = `${this.selectedEvent}.wav`;
                }
                if (previewBtn) {
                    previewBtn.disabled = false;
                }
            });
        });

        // Preview button
        const previewBtn = this.getElement('#btn-preview');
        if (previewBtn) {
            this.addHandler(previewBtn, 'click', () => {
                if (this.selectedEvent) {
                    EventBus.emit(Events.SOUND_PLAY, { type: this.selectedEvent, force: true });
                }
            });
        }

        // Scheme selection
        const schemeItems = this.getElements('.scheme-item');
        schemeItems.forEach(item => {
            this.addHandler(item, 'click', () => {
                schemeItems.forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                if (item.dataset.scheme === 'none') {
                    StateManager.setState('settings.sound', false, true);
                    const enabledCheck = this.getElement('#sound-enabled');
                    if (enabledCheck) enabledCheck.checked = false;
                }
            });
        });

        // Sound enabled toggle
        const soundEnabled = this.getElement('#sound-enabled');
        if (soundEnabled) {
            this.addHandler(soundEnabled, 'change', (e) => {
                StateManager.setState('settings.sound', e.target.checked, true);
            });
        }

        // Master volume slider
        const volumeSlider = this.getElement('#master-volume');
        const volumeDisplay = this.getElement('#volume-display');
        if (volumeSlider) {
            this.addHandler(volumeSlider, 'input', (e) => {
                const value = parseInt(e.target.value);
                if (volumeDisplay) volumeDisplay.textContent = `${value}%`;
            });

            this.addHandler(volumeSlider, 'change', (e) => {
                const value = parseInt(e.target.value) / 100;
                StateManager.setState('settings.volume', value, true);
                EventBus.emit(Events.VOLUME_CHANGE, { volume: value });
            });
        }

        // Footer buttons
        this.addHandler(this.getElement('#btn-ok'), 'click', () => {
            this.applySettings();
            this.close();
        });

        this.addHandler(this.getElement('#btn-cancel'), 'click', () => {
            this.close();
        });

        this.addHandler(this.getElement('#btn-apply'), 'click', () => {
            this.applySettings();
        });
    }

    applySettings() {
        const volumeSlider = this.getElement('#master-volume');
        const soundEnabled = this.getElement('#sound-enabled');

        if (volumeSlider) {
            const value = parseInt(volumeSlider.value) / 100;
            StateManager.setState('settings.volume', value, true);
            EventBus.emit(Events.VOLUME_CHANGE, { volume: value });
        }

        if (soundEnabled) {
            StateManager.setState('settings.sound', soundEnabled.checked, true);
        }

        EventBus.emit(Events.SOUND_PLAY, { type: 'click' });
    }
}

export default SoundSettings;
