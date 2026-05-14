/**
 * Help System - Windows 95 Style Help Browser
 * Browse help topics with Windows 95 aesthetics
 */

import AppBase from './AppBase.js';
import AppRegistry from './AppRegistry.js';
import EventBus from '../core/EventBus.js';
import { getConfig } from '../core/ConfigLoader.js';
import { escapeHtml } from '../core/Sanitize.js';

class HelpSystem extends AppBase {
    constructor() {
        super({
            id: 'help',
            name: 'Help Topics',
            icon: '❓',
            width: 660,
            height: 520,
            minWidth: 520,
            minHeight: 400,
            resizable: true,
            singleton: true,
            category: 'systemtools'
        });

        this.currentTopic = 'welcome';
        this.history = [];
        this.historyIndex = -1;

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('navigateTo', (payload) => {
            if (!payload || !payload.topic) return { success: false, error: 'No topic provided' };
            this.navigateTo(payload.topic);
            this.emitAppEvent('navigated', { topic: payload.topic });
            return { success: true, topic: payload.topic };
        });

        this.registerCommand('goBack', () => {
            this.goBack();
            this.emitAppEvent('navigated', { topic: this.currentTopic, direction: 'back' });
            return { success: true };
        });

        this.registerCommand('goForward', () => {
            this.goForward();
            this.emitAppEvent('navigated', { topic: this.currentTopic, direction: 'forward' });
            return { success: true };
        });

        this.registerCommand('search', (payload) => {
            if (!payload || !payload.query) return { success: false, error: 'No query provided' };
            const searchInput = this.getElement('#helpSearch');
            if (searchInput) {
                searchInput.value = payload.query;
                searchInput.dispatchEvent(new Event('input'));
            }
            this.emitAppEvent('searched', { query: payload.query });
            return { success: true, query: payload.query };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getCurrentTopic', () => {
            return { topic: this.currentTopic };
        });

        this.registerQuery('getHistory', () => {
            return {
                history: [...this.history],
                historyIndex: this.historyIndex
            };
        });
    }

    onOpen() {
        return `
            <style>
                .help-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #c0c0c0;
                    font-size: 14px;
                }
                .help-toolbar {
                    display: flex;
                    gap: 2px;
                    padding: 4px;
                    background: #c0c0c0;
                    border-bottom: 2px groove #fff;
                }
                .help-toolbar-btn {
                    padding: 3px 8px;
                    background: #c0c0c0;
                    border: 2px outset #fff;
                    cursor: pointer;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .help-toolbar-btn:active:not(:disabled) {
                    border-style: inset;
                }
                .help-toolbar-btn:disabled {
                    color: #808080;
                    cursor: not-allowed;
                }
                .help-main {
                    flex: 1;
                    display: flex;
                    overflow: hidden;
                }
                .help-nav {
                    width: 200px;
                    background: white;
                    border-right: 2px groove #fff;
                    display: flex;
                    flex-direction: column;
                }
                .help-nav-tabs {
                    display: flex;
                    background: #c0c0c0;
                    border-bottom: 1px solid #808080;
                }
                .help-nav-tab {
                    padding: 4px 10px;
                    cursor: pointer;
                    font-size: 14px;
                    border: 1px solid transparent;
                }
                .help-nav-tab.active {
                    background: white;
                    border: 1px solid #808080;
                    border-bottom: 1px solid white;
                    margin-bottom: -1px;
                }
                .help-nav-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 5px;
                }
                .help-tree-item {
                    padding: 2px 5px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .help-tree-item:hover {
                    background: #e0e0ff;
                }
                .help-tree-item.selected {
                    background: #000080;
                    color: white;
                }
                .help-tree-item.expandable::before {
                    content: '📁';
                }
                .help-tree-item.expandable.expanded::before {
                    content: '📂';
                }
                .help-tree-item.topic::before {
                    content: '📄';
                }
                .help-tree-children {
                    margin-left: 15px;
                    display: none;
                }
                .help-tree-children.expanded {
                    display: block;
                }
                .help-content {
                    flex: 1;
                    background: white;
                    overflow-y: auto;
                    padding: 15px;
                    font-size: 14px;
                    line-height: 1.6;
                }
                .help-title {
                    font-size: 18px;
                    font-weight: bold;
                    color: #000080;
                    border-bottom: 1px solid #c0c0c0;
                    padding-bottom: 8px;
                    margin-bottom: 15px;
                }
                .help-section {
                    margin-bottom: 15px;
                }
                .help-section-title {
                    font-weight: bold;
                    color: #000080;
                    margin-bottom: 5px;
                }
                .help-list {
                    margin: 10px 0;
                    padding-left: 20px;
                }
                .help-list li {
                    margin-bottom: 5px;
                    line-height: 1.5;
                }
                .help-link {
                    color: #0000ff;
                    text-decoration: underline;
                    cursor: pointer;
                }
                .help-link:hover {
                    color: #ff0000;
                }
                .help-tip {
                    background: #ffffcc;
                    border: 1px solid #cccc00;
                    padding: 10px;
                    margin: 10px 0;
                }
                .help-tip-icon {
                    font-weight: bold;
                    color: #666600;
                }
                .help-shortcut {
                    font-family: monospace;
                    background: #e0e0e0;
                    padding: 2px 5px;
                    border: 1px solid #808080;
                }
                .help-status {
                    padding: 3px 8px;
                    background: #c0c0c0;
                    border-top: 2px groove #fff;
                    font-size: 13px;
                }
                .help-search {
                    padding: 5px;
                    border-bottom: 1px solid #c0c0c0;
                }
                .help-search input {
                    width: 100%;
                    padding: 3px;
                    border: 2px inset #fff;
                    font-size: 14px;
                }
            </style>

            <div class="help-container">
                <div class="help-toolbar">
                    <button class="help-toolbar-btn" id="btn-back" disabled>
                        <span>◀</span> Back
                    </button>
                    <button class="help-toolbar-btn" id="btn-forward" disabled>
                        Forward <span>▶</span>
                    </button>
                    <button class="help-toolbar-btn" id="btn-home">
                        <span>🏠</span> Home
                    </button>
                    <button class="help-toolbar-btn" id="btn-print">
                        <span>🖨️</span> Print
                    </button>
                </div>

                <div class="help-main">
                    <div class="help-nav">
                        <div class="help-nav-tabs">
                            <div class="help-nav-tab active" data-nav="contents">Contents</div>
                            <div class="help-nav-tab" data-nav="index">Index</div>
                            <div class="help-nav-tab" data-nav="search">Find</div>
                        </div>
                        <div class="help-search" style="display: none;" id="search-box">
                            <input type="text" placeholder="Type keyword..." id="help-search-input">
                        </div>
                        <div class="help-nav-content" id="nav-content">
                            ${this.renderNavTree()}
                        </div>
                    </div>

                    <div class="help-content" id="help-content">
                        ${this.getTopicContent('welcome')}
                    </div>
                </div>

                <div class="help-status" id="help-status">
                    Click a topic to view help
                </div>
            </div>
        `;
    }

    renderNavTree() {
        return `
            <div class="help-tree-item expandable expanded" data-topic="getting-started">
                Getting Started
            </div>
            <div class="help-tree-children expanded">
                <div class="help-tree-item topic" data-topic="welcome">Welcome to ${getConfig('branding.osName', 'IlluminatOS!')}</div>
                <div class="help-tree-item topic" data-topic="desktop">Using the Desktop</div>
                <div class="help-tree-item topic" data-topic="start-menu">The Start Menu</div>
                <div class="help-tree-item topic" data-topic="windows">Working with Windows</div>
            </div>

            <div class="help-tree-item expandable" data-topic="applications">
                Applications
            </div>
            <div class="help-tree-children">
                <div class="help-tree-item topic" data-topic="notepad">Notepad</div>
                <div class="help-tree-item topic" data-topic="paint">Paint</div>
                <div class="help-tree-item topic" data-topic="calculator">Calculator</div>
                <div class="help-tree-item topic" data-topic="terminal">Terminal</div>
                <div class="help-tree-item topic" data-topic="browser">Internet Explorer</div>
            </div>

            <div class="help-tree-item expandable" data-topic="games">
                Games
            </div>
            <div class="help-tree-children">
                <div class="help-tree-item topic" data-topic="minesweeper">Minesweeper</div>
                <div class="help-tree-item topic" data-topic="solitaire">Solitaire</div>
                <div class="help-tree-item topic" data-topic="snake">Snake</div>
                <div class="help-tree-item topic" data-topic="doom">DOOM</div>
                <div class="help-tree-item topic" data-topic="skifree">SkiFree</div>
            </div>

            <div class="help-tree-item expandable" data-topic="settings">
                Settings & Customization
            </div>
            <div class="help-tree-children">
                <div class="help-tree-item topic" data-topic="control-panel">Control Panel</div>
                <div class="help-tree-item topic" data-topic="display">Display Properties</div>
                <div class="help-tree-item topic" data-topic="sounds">Sound Settings</div>
            </div>

            <div class="help-tree-item expandable" data-topic="tips">
                Tips & Tricks
            </div>
            <div class="help-tree-children">
                <div class="help-tree-item topic" data-topic="shortcuts">Keyboard Shortcuts</div>
                <div class="help-tree-item topic" data-topic="easter-eggs">Easter Eggs</div>
                <div class="help-tree-item topic" data-topic="achievements">Achievements</div>
            </div>

            <div class="help-tree-item expandable" data-topic="troubleshooting">
                Troubleshooting
            </div>
            <div class="help-tree-children">
                <div class="help-tree-item topic" data-topic="common-issues">Common Issues</div>
                <div class="help-tree-item topic" data-topic="reset">Reset ${getConfig('branding.osName', 'IlluminatOS!')}</div>
            </div>
        `;
    }

    getTopicContent(topic) {
        const osName = getConfig('branding.osName', 'IlluminatOS!');
        const helpDesc = getConfig('branding.helpDescription', 'a nostalgic recreation of the Windows 95 experience in your web browser');
        const topics = {
            'welcome': `
                <div class="help-title">Welcome to ${osName}</div>
                <div class="help-section">
                    <p>Welcome to ${osName}, ${helpDesc}!</p>
                    <p>${osName} includes many of the classic features you remember:</p>
                    <ul class="help-list">
                        <li>Classic Start Menu navigation</li>
                        <li>Desktop icons and shortcuts</li>
                        <li>Window management (drag, resize, minimize, maximize)</li>
                        <li>Classic applications (Notepad, Paint, Calculator)</li>
                        <li>Retro games (Minesweeper, Solitaire, Snake, DOOM)</li>
                        <li>Customizable settings and themes</li>
                    </ul>
                </div>
                <div class="help-tip">
                    <span class="help-tip-icon">💡 Tip:</span> Try the Konami Code (↑↑↓↓←→←→BA) for a surprise!
                </div>
                <div class="help-section">
                    <div class="help-section-title">Getting Started</div>
                    <p>Click the <strong>Start</strong> button in the bottom-left corner to access programs and settings.</p>
                    <p>Double-click desktop icons to open applications.</p>
                    <p>Right-click anywhere for context menus with additional options.</p>
                </div>
            `,
            'desktop': `
                <div class="help-title">Using the Desktop</div>
                <div class="help-section">
                    <p>The desktop is your main workspace in ${osName}. Here you can:</p>
                    <ul class="help-list">
                        <li><strong>Double-click icons</strong> to open applications</li>
                        <li><strong>Right-click</strong> for context menus</li>
                        <li><strong>Drag icons</strong> to rearrange them</li>
                        <li><strong>Select multiple items</strong> by clicking and dragging</li>
                    </ul>
                </div>
                <div class="help-section">
                    <div class="help-section-title">Desktop Icons</div>
                    <p>Common desktop icons include:</p>
                    <ul class="help-list">
                        <li>💻 <strong>My Computer</strong> - Browse files and drives</li>
                        <li>🗑️ <strong>Recycle Bin</strong> - Deleted files</li>
                        <li>📄 <strong>My Documents</strong> - Your personal files</li>
                    </ul>
                </div>
            `,
            'start-menu': `
                <div class="help-title">The Start Menu</div>
                <div class="help-section">
                    <p>Click the <strong>Start</strong> button to access all programs and system features.</p>
                    <div class="help-section-title">Start Menu Sections</div>
                    <ul class="help-list">
                        <li><strong>Programs</strong> - All installed applications</li>
                        <li><strong>Documents</strong> - Recently opened files</li>
                        <li><strong>Settings</strong> - System configuration</li>
                        <li><strong>Find</strong> - Search for files</li>
                        <li><strong>Help</strong> - This help system</li>
                        <li><strong>Run</strong> - Open programs by name</li>
                        <li><strong>Shut Down</strong> - End your session</li>
                    </ul>
                </div>
                <div class="help-tip">
                    <span class="help-tip-icon">💡 Tip:</span> Press <span class="help-shortcut">Ctrl+R</span> to quickly open the Run dialog.
                </div>
            `,
            'windows': `
                <div class="help-title">Working with Windows</div>
                <div class="help-section">
                    <div class="help-section-title">Window Controls</div>
                    <p>Each window has three buttons in the title bar:</p>
                    <ul class="help-list">
                        <li><strong>_ (Minimize)</strong> - Hide window to taskbar</li>
                        <li><strong>□ (Maximize)</strong> - Fill the screen</li>
                        <li><strong>X (Close)</strong> - Close the window</li>
                    </ul>
                </div>
                <div class="help-section">
                    <div class="help-section-title">Moving & Resizing</div>
                    <ul class="help-list">
                        <li>Drag the <strong>title bar</strong> to move a window</li>
                        <li>Drag any <strong>edge or corner</strong> to resize</li>
                        <li><strong>Double-click</strong> the title bar to maximize/restore</li>
                    </ul>
                </div>
            `,
            'shortcuts': `
                <div class="help-title">Keyboard Shortcuts</div>
                <div class="help-section">
                    <div class="help-section-title">System Shortcuts</div>
                    <ul class="help-list">
                        <li><span class="help-shortcut">Ctrl+R</span> - Open Run dialog</li>
                        <li><span class="help-shortcut">Ctrl+S</span> - Save (in apps that support it)</li>
                        <li><span class="help-shortcut">Ctrl+O</span> - Open (in apps that support it)</li>
                        <li><span class="help-shortcut">Ctrl+N</span> - New (in apps that support it)</li>
                        <li><span class="help-shortcut">Ctrl+Z</span> - Undo</li>
                        <li><span class="help-shortcut">Ctrl+Y</span> - Redo</li>
                    </ul>
                </div>
                <div class="help-section">
                    <div class="help-section-title">Window Shortcuts</div>
                    <ul class="help-list">
                        <li><span class="help-shortcut">Alt+F4</span> - Close active window</li>
                        <li><span class="help-shortcut">Alt+Tab</span> - Switch between windows</li>
                    </ul>
                </div>
            `,
            'easter-eggs': `
                <div class="help-title">Easter Eggs & Secrets</div>
                <div class="help-section">
                    <p>${osName} is full of hidden surprises! Here are some hints:</p>
                    <ul class="help-list">
                        <li>Try the <strong>Konami Code</strong>: ↑↑↓↓←→←→BA</li>
                        <li>Click the <strong>clock</strong> in the taskbar... a lot!</li>
                        <li>Type <strong>"rosebud"</strong> somewhere special</li>
                        <li>Check the <strong>Terminal</strong> for secret commands</li>
                        <li>Let the computer <strong>sit idle</strong> for a while</li>
                        <li>Look for <strong>Clippy</strong> - he might have advice!</li>
                    </ul>
                </div>
                <div class="help-tip">
                    <span class="help-tip-icon">💡 Tip:</span> Finding easter eggs can unlock achievements!
                </div>
            `,
            'achievements': `
                <div class="help-title">Achievements</div>
                <div class="help-section">
                    <p>${osName} has a hidden achievement system. Unlock achievements by:</p>
                    <ul class="help-list">
                        <li>Using various applications</li>
                        <li>Playing games</li>
                        <li>Finding easter eggs</li>
                        <li>Exploring the system</li>
                        <li>Customizing your experience</li>
                    </ul>
                </div>
                <div class="help-section">
                    <div class="help-section-title">Viewing Achievements</div>
                    <p>Check your achievements in the <span class="help-link" data-app="controlpanel">Control Panel</span> under System Information.</p>
                </div>
            `,
            'common-issues': `
                <div class="help-title">Common Issues</div>
                <div class="help-section">
                    <div class="help-section-title">Sound not working?</div>
                    <p>Make sure sounds are enabled in <span class="help-link" data-app="controlpanel">Control Panel</span> or <span class="help-link" data-app="sounds">Sound Settings</span>.</p>
                </div>
                <div class="help-section">
                    <div class="help-section-title">Window stuck or not responding?</div>
                    <p>Use the <span class="help-link" data-app="taskmgr">Task Manager</span> (Ctrl+Alt+Delete... just kidding, find it in Programs > System Tools) to end unresponsive tasks.</p>
                </div>
                <div class="help-section">
                    <div class="help-section-title">Lost your files?</div>
                    <p>Use <span class="help-link" data-app="find">Find Files</span> to search for lost documents.</p>
                </div>
            `,
            'reset': `
                <div class="help-title">Reset ${osName}</div>
                <div class="help-section">
                    <p>If you need to start fresh, you can reset ${osName} to its default settings.</p>
                    <div class="help-tip">
                        <span class="help-tip-icon">⚠️ Warning:</span> This will delete all your files, settings, and achievements!
                    </div>
                    <p>To reset:</p>
                    <ol class="help-list">
                        <li>Open <span class="help-link" data-app="controlpanel">Control Panel</span></li>
                        <li>Scroll to "Advanced Options"</li>
                        <li>Click "Reset" button</li>
                        <li>Confirm your decision</li>
                    </ol>
                </div>
            `,
            'notepad': `
                <div class="help-title">Notepad</div>
                <div class="help-section">
                    <p>Notepad is a simple text editor for creating and editing plain text files.</p>
                    <div class="help-section-title">Features</div>
                    <ul class="help-list">
                        <li>Create new text files</li>
                        <li>Open and edit existing files</li>
                        <li>Save files to My Documents</li>
                        <li>Word wrap toggle</li>
                    </ul>
                </div>
                <div class="help-section">
                    <div class="help-section-title">Keyboard Shortcuts</div>
                    <ul class="help-list">
                        <li><span class="help-shortcut">Ctrl+N</span> - New file</li>
                        <li><span class="help-shortcut">Ctrl+O</span> - Open file</li>
                        <li><span class="help-shortcut">Ctrl+S</span> - Save file</li>
                    </ul>
                </div>
            `,
            'paint': `
                <div class="help-title">Paint</div>
                <div class="help-section">
                    <p>Paint is a graphics editor for creating and editing images.</p>
                    <div class="help-section-title">Tools</div>
                    <ul class="help-list">
                        <li><strong>Pencil</strong> - Free draw</li>
                        <li><strong>Brush</strong> - Larger strokes</li>
                        <li><strong>Eraser</strong> - Erase to background color</li>
                        <li><strong>Fill</strong> - Fill areas with color</li>
                        <li><strong>Shapes</strong> - Draw rectangles and ellipses</li>
                        <li><strong>Text</strong> - Add text to image</li>
                        <li><strong>Eyedropper</strong> - Pick color from image</li>
                    </ul>
                </div>
            `,
            'minesweeper': `
                <div class="help-title">Minesweeper</div>
                <div class="help-section">
                    <p>Classic puzzle game - find all the mines without detonating them!</p>
                    <div class="help-section-title">How to Play</div>
                    <ul class="help-list">
                        <li><strong>Left-click</strong> to reveal a square</li>
                        <li><strong>Right-click</strong> to place a flag</li>
                        <li>Numbers show how many adjacent mines</li>
                        <li>Clear all non-mine squares to win!</li>
                    </ul>
                </div>
                <div class="help-tip">
                    <span class="help-tip-icon">💡 Tip:</span> Start with corners and edges - they have fewer adjacent squares!
                </div>
            `,
            'calculator': `
                <div class="help-title">Calculator</div>
                <div class="help-section">
                    <p>A standard calculator for basic mathematical operations.</p>
                    <div class="help-section-title">Operations</div>
                    <ul class="help-list">
                        <li><strong>+</strong> Addition</li>
                        <li><strong>-</strong> Subtraction</li>
                        <li><strong>×</strong> Multiplication</li>
                        <li><strong>÷</strong> Division</li>
                        <li><strong>%</strong> Percentage</li>
                        <li><strong>√</strong> Square root</li>
                    </ul>
                </div>
            `,
            'terminal': `
                <div class="help-title">Terminal</div>
                <div class="help-section">
                    <p>Command-line interface for advanced operations.</p>
                    <div class="help-section-title">Commands</div>
                    <ul class="help-list">
                        <li><span class="help-shortcut">help</span> - Show available commands</li>
                        <li><span class="help-shortcut">dir</span> - List directory contents</li>
                        <li><span class="help-shortcut">cd</span> - Change directory</li>
                        <li><span class="help-shortcut">type</span> - Display file contents</li>
                        <li><span class="help-shortcut">clear</span> - Clear screen</li>
                    </ul>
                </div>
                <div class="help-tip">
                    <span class="help-tip-icon">💡 Tip:</span> Try typing some unusual commands for surprises!
                </div>
            `,
            'control-panel': `
                <div class="help-title">Control Panel</div>
                <div class="help-section">
                    <p>The Control Panel lets you customize ${osName} settings.</p>
                    <div class="help-section-title">Settings Available</div>
                    <ul class="help-list">
                        <li><strong>Display</strong> - Background color, CRT effect</li>
                        <li><strong>Sound</strong> - Enable/disable system sounds</li>
                        <li><strong>Desktop Pet</strong> - Choose your companion</li>
                        <li><strong>Screensaver</strong> - Configure idle settings</li>
                        <li><strong>Advanced</strong> - Reset, export/import settings</li>
                    </ul>
                </div>
            `,
            'browser': `
                <div class="help-title">Internet Explorer</div>
                <div class="help-section">
                    <p>Browse the web with our retro-styled browser!</p>
                    <div class="help-section-title">Features</div>
                    <ul class="help-list">
                        <li>Enter URLs in the address bar</li>
                        <li>Click links to navigate</li>
                        <li>Use Back/Forward buttons</li>
                        <li>Refresh pages</li>
                    </ul>
                </div>
                <div class="help-tip">
                    <span class="help-tip-icon">⚠️ Note:</span> Some websites may not display correctly due to cross-origin restrictions.
                </div>
            `,
            'solitaire': `<div class="help-title">Solitaire</div><div class="help-section"><p>Classic card game. Move all cards to foundation piles in order (A to K) by suit.</p></div>`,
            'snake': `<div class="help-title">Snake</div><div class="help-section"><p>Guide the snake to eat food and grow longer. Don't hit walls or yourself!</p></div>`,
            'doom': `<div class="help-title">DOOM</div><div class="help-section"><p>Experience the classic FPS. Use WASD to move, mouse to aim, click to shoot!</p></div>`,
            'skifree': `<div class="help-title">SkiFree</div><div class="help-section"><p>Ski down the mountain, avoid obstacles, and watch out for the Yeti!</p></div>`,
            'display': `<div class="help-title">Display Properties</div><div class="help-section"><p>Customize your desktop appearance including background color, screensaver, and visual effects.</p></div>`,
            'sounds': `<div class="help-title">Sound Settings</div><div class="help-section"><p>Configure system sounds, volume levels, and audio devices.</p></div>`
        };

        return topics[topic] || `
            <div class="help-title">Topic Not Found</div>
            <div class="help-section">
                <p>Sorry, this help topic is not available yet.</p>
                <p><span class="help-link" data-topic="welcome">Return to Welcome</span></p>
            </div>
        `;
    }

    onMount() {
        // Toolbar buttons
        this.addHandler(this.getElement('#btn-back'), 'click', () => this.goBack());
        this.addHandler(this.getElement('#btn-forward'), 'click', () => this.goForward());
        this.addHandler(this.getElement('#btn-home'), 'click', () => this.navigateTo('welcome'));
        this.addHandler(this.getElement('#btn-print'), 'click', () => this.print());

        // Nav tabs
        const navTabs = this.getElements('.help-nav-tab');
        navTabs.forEach(tab => {
            this.addHandler(tab, 'click', () => {
                navTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const searchBox = this.getElement('#search-box');
                if (tab.dataset.nav === 'search') {
                    searchBox.style.display = 'block';
                } else {
                    searchBox.style.display = 'none';
                }
            });
        });

        // Tree items
        const treeItems = this.getElements('.help-tree-item');
        treeItems.forEach(item => {
            this.addHandler(item, 'click', () => {
                // Toggle expandable items
                if (item.classList.contains('expandable')) {
                    item.classList.toggle('expanded');
                    const children = item.nextElementSibling;
                    if (children && children.classList.contains('help-tree-children')) {
                        children.classList.toggle('expanded');
                    }
                }

                // Navigate to topic
                const topic = item.dataset.topic;
                if (topic && item.classList.contains('topic')) {
                    treeItems.forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    this.navigateTo(topic);
                }
            });
        });

        // Content links
        this.setupContentLinks();
    }

    setupContentLinks() {
        const content = this.getElement('#help-content');
        if (!content) return;

        // Topic links
        content.querySelectorAll('.help-link[data-topic]').forEach(link => {
            link.addEventListener('click', () => {
                this.navigateTo(link.dataset.topic);
            });
        });

        // App links
        content.querySelectorAll('.help-link[data-app]').forEach(link => {
            link.addEventListener('click', () => {
                AppRegistry.launch(link.dataset.app);
            });
        });
    }

    navigateTo(topic, addToHistory = true) {
        const previousTopic = this.currentTopic;

        if (addToHistory && this.currentTopic !== topic) {
            // Trim forward history when navigating
            if (this.historyIndex < this.history.length - 1) {
                this.history = this.history.slice(0, this.historyIndex + 1);
            }
            this.history.push(topic);
            this.historyIndex = this.history.length - 1;
            this.playSound('click');
        }

        this.currentTopic = topic;

        // Emit topic changed event
        this.emitAppEvent('topic:changed', {
            topic: topic,
            previousTopic: previousTopic
        });

        const content = this.getElement('#help-content');
        if (content) {
            content.innerHTML = this.getTopicContent(topic);
            content.scrollTop = 0;
            this.setupContentLinks();
        }

        // Update nav selection
        const treeItems = this.getElements('.help-tree-item');
        treeItems.forEach(item => {
            item.classList.toggle('selected', item.dataset.topic === topic);
        });

        // Update status
        const status = this.getElement('#help-status');
        if (status) {
            status.textContent = `Viewing: ${topic.replace(/-/g, ' ')}`;
        }

        this.updateNavButtons();
    }

    goBack() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.navigateTo(this.history[this.historyIndex], false);
        }
    }

    goForward() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.navigateTo(this.history[this.historyIndex], false);
        }
    }

    updateNavButtons() {
        const backBtn = this.getElement('#btn-back');
        const fwdBtn = this.getElement('#btn-forward');

        if (backBtn) backBtn.disabled = this.historyIndex <= 0;
        if (fwdBtn) fwdBtn.disabled = this.historyIndex >= this.history.length - 1;
    }

    print() {
        const content = this.getElement('#help-content');
        if (content) {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head><title>${escapeHtml(getConfig('branding.osName', 'IlluminatOS!'))} Help - ${escapeHtml(this.currentTopic)}</title></head>
                <body style="font-family: 'MS Sans Serif', Arial, sans-serif; padding: 20px;">
                    ${content.innerHTML}
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
        }
    }
}

export default HelpSystem;
