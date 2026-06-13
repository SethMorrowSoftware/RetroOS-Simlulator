/**
 * Run Dialog - Windows 95 Style Run Command
 * Type a program name or URL to launch it
 */

import AppBase from './AppBase.js';
import AppRegistry from './AppRegistry.js';
import EventBus from '../core/EventBus.js';
import { getConfig } from '../core/ConfigLoader.js';

class RunDialog extends AppBase {
    constructor() {
        super({
            id: 'run',
            name: 'Run',
            icon: '▶️',
            width: 430,
            height: 215,
            resizable: false,
            singleton: true,
            category: 'system',
            showInMenu: false
        });

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('execute', (payload) => {
            if (!payload || !payload.command) return { success: false, error: 'No command provided' };
            const errorEl = this.getElement('#run-error');
            this.executeCommand(payload.command, errorEl);
            return { success: true, command: payload.command };
        });

        this.registerCommand('setInput', (payload) => {
            if (!payload || payload.text === undefined) return { success: false, error: 'No text provided' };
            // The input's id is run-command; .run-input is only a CSS class.
            const input = this.getElement('#run-command');
            if (input) input.value = payload.text;
            return { success: true, applied: !!input };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getState', () => {
            const input = this.getElement('#run-command');
            return { currentInput: input ? input.value : '' };
        });
    }

    onOpen() {
        return `
            <style>
                .run-dialog {
                    padding: 16px;
                    background: #c0c0c0;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    font-size: 13px;
                }
                .run-description {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                .run-icon {
                    font-size: 32px;
                    flex-shrink: 0;
                }
                .run-text {
                    font-size: 13px;
                    line-height: 1.4;
                }
                .run-input-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 16px;
                }
                .run-input-row label {
                    font-size: 13px;
                    white-space: nowrap;
                }
                .run-input {
                    flex: 1;
                    padding: 4px 6px;
                    border: 2px inset #fff;
                    font-size: 13px;
                    font-family: 'MS Sans Serif', 'Segoe UI', Tahoma, sans-serif;
                    background: #fff;
                }
                .run-input:focus {
                    outline: none;
                }
                .run-buttons {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: auto;
                }
                .run-button {
                    padding: 4px 20px;
                    background: #c0c0c0;
                    border: 2px outset #fff;
                    cursor: pointer;
                    font-size: 13px;
                    font-family: 'MS Sans Serif', 'Segoe UI', Tahoma, sans-serif;
                    min-width: 75px;
                }
                .run-button:active {
                    border-style: inset;
                }
                .run-button:focus {
                    outline: 1px dotted #000;
                    outline-offset: -4px;
                }
                .run-error {
                    color: #cc0000;
                    font-size: 12px;
                    margin-top: 4px;
                    min-height: 16px;
                }
            </style>

            <div class="run-dialog">
                <div class="run-description">
                    <div class="run-icon">📦</div>
                    <div class="run-text">
                        Type the name of a program, and ${getConfig('branding.osName', 'IlluminatOS!')} will open it for you.
                    </div>
                </div>

                <div class="run-input-row">
                    <label for="run-command">Open:</label>
                    <input type="text" class="run-input" id="run-command"
                           placeholder="e.g. notepad, calculator, terminal"
                           autocomplete="off" spellcheck="false">
                </div>
                <div class="run-error" id="run-error"></div>

                <div class="run-buttons">
                    <button class="run-button" id="run-ok">OK</button>
                    <button class="run-button" id="run-cancel">Cancel</button>
                </div>
            </div>
        `;
    }

    onMount() {
        const input = this.getElement('#run-command');
        const okBtn = this.getElement('#run-ok');
        const cancelBtn = this.getElement('#run-cancel');
        const errorEl = this.getElement('#run-error');

        if (input) {
            // Focus the input field
            setTimeout(() => input.focus(), 100);

            // Enter key submits
            this.addHandler(input, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.executeCommand(input.value.trim(), errorEl);
                } else if (e.key === 'Escape') {
                    this.close();
                }
            });

            // Clear error on typing
            this.addHandler(input, 'input', () => {
                if (errorEl) errorEl.textContent = '';
            });
        }

        if (okBtn) {
            this.addHandler(okBtn, 'click', () => {
                this.executeCommand(input ? input.value.trim() : '', errorEl);
            });
        }

        if (cancelBtn) {
            this.addHandler(cancelBtn, 'click', () => {
                this.close();
            });
        }
    }

    /**
     * Execute the typed command
     * @param {string} command - The command string
     * @param {HTMLElement} errorEl - Error display element
     */
    executeCommand(command, errorEl) {
        if (!command) {
            if (errorEl) errorEl.textContent = 'Please type a program name or URL.';
            this.playSound('error');
            return;
        }

        // Check if it's a URL
        if (command.startsWith('http://') || command.startsWith('https://') || command.startsWith('www.')) {
            const url = command.startsWith('www.') ? 'https://' + command : command;
            AppRegistry.launch('browser', { url });
            this.playSound('click');
            this.emitAppEvent('executed', { command, type: 'url', resolved: 'browser' });
            this.close();
            return;
        }

        // Normalize the command: lowercase, trim whitespace
        const normalized = command.toLowerCase().replace(/\.exe$/, '');

        // Try direct app ID match
        const directMatch = AppRegistry.get(normalized);
        if (directMatch) {
            AppRegistry.launch(normalized);
            this.playSound('click');
            this.emitAppEvent('executed', { command, type: 'app', resolved: normalized });
            this.close();
            return;
        }

        // Try matching by app name (case-insensitive)
        const allApps = AppRegistry.getAll();
        const nameMatch = allApps.find(app =>
            app.name.toLowerCase() === normalized
        );
        if (nameMatch) {
            AppRegistry.launch(nameMatch.id);
            this.playSound('click');
            this.emitAppEvent('executed', { command, type: 'app', resolved: nameMatch.id });
            this.close();
            return;
        }

        // Try partial name match
        const partialMatch = allApps.find(app =>
            app.name.toLowerCase().includes(normalized) ||
            app.id.includes(normalized)
        );
        if (partialMatch) {
            AppRegistry.launch(partialMatch.id);
            this.playSound('click');
            this.emitAppEvent('executed', { command, type: 'app', resolved: partialMatch.id });
            this.close();
            return;
        }

        // No match found
        this.playSound('error');
        this.emitAppEvent('execute:failed', { command, error: 'not found' });
        if (errorEl) {
            errorEl.textContent = `Cannot find "${command}". Make sure you typed the name correctly.`;
        }
    }
}

export default RunDialog;
