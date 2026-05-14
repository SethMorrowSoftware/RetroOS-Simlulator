/**
 * Display Properties - Windows 95 Style Display Settings
 * Configure wallpaper, colors, screensaver, and appearance
 */

import AppBase from './AppBase.js';
import StateManager from '../core/StateManager.js';
import { escapeHtml } from '../core/Sanitize.js';
import StorageManager from '../core/StorageManager.js';
import EventBus from '../core/EventBus.js';
import { getConfig } from '../core/ConfigLoader.js';

// Color scheme definitions
const COLOR_SCHEMES = {
    win95: {
        name: 'Windows Standard',
        desktop: '#008080',
        window: '#c0c0c0',
        titlebar: '#000080',
        titlebarText: '#ffffff',
        menu: '#c0c0c0',
        menuText: '#000000'
    },
    highcontrast: {
        name: 'High Contrast Black',
        desktop: '#000000',
        window: '#000000',
        titlebar: '#800080',
        titlebarText: '#ffffff',
        menu: '#000000',
        menuText: '#ffffff'
    },
    desert: {
        name: 'Desert',
        desktop: '#c2a366',
        window: '#d4c4a8',
        titlebar: '#8b7355',
        titlebarText: '#ffffff',
        menu: '#d4c4a8',
        menuText: '#000000'
    },
    ocean: {
        name: 'Ocean',
        desktop: '#006994',
        window: '#b0c4de',
        titlebar: '#003366',
        titlebarText: '#ffffff',
        menu: '#b0c4de',
        menuText: '#000000'
    },
    rose: {
        name: 'Rose',
        desktop: '#c08080',
        window: '#e8d0d0',
        titlebar: '#8b4560',
        titlebarText: '#ffffff',
        menu: '#e8d0d0',
        menuText: '#000000'
    },
    slate: {
        name: 'Slate',
        desktop: '#606070',
        window: '#a0a0b0',
        titlebar: '#404050',
        titlebarText: '#ffffff',
        menu: '#a0a0b0',
        menuText: '#000000'
    }
};

// Wallpaper pattern definitions (CSS patterns)
const WALLPAPER_PATTERNS = {
    '': null, // None
    'clouds': `
        radial-gradient(ellipse at 20% 30%, rgba(255,255,255,0.8) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 40%, rgba(255,255,255,0.6) 0%, transparent 40%),
        radial-gradient(ellipse at 50% 70%, rgba(255,255,255,0.7) 0%, transparent 45%),
        radial-gradient(ellipse at 10% 80%, rgba(255,255,255,0.5) 0%, transparent 35%),
        linear-gradient(180deg, #87CEEB 0%, #4A90D9 100%)
    `,
    'tiles': `
        repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px),
        repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)
    `,
    'waves': `
        repeating-linear-gradient(
            45deg,
            transparent,
            transparent 20px,
            rgba(255,255,255,0.15) 20px,
            rgba(255,255,255,0.15) 40px
        ),
        repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 20px,
            rgba(0,0,0,0.1) 20px,
            rgba(0,0,0,0.1) 40px
        ),
        linear-gradient(135deg, #1a5276 0%, #2980b9 50%, #1a5276 100%)
    `,
    'forest': `
        linear-gradient(180deg,
            #228B22 0%,
            #006400 30%,
            #004d00 60%,
            #003300 100%
        )
    `,
    'space': `
        radial-gradient(ellipse at 20% 20%, rgba(255,255,255,0.8) 0%, transparent 1%),
        radial-gradient(ellipse at 80% 30%, rgba(255,255,255,0.6) 0%, transparent 1%),
        radial-gradient(ellipse at 40% 60%, rgba(255,255,255,0.9) 0%, transparent 1%),
        radial-gradient(ellipse at 60% 80%, rgba(255,255,255,0.5) 0%, transparent 1%),
        radial-gradient(ellipse at 10% 70%, rgba(255,255,255,0.7) 0%, transparent 1%),
        radial-gradient(ellipse at 90% 60%, rgba(255,255,255,0.4) 0%, transparent 1%),
        radial-gradient(ellipse at 30% 90%, rgba(255,255,255,0.6) 0%, transparent 1%),
        radial-gradient(ellipse at 70% 10%, rgba(255,255,255,0.8) 0%, transparent 1%),
        linear-gradient(180deg, #0a0a2e 0%, #1a1a4e 50%, #0a0a2e 100%)
    `
};

// Screensaver type definitions
const SCREENSAVER_TYPES = {
    toasters: { name: 'Flying Toasters', items: ['🍞', '🥪', '☕', '🎸', '📎'] },
    starfield: { name: 'Starfield', items: ['✦', '✧', '★', '☆', '⋆'] },
    marquee: { name: 'Marquee', items: null },
    none: { name: '(None)', items: null }
};

class DisplayProperties extends AppBase {
    constructor() {
        super({
            id: 'display',
            name: 'Display Properties',
            icon: '🖥️',
            width: 520,
            height: 550,
            minWidth: 460,
            minHeight: 480,
            resizable: true,
            singleton: true,
            category: 'settings'
        });

        this.currentTab = 'background';
        this.selectedWallpaper = '';
        this.selectedColor = '#008080';
        this.previewColor = '#008080';

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('setWallpaper', (payload) => {
            if (!payload || payload.wallpaper === undefined) return { success: false, error: 'No wallpaper provided' };
            this.selectedWallpaper = payload.wallpaper;
            return { success: true, wallpaper: payload.wallpaper };
        });

        this.registerCommand('setColorScheme', (payload) => {
            if (!payload || !payload.scheme) return { success: false, error: 'No scheme provided' };
            if (!COLOR_SCHEMES[payload.scheme]) return { success: false, error: 'Invalid scheme' };
            this.colorScheme = payload.scheme;
            return { success: true, scheme: payload.scheme };
        });

        this.registerCommand('applySettings', () => {
            this.applySettings();
            this.emitAppEvent('settings:applied', {
                wallpaper: this.selectedWallpaper,
                colorScheme: this.colorScheme
            });
            return { success: true };
        });

        this.registerCommand('setScreensaver', (payload) => {
            if (!payload || !payload.type) return { success: false, error: 'No type provided' };
            this.screensaverType = payload.type;
            return { success: true, type: payload.type };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getSettings', () => {
            return {
                wallpaper: this.selectedWallpaper,
                backgroundColor: this.selectedColor,
                colorScheme: this.colorScheme,
                screensaverType: this.screensaverType,
                crtEffect: StateManager.getState('settings.crtEffect'),
                windowAnimations: this.windowAnimations,
                menuShadows: this.menuShadows,
                smoothScrolling: this.smoothScrolling,
                iconSize: this.iconSize
            };
        });
    }

    onOpen() {
        // Load all saved settings
        const currentBg = StorageManager.get('desktopBg') || '#008080';
        const wallpaper = StorageManager.get('desktopWallpaper') ?? 'space';
        const crtEffect = StateManager.getState('settings.crtEffect');
        const screensaverDelay = StateManager.getState('settings.screensaverDelay') || 300000;
        const screensaverType = StorageManager.get('screensaverType') || 'toasters';
        const energySaving = StorageManager.get('energySaving') || false;
        const colorScheme = StorageManager.get('colorScheme') ?? 'slate';
        const windowAnimations = StorageManager.get('windowAnimations') !== false;
        const menuShadows = StorageManager.get('menuShadows') !== false;
        const smoothScrolling = StorageManager.get('smoothScrolling') !== false;
        const iconSize = StorageManager.get('iconSize') || 'medium';

        // Store current settings
        this.selectedColor = currentBg;
        this.selectedWallpaper = wallpaper;
        this.screensaverType = screensaverType;
        this.energySaving = energySaving;
        this.colorScheme = colorScheme;
        this.windowAnimations = windowAnimations;
        this.menuShadows = menuShadows;
        this.smoothScrolling = smoothScrolling;
        this.iconSize = iconSize;

        return `
            <style>
                .display-props {
                    background: #c0c0c0;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    font-size: 13px;
                }
                .display-tabs {
                    display: flex;
                    padding: 4px 4px 0 4px;
                }
                .display-tab {
                    padding: 4px 12px;
                    background: #c0c0c0;
                    border: 2px solid;
                    border-color: #fff #808080 #c0c0c0 #fff;
                    cursor: pointer;
                    margin-right: 2px;
                }
                .display-tab.active {
                    border-bottom-color: #c0c0c0;
                    margin-bottom: -2px;
                    padding-bottom: 6px;
                    z-index: 1;
                }
                .display-content {
                    flex: 1;
                    border: 2px solid;
                    border-color: #fff #808080 #808080 #fff;
                    margin: 0 4px;
                    padding: 10px;
                    overflow: hidden;
                }
                .display-panel {
                    display: none;
                    height: 100%;
                    flex-direction: column;
                }
                .display-panel.active {
                    display: flex;
                }
                .display-preview {
                    width: 180px;
                    height: 130px;
                    margin: 0 auto 15px;
                    border: 2px inset #fff;
                    position: relative;
                    overflow: hidden;
                }
                .preview-monitor {
                    width: 100%;
                    height: 100%;
                    background: var(--preview-bg, #008080);
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                    position: relative;
                }
                .preview-monitor.crt {
                    background-image: repeating-linear-gradient(
                        0deg,
                        rgba(0, 0, 0, 0.1) 0px,
                        rgba(0, 0, 0, 0.1) 1px,
                        transparent 1px,
                        transparent 2px
                    );
                }
                .preview-taskbar {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 14px;
                    background: var(--preview-taskbar, #c0c0c0);
                    border-top: 1px solid #fff;
                    display: flex;
                    align-items: center;
                    padding: 0 2px;
                }
                .preview-start {
                    font-size: 8px;
                    padding: 1px 4px;
                    background: #c0c0c0;
                    border: 1px outset #fff;
                }
                .preview-window {
                    position: absolute;
                    top: 15px;
                    left: 20px;
                    width: 80px;
                    height: 60px;
                    background: var(--preview-window, #c0c0c0);
                    border: 1px solid #000;
                }
                .preview-window-title {
                    background: var(--preview-titlebar, linear-gradient(90deg, #000080, #1084d0));
                    height: 10px;
                }
                .display-group {
                    background: white;
                    border: 2px groove #fff;
                    padding: 10px;
                    margin-bottom: 10px;
                }
                .display-group-title {
                    font-weight: bold;
                    margin-bottom: 8px;
                    color: #000080;
                }
                .wallpaper-list {
                    height: 100px;
                    overflow-y: auto;
                    background: white;
                    border: 2px inset #fff;
                    margin-bottom: 10px;
                }
                .wallpaper-item {
                    padding: 3px 8px;
                    cursor: pointer;
                }
                .wallpaper-item:hover {
                    background: #e0e0ff;
                }
                .wallpaper-item.selected {
                    background: #000080;
                    color: white;
                }
                .color-grid {
                    display: grid;
                    grid-template-columns: repeat(8, 1fr);
                    gap: 3px;
                    margin-top: 10px;
                }
                .color-swatch {
                    width: 100%;
                    aspect-ratio: 1;
                    border: 2px outset #fff;
                    cursor: pointer;
                }
                .color-swatch.selected {
                    border: 2px inset #000;
                }
                .display-footer {
                    padding: 10px 4px;
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                }
                .display-btn {
                    padding: 4px 20px;
                    background: #c0c0c0;
                    border: 2px outset #fff;
                    cursor: pointer;
                    min-width: 70px;
                }
                .display-btn:active {
                    border-style: inset;
                }
                .display-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 8px;
                }
                .display-row label {
                    min-width: 100px;
                }
                .display-row select {
                    flex: 1;
                    padding: 3px;
                    border: 2px inset #fff;
                    font-size: 13px;
                }
                .display-check {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 8px 0;
                }
                .screensaver-preview {
                    width: 100%;
                    height: 100px;
                    background: #000;
                    border: 2px inset #fff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 10px;
                    position: relative;
                    overflow: hidden;
                }
                .screensaver-preview-text {
                    color: #333;
                    font-size: 12px;
                }
                .flying-preview {
                    position: absolute;
                    font-size: 20px;
                    animation: fly-preview 4s linear infinite;
                }
                .starfield-preview {
                    position: absolute;
                    color: white;
                    animation: star-preview 2s linear infinite;
                }
                .marquee-preview {
                    color: #00ff00;
                    font-size: 16px;
                    font-family: monospace;
                    animation: marquee-preview 4s linear infinite;
                    white-space: nowrap;
                }
                @keyframes fly-preview {
                    from { transform: translateX(100px) translateY(-20px); }
                    to { transform: translateX(-100px) translateY(80px); }
                }
                @keyframes star-preview {
                    0% { opacity: 0; transform: scale(0.5); }
                    50% { opacity: 1; transform: scale(1); }
                    100% { opacity: 0; transform: scale(1.5); }
                }
                @keyframes marquee-preview {
                    from { transform: translateX(100%); }
                    to { transform: translateX(-100%); }
                }
                .appearance-scheme {
                    height: 100px;
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
                .scheme-preview {
                    display: flex;
                    gap: 5px;
                    margin-top: 10px;
                }
                .scheme-color-box {
                    width: 30px;
                    height: 20px;
                    border: 1px solid #000;
                }
            </style>

            <div class="display-props">
                <div class="display-tabs">
                    <div class="display-tab active" data-tab="background">Background</div>
                    <div class="display-tab" data-tab="screensaver">Screen Saver</div>
                    <div class="display-tab" data-tab="appearance">Appearance</div>
                    <div class="display-tab" data-tab="effects">Effects</div>
                </div>

                <div class="display-content">
                    <!-- Background Tab -->
                    <div class="display-panel active" id="panel-background">
                        <div class="display-preview">
                            <div class="preview-monitor" id="preview-monitor" style="--preview-bg: ${currentBg}">
                                <div class="preview-window">
                                    <div class="preview-window-title"></div>
                                </div>
                                <div class="preview-taskbar">
                                    <div class="preview-start">Start</div>
                                </div>
                            </div>
                        </div>

                        <div class="display-group">
                            <div class="display-group-title">Wallpaper</div>
                            <div class="wallpaper-list" id="wallpaper-list">
                                <div class="wallpaper-item ${!wallpaper ? 'selected' : ''}" data-wallpaper="">(None)</div>
                                <div class="wallpaper-item ${wallpaper === 'clouds' ? 'selected' : ''}" data-wallpaper="clouds">Clouds</div>
                                <div class="wallpaper-item ${wallpaper === 'tiles' ? 'selected' : ''}" data-wallpaper="tiles">Tiles</div>
                                <div class="wallpaper-item ${wallpaper === 'waves' ? 'selected' : ''}" data-wallpaper="waves">Waves</div>
                                <div class="wallpaper-item ${wallpaper === 'forest' ? 'selected' : ''}" data-wallpaper="forest">Forest</div>
                                <div class="wallpaper-item ${wallpaper === 'space' ? 'selected' : ''}" data-wallpaper="space">Space</div>
                            </div>
                        </div>

                        <div class="display-group">
                            <div class="display-group-title">Background Color</div>
                            <div class="color-grid" id="color-grid">
                                ${this.generateColorGrid(currentBg)}
                            </div>
                        </div>
                    </div>

                    <!-- Screen Saver Tab -->
                    <div class="display-panel" id="panel-screensaver">
                        <div class="screensaver-preview" id="screensaver-preview">
                            ${this.renderScreensaverPreview(screensaverType)}
                        </div>

                        <div class="display-group">
                            <div class="display-group-title">Screen Saver</div>
                            <div class="display-row">
                                <label>Screen saver:</label>
                                <select id="screensaver-type">
                                    <option value="toasters" ${screensaverType === 'toasters' ? 'selected' : ''}>Flying Toasters</option>
                                    <option value="starfield" ${screensaverType === 'starfield' ? 'selected' : ''}>Starfield</option>
                                    <option value="marquee" ${screensaverType === 'marquee' ? 'selected' : ''}>Marquee</option>
                                    <option value="none" ${screensaverType === 'none' ? 'selected' : ''}>(None)</option>
                                </select>
                            </div>
                            <div class="display-row">
                                <label>Wait:</label>
                                <select id="screensaver-wait">
                                    <option value="60000" ${screensaverDelay === 60000 ? 'selected' : ''}>1 minute</option>
                                    <option value="180000" ${screensaverDelay === 180000 ? 'selected' : ''}>3 minutes</option>
                                    <option value="300000" ${screensaverDelay === 300000 ? 'selected' : ''}>5 minutes</option>
                                    <option value="600000" ${screensaverDelay === 600000 ? 'selected' : ''}>10 minutes</option>
                                    <option value="9999999" ${screensaverDelay >= 9999999 ? 'selected' : ''}>Never</option>
                                </select>
                            </div>
                            <button class="display-btn" id="btn-preview-ss">Preview</button>
                        </div>

                        <div class="display-group">
                            <div class="display-group-title">Energy saving features</div>
                            <div class="display-check">
                                <input type="checkbox" id="energy-monitor" ${energySaving ? 'checked' : ''}>
                                <label for="energy-monitor">Low power mode (dim screen after idle)</label>
                            </div>
                        </div>
                    </div>

                    <!-- Appearance Tab -->
                    <div class="display-panel" id="panel-appearance">
                        <div class="display-preview">
                            <div class="preview-monitor" id="appearance-preview" style="--preview-bg: ${COLOR_SCHEMES[colorScheme].desktop}">
                                <div class="preview-window" style="background: ${COLOR_SCHEMES[colorScheme].window}">
                                    <div class="preview-window-title" style="background: ${COLOR_SCHEMES[colorScheme].titlebar}"></div>
                                </div>
                                <div class="preview-taskbar" style="background: ${COLOR_SCHEMES[colorScheme].menu}">
                                    <div class="preview-start">Start</div>
                                </div>
                            </div>
                        </div>

                        <div class="display-group">
                            <div class="display-group-title">Color Scheme</div>
                            <div class="appearance-scheme" id="scheme-list">
                                ${Object.entries(COLOR_SCHEMES).map(([id, scheme]) => `
                                    <div class="scheme-item ${colorScheme === id ? 'selected' : ''}" data-scheme="${id}">${scheme.name}</div>
                                `).join('')}
                            </div>
                            <div class="scheme-preview" id="scheme-preview">
                                <div class="scheme-color-box" style="background: ${COLOR_SCHEMES[colorScheme].desktop}" title="Desktop"></div>
                                <div class="scheme-color-box" style="background: ${COLOR_SCHEMES[colorScheme].titlebar}" title="Title Bar"></div>
                                <div class="scheme-color-box" style="background: ${COLOR_SCHEMES[colorScheme].window}" title="Window"></div>
                                <div class="scheme-color-box" style="background: ${COLOR_SCHEMES[colorScheme].menu}" title="Menu"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Effects Tab -->
                    <div class="display-panel" id="panel-effects">
                        <div class="display-group">
                            <div class="display-group-title">Visual effects</div>
                            <div class="display-check">
                                <input type="checkbox" id="effect-crt" ${crtEffect ? 'checked' : ''}>
                                <label for="effect-crt">CRT scanline effect</label>
                            </div>
                            <div class="display-check">
                                <input type="checkbox" id="effect-animations" ${windowAnimations ? 'checked' : ''}>
                                <label for="effect-animations">Animate windows when minimizing</label>
                            </div>
                            <div class="display-check">
                                <input type="checkbox" id="effect-shadows" ${menuShadows ? 'checked' : ''}>
                                <label for="effect-shadows">Show shadows under menus</label>
                            </div>
                            <div class="display-check">
                                <input type="checkbox" id="effect-smooth" ${smoothScrolling ? 'checked' : ''}>
                                <label for="effect-smooth">Use smooth scrolling</label>
                            </div>
                        </div>

                        <div class="display-group">
                            <div class="display-group-title">Desktop icons</div>
                            <div class="display-row">
                                <label>Icon size:</label>
                                <select id="icon-size">
                                    <option value="small" ${iconSize === 'small' ? 'selected' : ''}>Small</option>
                                    <option value="medium" ${iconSize === 'medium' ? 'selected' : ''}>Medium</option>
                                    <option value="large" ${iconSize === 'large' ? 'selected' : ''}>Large</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="display-footer">
                    <button class="display-btn" id="btn-ok">OK</button>
                    <button class="display-btn" id="btn-cancel">Cancel</button>
                    <button class="display-btn" id="btn-apply">Apply</button>
                </div>
            </div>
        `;
    }

    generateColorGrid(currentColor) {
        const colors = [
            '#008080', '#000080', '#800000', '#008000',
            '#800080', '#808000', '#000000', '#808080',
            '#c0c0c0', '#0000ff', '#ff0000', '#00ff00',
            '#ff00ff', '#ffff00', '#ffffff', '#00ffff',
            '#004040', '#000040', '#400000', '#004000',
            '#400040', '#404000', '#c0c0c0', '#404040'
        ];

        return colors.map(color => `
            <div class="color-swatch ${color === currentColor ? 'selected' : ''}"
                 style="background: ${color}"
                 data-color="${color}"></div>
        `).join('');
    }

    renderScreensaverPreview(type) {
        const config = SCREENSAVER_TYPES[type];
        if (!config || type === 'none') {
            return '<span class="screensaver-preview-text">(No screensaver)</span>';
        }

        if (type === 'toasters') {
            return `
                <span class="flying-preview">🍞</span>
                <span class="flying-preview" style="animation-delay: 1s; top: 30px;">🥪</span>
                <span class="flying-preview" style="animation-delay: 2s; top: 60px;">☕</span>
            `;
        } else if (type === 'starfield') {
            return `
                <span class="starfield-preview" style="left: 20%; top: 30%;">✦</span>
                <span class="starfield-preview" style="left: 60%; top: 20%; animation-delay: 0.5s;">★</span>
                <span class="starfield-preview" style="left: 40%; top: 60%; animation-delay: 1s;">✧</span>
                <span class="starfield-preview" style="left: 80%; top: 50%; animation-delay: 1.5s;">⋆</span>
            `;
        } else if (type === 'marquee') {
            return `<span class="marquee-preview">${getConfig('branding.screensaverText', 'IlluminatOS! - The Nostalgia Machine')}</span>`;
        }
        return '';
    }

    onMount() {
        // Tab switching
        const tabs = this.getElements('.display-tab');
        tabs.forEach(tab => {
            this.addHandler(tab, 'click', () => {
                if (this.currentTab !== tab.dataset.tab) this.playSound('click');
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;

                const panels = this.getElements('.display-panel');
                panels.forEach(p => p.classList.remove('active'));
                const targetPanel = this.getElement(`#panel-${tab.dataset.tab}`);
                if (targetPanel) targetPanel.classList.add('active');
            });
        });

        // Wallpaper selection
        const wallpaperItems = this.getElements('.wallpaper-item');
        wallpaperItems.forEach(item => {
            this.addHandler(item, 'click', () => {
                wallpaperItems.forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                this.selectedWallpaper = item.dataset.wallpaper;
                this.updateBackgroundPreview();
            });
        });

        // Color selection
        const colorSwatches = this.getElements('.color-swatch');
        colorSwatches.forEach(swatch => {
            this.addHandler(swatch, 'click', () => {
                colorSwatches.forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
                this.selectedColor = swatch.dataset.color;
                this.updateBackgroundPreview();
            });
        });

        // Scheme selection
        const schemeItems = this.getElements('.scheme-item');
        schemeItems.forEach(item => {
            this.addHandler(item, 'click', () => {
                schemeItems.forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                this.colorScheme = item.dataset.scheme;
                this.updateAppearancePreview();
            });
        });

        // Screensaver type selection
        const screensaverType = this.getElement('#screensaver-type');
        if (screensaverType) {
            this.addHandler(screensaverType, 'change', (e) => {
                this.screensaverType = e.target.value;
                this.updateScreensaverPreview();
            });
        }

        // Screensaver wait
        const screensaverWait = this.getElement('#screensaver-wait');
        if (screensaverWait) {
            this.addHandler(screensaverWait, 'change', (e) => {
                const delay = parseInt(e.target.value);
                StateManager.setState('settings.screensaverDelay', delay, true);
                EventBus.emit('screensaver:update-delay', { delay });
            });
        }

        // Energy saving toggle
        const energyToggle = this.getElement('#energy-monitor');
        if (energyToggle) {
            this.addHandler(energyToggle, 'change', (e) => {
                this.energySaving = e.target.checked;
            });
        }

        // CRT effect toggle
        const crtToggle = this.getElement('#effect-crt');
        if (crtToggle) {
            this.addHandler(crtToggle, 'change', (e) => {
                const enabled = e.target.checked;
                StateManager.setState('settings.crtEffect', enabled, true);
                const overlay = document.querySelector('.crt-overlay');
                if (overlay) {
                    overlay.classList.toggle('active', enabled);
                }
            });
        }

        // Window animations toggle
        const animationsToggle = this.getElement('#effect-animations');
        if (animationsToggle) {
            this.addHandler(animationsToggle, 'change', (e) => {
                this.windowAnimations = e.target.checked;
            });
        }

        // Menu shadows toggle
        const shadowsToggle = this.getElement('#effect-shadows');
        if (shadowsToggle) {
            this.addHandler(shadowsToggle, 'change', (e) => {
                this.menuShadows = e.target.checked;
            });
        }

        // Smooth scrolling toggle
        const smoothToggle = this.getElement('#effect-smooth');
        if (smoothToggle) {
            this.addHandler(smoothToggle, 'change', (e) => {
                this.smoothScrolling = e.target.checked;
            });
        }

        // Icon size dropdown
        const iconSizeSelect = this.getElement('#icon-size');
        if (iconSizeSelect) {
            this.addHandler(iconSizeSelect, 'change', (e) => {
                this.iconSize = e.target.value;
            });
        }

        // Preview button
        const previewBtn = this.getElement('#btn-preview-ss');
        if (previewBtn) {
            this.addHandler(previewBtn, 'click', () => {
                EventBus.emit('screensaver:start');
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

    updateBackgroundPreview() {
        const preview = this.getElement('#preview-monitor');
        if (preview) {
            // Show color
            preview.style.setProperty('--preview-bg', this.selectedColor);

            // Show wallpaper pattern if selected
            const pattern = WALLPAPER_PATTERNS[this.selectedWallpaper];
            if (pattern) {
                preview.style.backgroundImage = pattern;
            } else {
                preview.style.backgroundImage = 'none';
                preview.style.background = this.selectedColor;
            }
        }
    }

    updateAppearancePreview() {
        const preview = this.getElement('#appearance-preview');
        const schemePreview = this.getElement('#scheme-preview');
        const scheme = COLOR_SCHEMES[this.colorScheme];

        if (preview && scheme) {
            preview.style.setProperty('--preview-bg', scheme.desktop);
            preview.style.background = scheme.desktop;

            const window = preview.querySelector('.preview-window');
            const titlebar = preview.querySelector('.preview-window-title');
            const taskbar = preview.querySelector('.preview-taskbar');

            if (window) window.style.background = scheme.window;
            if (titlebar) titlebar.style.background = scheme.titlebar;
            if (taskbar) taskbar.style.background = scheme.menu;
        }

        if (schemePreview && scheme) {
            schemePreview.innerHTML = `
                <div class="scheme-color-box" style="background: ${scheme.desktop}" title="Desktop"></div>
                <div class="scheme-color-box" style="background: ${scheme.titlebar}" title="Title Bar"></div>
                <div class="scheme-color-box" style="background: ${scheme.window}" title="Window"></div>
                <div class="scheme-color-box" style="background: ${scheme.menu}" title="Menu"></div>
            `;
        }
    }

    updateScreensaverPreview() {
        const preview = this.getElement('#screensaver-preview');
        if (preview) {
            preview.innerHTML = this.renderScreensaverPreview(this.screensaverType);
        }
    }

    applySettings() {
        // Apply background color
        StorageManager.set('desktopBg', this.selectedColor);
        document.body.style.setProperty('--desktop-bg', this.selectedColor);
        const desktop = document.querySelector('.desktop');
        if (desktop) {
            desktop.style.backgroundColor = this.selectedColor;
        }

        // Apply wallpaper pattern
        StorageManager.set('desktopWallpaper', this.selectedWallpaper);
        const pattern = WALLPAPER_PATTERNS[this.selectedWallpaper];
        if (desktop) {
            if (pattern) {
                desktop.style.backgroundImage = pattern;
            } else {
                desktop.style.backgroundImage = 'none';
            }
        }

        // Apply color scheme
        StorageManager.set('colorScheme', this.colorScheme);
        const scheme = COLOR_SCHEMES[this.colorScheme];
        if (scheme) {
            document.documentElement.style.setProperty('--win95-gray', scheme.window);
            document.documentElement.style.setProperty('--win95-blue', scheme.titlebar);
            document.documentElement.style.setProperty('--accent-color', scheme.titlebar);
            document.body.classList.remove(...Object.keys(COLOR_SCHEMES).map(s => `scheme-${s}`));
            document.body.classList.add(`scheme-${this.colorScheme}`);
        }

        // Apply screensaver settings
        StorageManager.set('screensaverType', this.screensaverType);
        StorageManager.set('energySaving', this.energySaving);
        EventBus.emit('screensaver:update-type', { type: this.screensaverType });

        // Apply energy saving
        document.body.classList.toggle('energy-saving', this.energySaving);

        // Apply window animations
        StorageManager.set('windowAnimations', this.windowAnimations);
        document.body.classList.toggle('no-animations', !this.windowAnimations);

        // Apply menu shadows
        StorageManager.set('menuShadows', this.menuShadows);
        document.body.classList.toggle('no-shadows', !this.menuShadows);

        // Apply smooth scrolling
        StorageManager.set('smoothScrolling', this.smoothScrolling);
        document.body.classList.toggle('no-smooth-scroll', !this.smoothScrolling);

        // Apply icon size
        StorageManager.set('iconSize', this.iconSize);
        document.body.classList.remove('icon-size-small', 'icon-size-medium', 'icon-size-large');
        document.body.classList.add(`icon-size-${this.iconSize}`);

        EventBus.emit('desktop:bg-change', { color: this.selectedColor, wallpaper: this.selectedWallpaper });
        EventBus.emit('desktop:settings-change', {
            colorScheme: this.colorScheme,
            screensaverType: this.screensaverType,
            iconSize: this.iconSize,
            windowAnimations: this.windowAnimations,
            menuShadows: this.menuShadows,
            smoothScrolling: this.smoothScrolling
        });
        EventBus.emit('sound:play', { type: 'click' });
    }
}

export default DisplayProperties;
