/**
 * SystemDialogs - Windows 95 style system dialogs
 * Run Dialog, Shutdown Dialog, About Dialog, Welcome Tips
 * Alert, Confirm, Prompt, File Open/Save dialogs
 *
 * Now extends FeatureBase for integration with FeatureRegistry
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import WindowManager from '../core/WindowManager.js';
import AppRegistry from '../apps/AppRegistry.js';
import FileSystemManager from '../core/FileSystemManager.js';
import { PATHS } from '../core/Constants.js';
import { getConfig } from '../core/ConfigLoader.js';
import LoginScreen from '../core/LoginScreen.js';
import SessionManager from '../core/SessionManager.js';
import { escapeHtml } from '../core/Sanitize.js';

// Feature metadata
const FEATURE_METADATA = {
    id: 'systemdialogs',
    name: 'System Dialogs',
    description: 'Windows 95 style dialogs - Run, Shutdown, File Open/Save, Alerts, and more',
    icon: '💬',
    category: 'core',
    dependencies: [],
    config: {
        defaultPath: ['C:', 'Users', 'User', 'Documents'],
        showHiddenFiles: false,
        playDialogSounds: true,
        showWelcomeOnBoot: true
    },
    settings: [
        {
            key: 'playDialogSounds',
            label: 'Play Dialog Sounds',
            type: 'checkbox'
        },
        {
            key: 'showHiddenFiles',
            label: 'Show Hidden Files in File Dialogs',
            type: 'checkbox'
        },
        {
            key: 'showWelcomeOnBoot',
            label: 'Show Welcome Dialog on Boot',
            type: 'checkbox'
        }
    ]
};

class SystemDialogs extends FeatureBase {
    constructor() {
        super(FEATURE_METADATA);

        this.runDialogOpen = false;
        this.shutdownDialogOpen = false;

        // Promise resolvers for async dialogs
        this.alertResolver = null;
        this.confirmResolver = null;
        this.promptResolver = null;
        this.fileDialogResolver = null;
        this.currentFilePath = [...PATHS.DOCUMENTS];
    }

    /**
     * Initialize system dialogs
     */
    async initialize() {
        if (!this.isEnabled()) return;
        // Create dialog containers
        this.createDialogContainers();

        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();

        // Listen for app launches
        this.subscribe('app:open', ({ appId }) => {
            if (appId === 'run') this.showRunDialog();
            if (appId === 'shutdown') this.showShutdownDialog();
            if (appId === 'help') this.showAboutDialog();
        });

        // Listen for dialog requests via EventBus
        this.subscribe('dialog:alert', (options) => this.showAlert(options));
        this.subscribe('dialog:confirm', (options) => this.showConfirm(options));
        this.subscribe('dialog:prompt', (options) => this.showPrompt(options));
        this.subscribe('dialog:file-open', (options) => this.showFileOpen(options));
        this.subscribe('dialog:file-save', (options) => this.showFileSave(options));

        // Show welcome on first visit
        this.subscribe(Events.BOOT_COMPLETE, () => {
            setTimeout(() => {
                if (this.getConfig('showWelcomeOnBoot', true)) {
                    this.showWelcomeDialog();
                } else {
                    // Some startup scripts wait for welcome dismissal before launching UI.
                    // If welcome is disabled, emit a synthetic dismissal so startup can continue.
                    EventBus.emit('dialog:welcome:dismissed', { timestamp: Date.now(), skipped: true });
                }
            }, 1000);
        });

        this.log('Initialized');
    }

    /**
     * Cleanup when disabled
     */
    cleanup() {
        // Remove dialog containers
        ['runDialog', 'shutdownDialog', 'aboutDialog', 'welcomeDialog',
         'alertDialog', 'confirmDialog', 'promptDialog', 'fileDialog'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        super.cleanup();
    }

    /**
     * Create dialog containers in the DOM
     */
    createDialogContainers() {
        // Run Dialog
        const runDialog = document.createElement('div');
        runDialog.id = 'runDialog';
        runDialog.className = 'system-dialog-overlay';
        runDialog.innerHTML = `
            <div class="system-dialog run-dialog">
                <div class="dialog-titlebar">
                    <span class="dialog-title-icon">▶️</span>
                    <span>Run</span>
                    <button class="dialog-close-btn">×</button>
                </div>
                <div class="dialog-body">
                    <div class="run-dialog-content">
                        <div class="run-icon">🖥️</div>
                        <div class="run-text">
                            <p>${getConfig('branding.runDialogPrompt', 'Type the name of a program, folder, document, or Internet resource, and the OS will open it for you.')}</p>
                            <div class="run-input-group">
                                <label for="runInput">Open:</label>
                                <input type="text" id="runInput" class="run-input" placeholder="notepad" autocomplete="off">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn" id="runOkBtn">OK</button>
                    <button class="btn" id="runCancelBtn">Cancel</button>
                    <button class="btn" id="runBrowseBtn">Browse...</button>
                </div>
            </div>
        `;
        document.body.appendChild(runDialog);

        // Shutdown Dialog
        const shutdownDialog = document.createElement('div');
        shutdownDialog.id = 'shutdownDialog';
        shutdownDialog.className = 'system-dialog-overlay';
        shutdownDialog.innerHTML = `
            <div class="system-dialog shutdown-dialog">
                <div class="dialog-titlebar">
                    <span class="dialog-title-icon">⏻</span>
                    <span>${getConfig('branding.shutdownDialogTitle', 'Shut Down Windows')}</span>
                    <button class="dialog-close-btn">×</button>
                </div>
                <div class="dialog-body">
                    <div class="shutdown-content">
                        <div class="shutdown-icon">💻</div>
                        <div class="shutdown-text">
                            <p>${getConfig('branding.shutdownDialogPrompt', 'What do you want the computer to do?')}</p>
                            <div class="shutdown-options">
                                <label class="shutdown-option">
                                    <input type="radio" name="shutdownOption" value="shutdown" checked>
                                    <span class="option-icon">⏻</span>
                                    <span>Shut down</span>
                                </label>
                                <label class="shutdown-option">
                                    <input type="radio" name="shutdownOption" value="restart">
                                    <span class="option-icon">🔄</span>
                                    <span>Restart</span>
                                </label>
                                <label class="shutdown-option">
                                    <input type="radio" name="shutdownOption" value="logoff">
                                    <span class="option-icon">👤</span>
                                    <span>Log off</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-primary" id="shutdownOkBtn">OK</button>
                    <button class="btn" id="shutdownCancelBtn">Cancel</button>
                    <button class="btn" id="shutdownHelpBtn">Help</button>
                </div>
            </div>
        `;
        document.body.appendChild(shutdownDialog);

        // About Dialog
        const aboutDialog = document.createElement('div');
        aboutDialog.id = 'aboutDialog';
        aboutDialog.className = 'system-dialog-overlay';
        const osName = getConfig('branding.osName', 'IlluminatOS!');
        const version = getConfig('branding.version', '95.0');
        const buildNumber = getConfig('branding.buildNumber', '1995');
        const aboutSubtitle = getConfig('branding.aboutSubtitle', 'Windows 95 Experience');
        const copyrightText = getConfig('branding.copyrightText', 'Copyright \u00a9 2024');
        const tagline = getConfig('branding.tagline', 'Made with nostalgia and JavaScript');

        aboutDialog.innerHTML = `
            <div class="system-dialog about-dialog">
                <div class="dialog-titlebar">
                    <span class="dialog-title-icon">ℹ️</span>
                    <span>About ${osName}</span>
                    <button class="dialog-close-btn">×</button>
                </div>
                <div class="dialog-body">
                    <div class="about-content">
                        <div class="about-logo">
                            <div class="about-logo-text">${osName}</div>
                            <div class="about-logo-subtitle">${aboutSubtitle}</div>
                        </div>
                        <div class="about-info">
                            <p><strong>${osName}</strong></p>
                            <p>Version ${version} Build ${buildNumber}</p>
                            <p>${copyrightText}</p>
                            <div class="about-divider"></div>
                            <p class="about-specs">
                                <span>Memory: 640KB (That's all you'll ever need)</span>
                                <span>Disk Space: ∞ (It's just localStorage)</span>
                                <span>Processor: Your Browser</span>
                            </p>
                            <div class="about-divider"></div>
                            <p class="about-credits">
                                ${tagline}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-primary" id="aboutOkBtn">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(aboutDialog);

        // Welcome Dialog
        const welcomeDialog = document.createElement('div');
        welcomeDialog.id = 'welcomeDialog';
        welcomeDialog.className = 'system-dialog-overlay';
        const welcomeTips = getConfig('welcomeTips.items', [
            'Double-click desktop icons to open applications',
            'Right-click anywhere for context menus',
            'Try the Konami Code for a surprise! ↑↑↓↓←→←→BA',
            'Click the clock 10 times for disco mode!',
            'Type "rosebud" to unlock admin access',
            'Check out the Terminal for Easter eggs'
        ]);
        const safeWelcomeTips = Array.isArray(welcomeTips)
            ? welcomeTips.filter(tip => typeof tip === 'string' && tip.trim())
            : [];

        welcomeDialog.innerHTML = `
            <div class="system-dialog welcome-dialog">
                <div class="dialog-titlebar">
                    <span class="dialog-title-icon">🎉</span>
                    <span>${escapeHtml(getConfig('branding.welcomeTitle', 'Welcome to ' + getConfig('branding.osName', 'IlluminatOS!')))}</span>
                    <button class="dialog-close-btn">×</button>
                </div>
                <div class="dialog-body">
                    <div class="welcome-content">
                        <div class="welcome-banner">
                            <div class="welcome-logo">${escapeHtml(getConfig('branding.osName', 'IlluminatOS!'))}</div>
                        </div>
                        <div class="welcome-tips">
                            <h3>${escapeHtml(getConfig('welcomeTips.headingIcon', '\uD83D\uDCA1'))} ${escapeHtml(getConfig('welcomeTips.heading', 'Did you know?'))}</h3>
                            <ul class="tips-list">
                                ${safeWelcomeTips.map(tip => `<li>${escapeHtml(tip)}</li>`).join('\n                                ')}
                            </ul>
                        </div>
                        <div class="welcome-checkbox">
                            <label>
                                <input type="checkbox" id="welcomeShowAgain">
                                Show this dialog at startup
                            </label>
                        </div>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-primary" id="welcomeOkBtn">${escapeHtml(getConfig('branding.welcomeButtonText', "Let's Go!"))}</button>
                </div>
            </div>
        `;
        document.body.appendChild(welcomeDialog);

        // Alert Dialog (replaces browser alert)
        const alertDialog = document.createElement('div');
        alertDialog.id = 'alertDialog';
        alertDialog.className = 'system-dialog-overlay';
        alertDialog.innerHTML = `
            <div class="system-dialog alert-dialog">
                <div class="dialog-titlebar">
                    <span class="dialog-title-icon" id="alertIcon">ℹ️</span>
                    <span id="alertTitle">Message</span>
                    <button class="dialog-close-btn">×</button>
                </div>
                <div class="dialog-body">
                    <div class="alert-content">
                        <div class="alert-icon" id="alertIconLarge">ℹ️</div>
                        <div class="alert-message" id="alertMessage">Message text here</div>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-primary" id="alertOkBtn">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(alertDialog);

        // Confirm Dialog (replaces browser confirm)
        const confirmDialog = document.createElement('div');
        confirmDialog.id = 'confirmDialog';
        confirmDialog.className = 'system-dialog-overlay';
        confirmDialog.innerHTML = `
            <div class="system-dialog confirm-dialog">
                <div class="dialog-titlebar">
                    <span class="dialog-title-icon">❓</span>
                    <span id="confirmTitle">Confirm</span>
                    <button class="dialog-close-btn">×</button>
                </div>
                <div class="dialog-body">
                    <div class="confirm-content">
                        <div class="confirm-icon">❓</div>
                        <div class="confirm-message" id="confirmMessage">Are you sure?</div>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-primary" id="confirmYesBtn">Yes</button>
                    <button class="btn" id="confirmNoBtn">No</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmDialog);

        // Prompt Dialog (replaces browser prompt)
        const promptDialog = document.createElement('div');
        promptDialog.id = 'promptDialog';
        promptDialog.className = 'system-dialog-overlay';
        promptDialog.innerHTML = `
            <div class="system-dialog prompt-dialog">
                <div class="dialog-titlebar">
                    <span class="dialog-title-icon">✏️</span>
                    <span id="promptTitle">Input</span>
                    <button class="dialog-close-btn">×</button>
                </div>
                <div class="dialog-body">
                    <div class="prompt-content">
                        <div class="prompt-message" id="promptMessage">Enter a value:</div>
                        <input type="text" class="prompt-input" id="promptInput" autocomplete="off">
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-primary" id="promptOkBtn">OK</button>
                    <button class="btn" id="promptCancelBtn">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(promptDialog);

        // File Dialog (Open/Save)
        const fileDialog = document.createElement('div');
        fileDialog.id = 'fileDialog';
        fileDialog.className = 'system-dialog-overlay';
        fileDialog.innerHTML = `
            <div class="system-dialog file-dialog">
                <div class="dialog-titlebar">
                    <span class="dialog-title-icon" id="fileDialogIcon">📂</span>
                    <span id="fileDialogTitle">Open</span>
                    <button class="dialog-close-btn">×</button>
                </div>
                <div class="dialog-body">
                    <div class="file-dialog-content">
                        <div class="file-dialog-toolbar">
                            <label>Look in:</label>
                            <select class="file-dialog-path" id="fileDialogPathSelect">
                                <option value="C:">💾 Local Disk (C:)</option>
                            </select>
                            <button class="file-dialog-btn" id="fileDialogUp" title="Up one level">⬆️</button>
                            <button class="file-dialog-btn" id="fileDialogNewFolder" title="Create new folder">📁+</button>
                        </div>
                        <div class="file-dialog-browser" id="fileDialogBrowser">
                            <!-- Files will be listed here -->
                        </div>
                        <div class="file-dialog-footer">
                            <div class="file-dialog-filename-row">
                                <label>File name:</label>
                                <input type="text" class="file-dialog-filename" id="fileDialogFilename" autocomplete="off">
                            </div>
                            <div class="file-dialog-filetype-row">
                                <label>Files of type:</label>
                                <select class="file-dialog-filetype" id="fileDialogFiletype">
                                    <option value="*">All Files (*.*)</option>
                                    <option value="txt">Text Files (*.txt)</option>
                                    <option value="retro">RetroScript (*.retro)</option>
                                    <option value="bat">Batch Files (*.bat)</option>
                                    <option value="md">Markdown (*.md)</option>
                                    <option value="js">JavaScript (*.js)</option>
                                    <option value="css">Stylesheets (*.css)</option>
                                    <option value="html">HTML Files (*.html)</option>
                                    <option value="json">JSON Files (*.json)</option>
                                    <option value="log">Log Files (*.log)</option>
                                    <option value="png">PNG Images (*.png)</option>
                                    <option value="bmp">BMP Images (*.bmp)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-primary" id="fileDialogOkBtn">Open</button>
                    <button class="btn" id="fileDialogCancelBtn">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(fileDialog);

        // Attach event handlers
        this.attachEventHandlers();
    }

    /**
     * Attach event handlers to dialogs
     */
    attachEventHandlers() {
        // Run Dialog handlers
        const runDialog = document.getElementById('runDialog');
        const runInput = document.getElementById('runInput');
        const runOkBtn = document.getElementById('runOkBtn');
        const runCancelBtn = document.getElementById('runCancelBtn');
        const runBrowseBtn = document.getElementById('runBrowseBtn');

        if (runOkBtn) this.addHandler(runOkBtn, 'click', () => this.executeRunCommand());
        if (runCancelBtn) this.addHandler(runCancelBtn, 'click', () => this.hideRunDialog());
        if (runBrowseBtn) this.addHandler(runBrowseBtn, 'click', () => {
            AppRegistry.launch('mycomputer');
            this.hideRunDialog();
        });
        if (runInput) this.addHandler(runInput, 'keydown', (e) => {
            if (e.key === 'Enter') this.executeRunCommand();
            if (e.key === 'Escape') this.hideRunDialog();
        });
        const runCloseBtn = runDialog?.querySelector('.dialog-close-btn');
        if (runCloseBtn) this.addHandler(runCloseBtn, 'click', () => this.hideRunDialog());
        if (runDialog) this.addHandler(runDialog, 'click', (e) => {
            if (e.target === runDialog) this.hideRunDialog();
        });

        // Shutdown Dialog handlers
        const shutdownDialog = document.getElementById('shutdownDialog');
        const shutdownOkBtn = document.getElementById('shutdownOkBtn');
        const shutdownCancelBtn = document.getElementById('shutdownCancelBtn');
        const shutdownHelpBtn = document.getElementById('shutdownHelpBtn');

        if (shutdownOkBtn) this.addHandler(shutdownOkBtn, 'click', () => this.executeShutdown());
        if (shutdownCancelBtn) this.addHandler(shutdownCancelBtn, 'click', () => this.hideShutdownDialog());
        if (shutdownHelpBtn) this.addHandler(shutdownHelpBtn, 'click', () => {
            this.hideShutdownDialog();
            this.showAboutDialog();
        });
        const shutdownCloseBtn = shutdownDialog?.querySelector('.dialog-close-btn');
        if (shutdownCloseBtn) this.addHandler(shutdownCloseBtn, 'click', () => this.hideShutdownDialog());
        if (shutdownDialog) this.addHandler(shutdownDialog, 'click', (e) => {
            if (e.target === shutdownDialog) this.hideShutdownDialog();
        });

        // About Dialog handlers
        const aboutDialog = document.getElementById('aboutDialog');
        const aboutOkBtn = document.getElementById('aboutOkBtn');

        if (aboutOkBtn) this.addHandler(aboutOkBtn, 'click', () => this.hideAboutDialog());
        const aboutCloseBtn = aboutDialog?.querySelector('.dialog-close-btn');
        if (aboutCloseBtn) this.addHandler(aboutCloseBtn, 'click', () => this.hideAboutDialog());
        if (aboutDialog) this.addHandler(aboutDialog, 'click', (e) => {
            if (e.target === aboutDialog) this.hideAboutDialog();
        });

        // Welcome Dialog handlers
        const welcomeDialog = document.getElementById('welcomeDialog');
        const welcomeOkBtn = document.getElementById('welcomeOkBtn');
        const welcomeShowAgain = document.getElementById('welcomeShowAgain');

        if (welcomeShowAgain) {
            welcomeShowAgain.checked = this.getConfig('showWelcomeOnBoot', true);
        }

        if (welcomeOkBtn) this.addHandler(welcomeOkBtn, 'click', () => {
            this.setConfig('showWelcomeOnBoot', !!welcomeShowAgain?.checked);
            this.hideWelcomeDialog();
        });
        const welcomeCloseBtn = welcomeDialog?.querySelector('.dialog-close-btn');
        if (welcomeCloseBtn) this.addHandler(welcomeCloseBtn, 'click', () => this.hideWelcomeDialog());

        // Alert Dialog handlers
        const alertDialog = document.getElementById('alertDialog');
        const alertOkBtn = document.getElementById('alertOkBtn');

        if (alertOkBtn) this.addHandler(alertOkBtn, 'click', () => this.resolveAlert());
        const alertCloseBtn = alertDialog?.querySelector('.dialog-close-btn');
        if (alertCloseBtn) this.addHandler(alertCloseBtn, 'click', () => this.resolveAlert());
        if (alertDialog) this.addHandler(alertDialog, 'click', (e) => {
            if (e.target === alertDialog) this.resolveAlert();
        });

        // Confirm Dialog handlers
        const confirmDialog = document.getElementById('confirmDialog');
        const confirmYesBtn = document.getElementById('confirmYesBtn');
        const confirmNoBtn = document.getElementById('confirmNoBtn');

        if (confirmYesBtn) this.addHandler(confirmYesBtn, 'click', () => this.resolveConfirm(true));
        if (confirmNoBtn) this.addHandler(confirmNoBtn, 'click', () => this.resolveConfirm(false));
        const confirmCloseBtn = confirmDialog?.querySelector('.dialog-close-btn');
        if (confirmCloseBtn) this.addHandler(confirmCloseBtn, 'click', () => this.resolveConfirm(false));
        if (confirmDialog) this.addHandler(confirmDialog, 'click', (e) => {
            if (e.target === confirmDialog) this.resolveConfirm(false);
        });

        // Prompt Dialog handlers
        const promptDialog = document.getElementById('promptDialog');
        const promptOkBtn = document.getElementById('promptOkBtn');
        const promptCancelBtn = document.getElementById('promptCancelBtn');
        const promptInput = document.getElementById('promptInput');

        if (promptOkBtn) this.addHandler(promptOkBtn, 'click', () => this.resolvePrompt(promptInput?.value || ''));
        if (promptCancelBtn) this.addHandler(promptCancelBtn, 'click', () => this.resolvePrompt(null));
        const promptCloseBtn = promptDialog?.querySelector('.dialog-close-btn');
        if (promptCloseBtn) this.addHandler(promptCloseBtn, 'click', () => this.resolvePrompt(null));
        if (promptDialog) this.addHandler(promptDialog, 'click', (e) => {
            if (e.target === promptDialog) this.resolvePrompt(null);
        });
        if (promptInput) this.addHandler(promptInput, 'keydown', (e) => {
            if (e.key === 'Enter') this.resolvePrompt(promptInput?.value || '');
            if (e.key === 'Escape') this.resolvePrompt(null);
        });

        // File Dialog handlers
        const fileDialog = document.getElementById('fileDialog');
        const fileDialogOkBtn = document.getElementById('fileDialogOkBtn');
        const fileDialogCancelBtn = document.getElementById('fileDialogCancelBtn');
        const fileDialogUp = document.getElementById('fileDialogUp');
        const fileDialogNewFolder = document.getElementById('fileDialogNewFolder');
        const fileDialogFilename = document.getElementById('fileDialogFilename');
        const fileDialogPathSelect = document.getElementById('fileDialogPathSelect');

        if (fileDialogOkBtn) this.addHandler(fileDialogOkBtn, 'click', () => this.resolveFileDialog());
        if (fileDialogCancelBtn) this.addHandler(fileDialogCancelBtn, 'click', () => this.cancelFileDialog());
        const fileCloseBtn = fileDialog?.querySelector('.dialog-close-btn');
        if (fileCloseBtn) this.addHandler(fileCloseBtn, 'click', () => this.cancelFileDialog());
        if (fileDialogUp) this.addHandler(fileDialogUp, 'click', () => this.fileDialogNavigateUp());
        if (fileDialogNewFolder) this.addHandler(fileDialogNewFolder, 'click', () => this.fileDialogCreateFolder());
        if (fileDialogPathSelect) this.addHandler(fileDialogPathSelect, 'change', (e) => this.fileDialogNavigateTo(e.target.value));
        if (fileDialogFilename) this.addHandler(fileDialogFilename, 'keydown', (e) => {
            if (e.key === 'Enter') this.resolveFileDialog();
            if (e.key === 'Escape') this.cancelFileDialog();
        });
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        this.addHandler(document, 'keydown', (e) => {
            // Win+R or Ctrl+R = Run dialog
            if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
                e.preventDefault();
                this.showRunDialog();
            }
        });
    }

    /**
     * Show Run dialog
     */
    showRunDialog() {
        const dialog = document.getElementById('runDialog');
        const input = document.getElementById('runInput');
        if (dialog) {
            dialog.classList.add('active');
            this.runDialogOpen = true;
            input?.focus();
            if (input) input.value = '';
            EventBus.emit(Events.SOUND_PLAY, { type: 'open' });
        }
    }

    /**
     * Hide Run dialog
     */
    hideRunDialog() {
        const dialog = document.getElementById('runDialog');
        if (dialog) {
            dialog.classList.remove('active');
            this.runDialogOpen = false;
        }
    }

    /**
     * Execute the run command
     */
    executeRunCommand() {
        const input = document.getElementById('runInput');
        const command = input?.value.trim().toLowerCase();

        if (!command) {
            this.hideRunDialog();
            return;
        }

        // Map common commands to apps
        const appMap = {
            'notepad': 'notepad',
            'notepad.exe': 'notepad',
            'calc': 'calculator',
            'calc.exe': 'calculator',
            'calculator': 'calculator',
            'cmd': 'terminal',
            'cmd.exe': 'terminal',
            'terminal': 'terminal',
            'command': 'terminal',
            'paint': 'paint',
            'mspaint': 'paint',
            'mspaint.exe': 'paint',
            'explorer': 'mycomputer',
            'explorer.exe': 'mycomputer',
            'iexplore': 'browser',
            'iexplore.exe': 'browser',
            'internet': 'browser',
            'browser': 'browser',
            'control': 'controlpanel',
            'control.exe': 'controlpanel',
            'minesweeper': 'minesweeper',
            'winmine': 'minesweeper',
            'winmine.exe': 'minesweeper',
            'snake': 'snake',
            'asteroids': 'asteroids',
            'solitaire': 'solitaire',
            'sol': 'solitaire',
            'sol.exe': 'solitaire',
            'doom': 'doom',
            'doom.exe': 'doom',
            'mediaplayer': 'mediaplayer',
            'wmplayer': 'mediaplayer',
            'wmplayer.exe': 'mediaplayer',
            'taskmgr': 'taskmgr',
            'taskmgr.exe': 'taskmgr',
        };

        // Check if it's a URL
        if (command.startsWith('http://') || command.startsWith('https://') || command.includes('.com') || command.includes('.org') || command.includes('.net')) {
            let url = command;
            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }
            AppRegistry.launch('browser', { url: url });
            this.hideRunDialog();
            return;
        }

        // Check for mapped apps
        const appId = appMap[command];
        if (appId) {
            AppRegistry.launch(appId);
            this.hideRunDialog();
            return;
        }

        // Try to launch as-is
        if (AppRegistry.launch(command)) {
            this.hideRunDialog();
            return;
        }

        // Unknown command
        EventBus.emit('dialog:alert', {
            message: `Cannot find '${command}'. Make sure you typed the name correctly, and then try again.`,
            icon: 'error'
        });
        this.hideRunDialog();
    }

    /**
     * Show Shutdown dialog
     */
    showShutdownDialog() {
        const dialog = document.getElementById('shutdownDialog');
        if (dialog) {
            dialog.classList.add('active');
            this.shutdownDialogOpen = true;
            EventBus.emit(Events.SOUND_PLAY, { type: 'open' });
        }
    }

    /**
     * Hide Shutdown dialog
     */
    hideShutdownDialog() {
        const dialog = document.getElementById('shutdownDialog');
        if (dialog) {
            dialog.classList.remove('active');
            this.shutdownDialogOpen = false;
        }
    }

    /**
     * Execute shutdown action
     */
    executeShutdown() {
        const selectedOption = document.querySelector('input[name="shutdownOption"]:checked')?.value;

        this.hideShutdownDialog();

        switch (selectedOption) {
            case 'shutdown':
                this.performShutdown();
                break;
            case 'restart':
                this.performRestart();
                break;
            case 'logoff':
                this.performLogoff();
                break;
        }
    }

    /**
     * Create the Windows flag logo HTML used across shutdown phases
     */
    _createFlagLogo() {
        return `<div class="shutdown-logo-flag">
            <div class="flag-r"></div><div class="flag-g"></div>
            <div class="flag-b"></div><div class="flag-y"></div>
        </div>`;
    }

    /**
     * Run the shutdown progress step animation.
     * Reveals each list item one-by-one with a brief active state.
     * @param {HTMLUListElement} list - the <ul> containing <li> steps
     * @returns {Promise} resolves when all steps are done
     */
    _animateProgressSteps(list) {
        const items = list.querySelectorAll('li');
        let i = 0;
        return new Promise((resolve) => {
            const next = () => {
                if (i >= items.length) { resolve(); return; }
                const item = items[i];
                item.classList.add('visible', 'active');
                const delay = 400 + Math.random() * 600;
                setTimeout(() => {
                    item.classList.remove('active');
                    item.classList.add('done');
                    i++;
                    next();
                }, delay);
            };
            next();
        });
    }

    /**
     * Transition the shutdown screen between phases with a brief fade.
     * @param {HTMLElement} screen
     * @param {string} fromPhase
     * @param {string} toPhase
     * @param {string} newInnerHTML
     * @returns {Promise}
     */
    _transitionPhase(screen, fromPhase, toPhase, newInnerHTML) {
        return new Promise((resolve) => {
            screen.classList.add('fading');
            setTimeout(() => {
                screen.classList.remove('fading', fromPhase);
                screen.innerHTML = newInnerHTML;
                screen.classList.add(toPhase);
                // Force reflow so the opacity transition fires
                screen.offsetHeight;
                screen.classList.remove('fading');
                resolve();
            }, 600);
        });
    }

    /**
     * Perform shutdown animation — realistic Windows 95 multi-phase sequence.
     *
     * Phase 1: "Windows is shutting down..." with logo
     * Phase 2: Progress steps (saving settings, closing services, etc.)
     * Phase 3: "It is now safe to turn off your computer."
     */
    performShutdown() {
        EventBus.emit(Events.SOUND_PLAY, { type: 'shutdown' });
        WindowManager.closeAll();

        const osName = getConfig('branding.osName', 'Windows');
        const screen = document.createElement('div');
        screen.className = 'shutdown-screen phase-shutting-down';

        // Phase 1 — "Windows is shutting down..."
        screen.innerHTML = `
            <div class="shutdown-logo">
                ${this._createFlagLogo()}
                <div class="shutdown-phase-text">${osName} is shutting down...</div>
            </div>
        `;
        document.body.appendChild(screen);
        setTimeout(() => screen.classList.add('active'), 50);

        // Phase 2 — Progress steps
        setTimeout(async () => {
            await this._transitionPhase(screen, 'phase-shutting-down', 'phase-saving', `
                <div class="shutdown-logo">
                    ${this._createFlagLogo()}
                    <div class="shutdown-phase-text">Please wait while your computer shuts down.</div>
                    <ul class="shutdown-progress-list">
                        <li>Saving your settings...</li>
                        <li>Closing network connections...</li>
                        <li>Flushing disk cache...</li>
                        <li>Preparing to shut down...</li>
                    </ul>
                </div>
            `);

            const list = screen.querySelector('.shutdown-progress-list');
            await this._animateProgressSteps(list);

            // Phase 3 — "It is now safe to turn off your computer."
            setTimeout(async () => {
                const safeMsg = getConfig('branding.shutdownMessage', 'It is now safe to turn off<br>your computer.');
                await this._transitionPhase(screen, 'phase-saving', 'phase-safe', `
                    <div class="shutdown-safe-content">
                        ${this._createFlagLogo()}
                        <div class="shutdown-safe-text">${safeMsg}</div>
                        <div class="shutdown-safe-hint">Click anywhere to restart</div>
                    </div>
                `);

                screen.addEventListener('click', () => location.reload());
            }, 500);
        }, 2200);
    }

    /**
     * Perform restart — same shutdown sequence but reloads instead of
     * showing the "safe to turn off" screen.
     */
    performRestart() {
        EventBus.emit(Events.SOUND_PLAY, { type: 'shutdown' });
        WindowManager.closeAll();

        const osName = getConfig('branding.osName', 'Windows');
        const screen = document.createElement('div');
        screen.className = 'shutdown-screen phase-shutting-down';

        screen.innerHTML = `
            <div class="shutdown-logo">
                ${this._createFlagLogo()}
                <div class="shutdown-phase-text">${osName} is shutting down...</div>
                <div class="shutdown-phase-subtext">Your computer will restart automatically.</div>
            </div>
        `;
        document.body.appendChild(screen);
        setTimeout(() => screen.classList.add('active'), 50);

        // Progress phase
        setTimeout(async () => {
            await this._transitionPhase(screen, 'phase-shutting-down', 'phase-saving', `
                <div class="shutdown-logo">
                    ${this._createFlagLogo()}
                    <div class="shutdown-phase-text">Please wait while your computer shuts down.</div>
                    <ul class="shutdown-progress-list">
                        <li>Saving your settings...</li>
                        <li>Closing network connections...</li>
                        <li>Preparing to restart...</li>
                    </ul>
                </div>
            `);

            const list = screen.querySelector('.shutdown-progress-list');
            await this._animateProgressSteps(list);

            // Brief black screen then reload
            setTimeout(() => {
                screen.classList.add('fading');
                setTimeout(() => {
                    screen.style.background = '#000';
                    screen.innerHTML = '';
                    screen.classList.remove('fading', 'phase-saving');
                    screen.classList.add('active');
                    setTimeout(() => location.reload(), 800);
                }, 600);
            }, 400);
        }, 2200);
    }

    /**
     * Perform log off — shows a "Logging off..." overlay with progress steps,
     * clears user state, then returns to the login screen.
     */
    performLogoff() {
        EventBus.emit(Events.SOUND_PLAY, { type: 'shutdown' });
        WindowManager.closeAll();

        const userName = StateManager.getState('user.userName') || 'User';
        const screen = document.createElement('div');
        screen.className = 'shutdown-screen phase-logoff';
        screen.innerHTML = `
            <div class="shutdown-logo">
                ${this._createFlagLogo()}
                <div class="logoff-text">Logging off ${userName}...</div>
                <ul class="shutdown-progress-list">
                    <li>Saving your settings...</li>
                    <li>Closing applications...</li>
                    <li>Logging off...</li>
                </ul>
            </div>
        `;
        document.body.appendChild(screen);
        setTimeout(() => screen.classList.add('active'), 50);

        setTimeout(async () => {
            const list = screen.querySelector('.shutdown-progress-list');
            await this._animateProgressSteps(list);

            // Clear user state
            StateManager.setState('user.isAdmin', false, true);
            StateManager.setState('user.seenWelcome', false, true);
            StateManager.setState('user.userName', null, true);
            StateManager.setState('user.loginMode', null, true);

            // Tear down realtime channels, presence, session token, and
            // volatile in-memory state. Before this, sockets stayed open
            // with the previous user's token and the next user briefly saw
            // the previous user's icons/windows after login resolved.
            await SessionManager.logout({ reason: 'logoff' });

            // Fade out the logoff overlay
            screen.classList.add('fading');
            await new Promise(r => setTimeout(r, 600));
            screen.remove();

            // Show the login screen
            const loginResult = await LoginScreen.show();
            StateManager.setState('user.userName', loginResult.username, true);
            StateManager.setState('user.loginMode', loginResult.mode, true);
            EventBus.emit(Events.USER_LOGIN, {
                username: loginResult.username,
                mode: loginResult.mode
            });
        }, 800);
    }

    /**
     * Show About dialog
     */
    showAboutDialog() {
        const dialog = document.getElementById('aboutDialog');
        if (dialog) {
            dialog.classList.add('active');
            EventBus.emit(Events.SOUND_PLAY, { type: 'open' });
        }
    }

    /**
     * Hide About dialog
     */
    hideAboutDialog() {
        const dialog = document.getElementById('aboutDialog');
        if (dialog) {
            dialog.classList.remove('active');
        }
    }

    /**
     * Show Welcome dialog
     */
    showWelcomeDialog() {
        const dialog = document.getElementById('welcomeDialog');
        if (dialog) {
            dialog.classList.add('active');
            EventBus.emit(Events.SOUND_PLAY, { type: 'notify' });
        }
    }

    /**
     * Hide Welcome dialog
     */
    hideWelcomeDialog() {
        const dialog = document.getElementById('welcomeDialog');
        if (dialog) {
            const wasActive = dialog.classList.contains('active');
            dialog.classList.remove('active');
            if (wasActive) {
                EventBus.emit('dialog:welcome:dismissed', { timestamp: Date.now() });
            }
        }
    }

    // ==================== ALERT DIALOG ====================

    /**
     * Show alert dialog (replaces browser alert)
     * @param {Object} options - { message, title, icon, requestId }
     * @returns {Promise} Resolves when OK is clicked
     */
    showAlert(options = {}) {
        // Store requestId for response
        this.alertRequestId = options.requestId || null;

        return new Promise((resolve) => {
            // Resolve any pending alert before replacing the resolver
            if (this.alertResolver) {
                this.alertResolver();
            }
            this.alertResolver = resolve;

            const dialog = document.getElementById('alertDialog');
            const titleEl = document.getElementById('alertTitle');
            const messageEl = document.getElementById('alertMessage');
            const iconEl = document.getElementById('alertIconLarge');
            const iconSmall = document.getElementById('alertIcon');

            const icons = {
                'info': 'ℹ️',
                'warning': '⚠️',
                'error': '❌',
                'success': '✅',
                'question': '❓'
            };

            const icon = icons[options.icon] || icons.info;

            if (titleEl) titleEl.textContent = options.title || 'Message';
            if (messageEl) messageEl.textContent = options.message || '';
            if (iconEl) iconEl.textContent = icon;
            if (iconSmall) iconSmall.textContent = icon;

            if (dialog) {
                dialog.classList.add('active');
                EventBus.emit(Events.SOUND_PLAY, { type: options.icon === 'error' ? 'error' : 'notify' });
            }
        });
    }

    /**
     * Resolve alert and close dialog
     */
    resolveAlert() {
        const dialog = document.getElementById('alertDialog');
        if (dialog) {
            dialog.classList.remove('active');
        }

        // Emit response event if this was a request
        if (this.alertRequestId) {
            EventBus.emit('dialog:alert:response', {
                requestId: this.alertRequestId,
                acknowledged: true
            });
            this.alertRequestId = null;
        }

        if (this.alertResolver) {
            this.alertResolver();
            this.alertResolver = null;
        }
    }

    /**
     * Static alert helper for easy use
     * @param {string} message - Message to display
     * @param {string} title - Optional title
     * @param {string} icon - Optional icon type
     * @returns {Promise}
     */
    alert(message, title = 'Message', icon = 'info') {
        return this.showAlert({ message, title, icon });
    }

    // ==================== CONFIRM DIALOG ====================

    /**
     * Show confirm dialog (replaces browser confirm)
     * @param {Object} options - { message, title, requestId }
     * @returns {Promise<boolean>} Resolves to true/false
     */
    showConfirm(options = {}) {
        // Store requestId for response
        this.confirmRequestId = options.requestId || null;

        return new Promise((resolve) => {
            if (this.confirmResolver) {
                this.confirmResolver(false);
            }
            this.confirmResolver = resolve;

            const dialog = document.getElementById('confirmDialog');
            const titleEl = document.getElementById('confirmTitle');
            const messageEl = document.getElementById('confirmMessage');

            if (titleEl) titleEl.textContent = options.title || 'Confirm';
            if (messageEl) messageEl.textContent = options.message || 'Are you sure?';

            if (dialog) {
                dialog.classList.add('active');
                EventBus.emit(Events.SOUND_PLAY, { type: 'notify' });
            }
        });
    }

    /**
     * Resolve confirm dialog
     * @param {boolean} result - Yes or No
     */
    resolveConfirm(result) {
        const dialog = document.getElementById('confirmDialog');
        if (dialog) {
            dialog.classList.remove('active');
        }

        // Emit response event if this was a request
        if (this.confirmRequestId) {
            EventBus.emit('dialog:confirm:response', {
                requestId: this.confirmRequestId,
                result: result,
                confirmed: result
            });
            this.confirmRequestId = null;
        }

        if (this.confirmResolver) {
            this.confirmResolver(result);
            this.confirmResolver = null;
        }
    }

    /**
     * Static confirm helper
     * @param {string} message - Message to display
     * @param {string} title - Optional title
     * @returns {Promise<boolean>}
     */
    confirm(message, title = 'Confirm') {
        return this.showConfirm({ message, title });
    }

    // ==================== PROMPT DIALOG ====================

    /**
     * Show prompt dialog (replaces browser prompt)
     * @param {Object} options - { message, title, defaultValue, requestId }
     * @returns {Promise<string|null>} Resolves to input value or null
     */
    showPrompt(options = {}) {
        // Store requestId for response
        this.promptRequestId = options.requestId || null;

        return new Promise((resolve) => {
            if (this.promptResolver) {
                this.promptResolver(null);
            }
            this.promptResolver = resolve;

            const dialog = document.getElementById('promptDialog');
            const titleEl = document.getElementById('promptTitle');
            const messageEl = document.getElementById('promptMessage');
            const inputEl = document.getElementById('promptInput');

            if (titleEl) titleEl.textContent = options.title || 'Input';
            if (messageEl) messageEl.textContent = options.message || 'Enter a value:';
            if (inputEl) {
                inputEl.value = options.defaultValue || '';
                setTimeout(() => inputEl.focus(), 100);
            }

            if (dialog) {
                dialog.classList.add('active');
                EventBus.emit(Events.SOUND_PLAY, { type: 'notify' });
            }
        });
    }

    /**
     * Resolve prompt dialog
     * @param {string|null} value - Input value or null if cancelled
     */
    resolvePrompt(value) {
        const dialog = document.getElementById('promptDialog');
        if (dialog) {
            dialog.classList.remove('active');
        }

        // Emit response event if this was a request
        if (this.promptRequestId) {
            EventBus.emit('dialog:prompt:response', {
                requestId: this.promptRequestId,
                value: value,
                cancelled: value === null
            });
            this.promptRequestId = null;
        }

        if (this.promptResolver) {
            this.promptResolver(value);
            this.promptResolver = null;
        }
    }

    /**
     * Static prompt helper
     * @param {string} message - Message to display
     * @param {string} defaultValue - Default value
     * @param {string} title - Optional title
     * @returns {Promise<string|null>}
     */
    prompt(message, defaultValue = '', title = 'Input') {
        return this.showPrompt({ message, title, defaultValue });
    }

    // ==================== FILE DIALOG ====================

    /**
     * Show file open dialog
     * @param {Object} options - { title, filter, initialPath }
     * @returns {Promise<{path: string[], filename: string}|null>}
     */
    showFileOpen(options = {}) {
        return this.showFileDialog({ ...options, mode: 'open' });
    }

    /**
     * Show file save dialog
     * @param {Object} options - { title, filter, initialPath, defaultFilename }
     * @returns {Promise<{path: string[], filename: string}|null>}
     */
    showFileSave(options = {}) {
        return this.showFileDialog({ ...options, mode: 'save' });
    }

    /**
     * Show file dialog (internal)
     * @param {Object} options - Dialog options including requestId
     * @returns {Promise}
     */
    showFileDialog(options = {}) {
        // Store requestId for response
        this.fileDialogRequestId = options.requestId || null;

        return new Promise((resolve) => {
            this.fileDialogResolver = resolve;
            this.fileDialogMode = options.mode || 'open';

            const dialog = document.getElementById('fileDialog');
            const titleEl = document.getElementById('fileDialogTitle');
            const iconEl = document.getElementById('fileDialogIcon');
            const okBtn = document.getElementById('fileDialogOkBtn');
            const filenameInput = document.getElementById('fileDialogFilename');
            const filetypeSelect = document.getElementById('fileDialogFiletype');

            // Set title and button text based on mode
            if (titleEl) titleEl.textContent = options.title || (options.mode === 'save' ? 'Save As' : 'Open');
            if (iconEl) iconEl.textContent = options.mode === 'save' ? '💾' : '📂';
            if (okBtn) okBtn.textContent = options.mode === 'save' ? 'Save' : 'Open';

            // Set initial path
            if (options.initialPath && Array.isArray(options.initialPath)) {
                this.currentFilePath = [...options.initialPath];
            } else {
                this.currentFilePath = [...PATHS.DOCUMENTS];
            }

            // Set default filename
            if (filenameInput) {
                filenameInput.value = options.defaultFilename || '';
            }

            // Set filter
            if (filetypeSelect && options.filter) {
                filetypeSelect.value = options.filter;
            }

            // Populate file browser
            this.updateFileDialogBrowser();

            if (dialog) {
                dialog.classList.add('active');
                EventBus.emit(Events.SOUND_PLAY, { type: 'open' });
            }
        });
    }

    /**
     * Update file dialog browser with current path contents
     */
    updateFileDialogBrowser() {
        const browser = document.getElementById('fileDialogBrowser');
        const pathSelect = document.getElementById('fileDialogPathSelect');
        const filetypeSelect = document.getElementById('fileDialogFiletype');

        if (!browser) return;

        // Update path dropdown
        if (pathSelect) {
            const pathStr = this.currentFilePath.join('\\');
            pathSelect.innerHTML = `<option value="${escapeHtml(pathStr)}">${this.getPathIcon(this.currentFilePath)} ${escapeHtml(pathStr)}</option>`;
        }

        try {
            const items = FileSystemManager.listDirectory(this.currentFilePath);
            const filter = filetypeSelect?.value || '*';

            // Sort: directories first, then files
            const sorted = items.sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });

            // Filter files by type
            const filtered = sorted.filter(item => {
                if (item.type === 'directory') return true;
                if (filter === '*') return true;
                return item.extension === filter;
            });

            browser.innerHTML = filtered.map(item => {
                const icon = this.getFileIcon(item);
                const isDir = item.type === 'directory';
                return `
                    <div class="file-dialog-item ${isDir ? 'directory' : 'file'}"
                         data-name="${escapeHtml(item.name)}"
                         data-type="${escapeHtml(item.type)}">
                        <span class="file-dialog-item-icon">${icon}</span>
                        <span class="file-dialog-item-name">${escapeHtml(item.name)}</span>
                    </div>
                `;
            }).join('');

            // Attach click handlers
            browser.querySelectorAll('.file-dialog-item').forEach(el => {
                el.addEventListener('click', () => {
                    // Deselect others
                    browser.querySelectorAll('.file-dialog-item').forEach(i => i.classList.remove('selected'));
                    el.classList.add('selected');

                    // Set filename for files
                    const name = el.dataset.name;
                    const type = el.dataset.type;
                    if (type !== 'directory') {
                        const filenameInput = document.getElementById('fileDialogFilename');
                        if (filenameInput) filenameInput.value = name;
                    }
                });

                el.addEventListener('dblclick', () => {
                    const name = el.dataset.name;
                    const type = el.dataset.type;
                    if (type === 'directory') {
                        this.currentFilePath.push(name);
                        this.updateFileDialogBrowser();
                    } else {
                        // Double-click on file = open/save it
                        const filenameInput = document.getElementById('fileDialogFilename');
                        if (filenameInput) filenameInput.value = name;
                        this.resolveFileDialog();
                    }
                });
            });

        } catch (e) {
            browser.innerHTML = `<div class="file-dialog-error">Unable to read directory</div>`;
        }
    }

    /**
     * Get icon for file item
     */
    getFileIcon(item) {
        if (item.type === 'directory') return '📁';
        switch (item.extension) {
            case 'txt': case 'md': case 'log': return '📝';
            case 'png': case 'jpg': case 'bmp': case 'gif': return '🖼️';
            case 'exe': return '⚙️';
            case 'lnk': return '🔗';
            case 'mp3': case 'wav': return '🎵';
            default: return '📄';
        }
    }

    /**
     * Get icon for path
     */
    getPathIcon(path) {
        if (path.length === 1) return '💾';
        const lastPart = path[path.length - 1];
        if (lastPart === 'Desktop') return '🖥️';
        if (lastPart === 'Documents') return '📄';
        if (lastPart === 'Pictures') return '🖼️';
        if (lastPart === 'Music') return '🎵';
        return '📁';
    }

    /**
     * Navigate up one directory
     */
    fileDialogNavigateUp() {
        if (this.currentFilePath.length > 1) {
            this.currentFilePath.pop();
            this.updateFileDialogBrowser();
        }
    }

    /**
     * Navigate to a specific path
     */
    fileDialogNavigateTo(pathStr) {
        this.currentFilePath = pathStr.split('\\');
        this.updateFileDialogBrowser();
    }

    /**
     * Create a new folder in file dialog
     */
    async fileDialogCreateFolder() {
        const folderName = await this.prompt('Enter folder name:', 'New Folder', 'New Folder');
        if (folderName) {
            try {
                FileSystemManager.createDirectory([...this.currentFilePath, folderName]);
                this.updateFileDialogBrowser();
            } catch (e) {
                await this.alert(`Error creating folder: ${e.message}`, 'Error', 'error');
            }
        }
    }

    /**
     * Resolve file dialog with selected file
     */
    resolveFileDialog() {
        const filenameInput = document.getElementById('fileDialogFilename');
        const filename = filenameInput?.value?.trim();

        if (!filename) {
            this.alert('Please enter a filename.', 'Error', 'error');
            return;
        }

        const dialog = document.getElementById('fileDialog');
        if (dialog) {
            dialog.classList.remove('active');
        }

        const result = {
            path: [...this.currentFilePath],
            filename: filename,
            fullPath: [...this.currentFilePath, filename]
        };

        // Emit response event if this was a request
        if (this.fileDialogRequestId) {
            const responseEvent = this.fileDialogMode === 'save'
                ? 'dialog:file-save:response'
                : 'dialog:file-open:response';
            EventBus.emit(responseEvent, {
                requestId: this.fileDialogRequestId,
                ...result,
                cancelled: false
            });
            this.fileDialogRequestId = null;
        }

        if (this.fileDialogResolver) {
            this.fileDialogResolver(result);
            this.fileDialogResolver = null;
        }
    }

    /**
     * Cancel file dialog
     */
    cancelFileDialog() {
        const dialog = document.getElementById('fileDialog');
        if (dialog) {
            dialog.classList.remove('active');
        }

        // Emit response event if this was a request
        if (this.fileDialogRequestId) {
            const responseEvent = this.fileDialogMode === 'save'
                ? 'dialog:file-save:response'
                : 'dialog:file-open:response';
            EventBus.emit(responseEvent, {
                requestId: this.fileDialogRequestId,
                cancelled: true,
                path: null,
                filename: null,
                fullPath: null
            });
            this.fileDialogRequestId = null;
        }

        if (this.fileDialogResolver) {
            this.fileDialogResolver(null);
            this.fileDialogResolver = null;
        }
    }
}

// Create and export singleton instance
const SystemDialogsInstance = new SystemDialogs();
export default SystemDialogsInstance;
