/**
 * DOOM App
 * Classic 1993 FPS via Chocolate Doom WebAssembly port
 */

import AppBase from './AppBase.js';

class Doom extends AppBase {
    constructor() {
        super({
            id: 'doom',
            name: 'DOOM',
            icon: '👹',
            width: 700,
            height: 560,
            minWidth: 480,
            minHeight: 400,
            resizable: true,
            category: 'games',
            singleton: true
        });

        this.gameHasFocus = false;

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('reload', () => {
            const frame = this.getElement('#doomFrame');
            const overlay = this.getElement('#doomOverlay');
            const status = this.getElement('#doomStatus');
            if (frame) {
                frame.src = frame.src;
                if (overlay) overlay.classList.remove('hidden');
                if (status) status.classList.remove('active');
            }
            return { success: true };
        });

        this.registerCommand('focus', () => {
            this.focusGame();
            return { success: true };
        });

        this.registerCommand('fullscreen', () => {
            this.toggleFullscreen();
            return { success: true };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getState', () => {
            return { isFocused: this.gameHasFocus };
        });
    }

    onOpen() {
        return `
            <style>
                .doom-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #000;
                }
                .doom-frame-wrapper {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #000;
                    position: relative;
                    min-height: 0;
                }
                .doom-aspect-container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    max-width: 800px;
                    aspect-ratio: 4 / 3;
                    background: #000;
                }
                .doom-frame {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border: none;
                    background: #000;
                }
                .doom-click-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0,0,0,0.7);
                    cursor: pointer;
                    z-index: 10;
                    transition: opacity 0.3s;
                }
                .doom-click-overlay.hidden {
                    opacity: 0;
                    pointer-events: none;
                }
                .doom-click-prompt {
                    text-align: center;
                    color: #fff;
                }
                .doom-click-prompt .icon {
                    font-size: 48px;
                    margin-bottom: 10px;
                }
                .doom-click-prompt .title {
                    font-size: 24px;
                    color: #f00;
                    margin-bottom: 5px;
                }
                .doom-click-prompt .subtitle {
                    font-size: 14px;
                    color: #888;
                }
                .doom-toolbar {
                    background: #1a1a1a;
                    padding: 8px 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-top: 1px solid #333;
                    flex-shrink: 0;
                }
                .doom-controls {
                    display: flex;
                    gap: 12px;
                    color: #888;
                    font-size: 12px;
                    flex-wrap: wrap;
                }
                .doom-controls b {
                    color: #f80;
                }
                .doom-buttons {
                    display: flex;
                    gap: 5px;
                }
                .doom-btn {
                    padding: 4px 12px;
                    background: #333;
                    border: 1px solid #555;
                    color: #fff;
                    cursor: pointer;
                    font-family: 'VT323', monospace;
                    font-size: 13px;
                }
                .doom-btn:hover {
                    background: #444;
                }
                .doom-btn:active {
                    background: #222;
                }
                .doom-status {
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    padding: 3px 8px;
                    background: rgba(0,0,0,0.7);
                    color: #0f0;
                    font-size: 12px;
                    border-radius: 3px;
                    z-index: 5;
                    display: none;
                }
                .doom-status.active {
                    display: block;
                }
            </style>
            <div class="doom-container">
                <div class="doom-frame-wrapper">
                    <div class="doom-aspect-container" id="doomWrapper">
                        <iframe 
                            id="doomFrame"
                            class="doom-frame"
                            src="https://silentspacemarine.com/"
                            allow="autoplay; fullscreen; gamepad; pointer-lock"
                            allowfullscreen
                        ></iframe>
                        <div class="doom-click-overlay" id="doomOverlay">
                            <div class="doom-click-prompt">
                                <div class="icon">👹</div>
                                <div class="title">CLICK TO PLAY</div>
                                <div class="subtitle">Game will capture mouse & keyboard</div>
                            </div>
                        </div>
                        <div class="doom-status" id="doomStatus">🎮 Game Active</div>
                    </div>
                </div>
                <div class="doom-toolbar">
                    <div class="doom-controls">
                        <span><b>Move:</b> WASD/Arrows</span>
                        <span><b>Fire:</b> Ctrl/Click</span>
                        <span><b>Use:</b> Space/E</span>
                        <span><b>Run:</b> Shift</span>
                        <span><b>Menu:</b> Esc</span>
                    </div>
                    <div class="doom-buttons">
                        <button class="doom-btn" id="doomReload">🔄 Reload</button>
                        <button class="doom-btn" id="doomFullscreen">⛶ Fullscreen</button>
                    </div>
                </div>
            </div>
        `;
    }

    onMount() {
        const overlay = this.getElement('#doomOverlay');
        const frame = this.getElement('#doomFrame');
        const status = this.getElement('#doomStatus');
        const reloadBtn = this.getElement('#doomReload');
        const fullscreenBtn = this.getElement('#doomFullscreen');

        // Click overlay to focus game
        if (overlay) {
            this.addHandler(overlay, 'click', () => {
                this.focusGame();
            });
        }

        // When iframe loads, set up focus handling
        if (frame) {
            this.addHandler(frame, 'load', () => {
                // Try to focus the iframe content
                try {
                    frame.focus();
                } catch (e) {
                    // Cross-origin, can't directly focus
                }
                this.emitAppEvent('game:launched', {});
            });
        }

        // Reload button
        if (reloadBtn) {
            this.addHandler(reloadBtn, 'click', () => {
                if (frame) {
                    frame.src = frame.src;
                    if (overlay) overlay.classList.remove('hidden');
                    if (status) status.classList.remove('active');
                }
            });
        }

        // Fullscreen button
        if (fullscreenBtn) {
            this.addHandler(fullscreenBtn, 'click', () => this.toggleFullscreen());
        }

        // Track when user clicks away from game
        this.addHandler(document, 'mousedown', (e) => {
            const wrapper = this.getElement('#doomWrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                // Clicked outside game area
                if (status) status.classList.remove('active');
            }
        });

        // Handle window focus/blur for this app
        this.addHandler(window, 'blur', () => {
            if (status) status.classList.remove('active');
        });
    }

    focusGame() {
        const overlay = this.getElement('#doomOverlay');
        const frame = this.getElement('#doomFrame');
        const status = this.getElement('#doomStatus');

        // Hide overlay
        if (overlay) overlay.classList.add('hidden');
        
        // Show active status
        if (status) status.classList.add('active');

        // Focus the iframe
        if (frame) {
            frame.focus();
            
            // Some browsers need a click event forwarded
            try {
                frame.contentWindow.focus();
            } catch (e) {
                // Cross-origin restriction - iframe handles its own focus
            }
        }

        this.gameHasFocus = true;
        this.emitAppEvent('game:focused', {});
    }

    toggleFullscreen() {
        const wrapper = this.getElement('#doomWrapper');
        if (!wrapper) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            wrapper.requestFullscreen().catch(err => {
                console.warn('[DOOM] Fullscreen error:', err);
                // Try on the iframe directly
                const frame = this.getElement('#doomFrame');
                if (frame) {
                    frame.requestFullscreen().catch(() => {});
                }
            });
        }
    }

    onClose() {
        // Clear iframe to stop audio/processes
        const frame = this.getElement('#doomFrame');
        if (frame) {
            frame.src = 'about:blank';
        }
        this.gameHasFocus = false;
    }
}

export default Doom;